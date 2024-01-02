/* eslint-disable max-lines */
import type {
  Breadcrumb,
  BreadcrumbHint,
  Client,
  CustomSamplingContext,
  Event,
  EventHint,
  Extra,
  Extras,
  Hub as HubInterface,
  Integration,
  IntegrationClass,
  Primitive,
  Session,
  SessionContext,
  Severity,
  SeverityLevel,
  Transaction,
  TransactionContext,
  User,
} from '@sentry/types';
import {
  GLOBAL_OBJ,
  consoleSandbox,
  dateTimestampInSeconds,
  getGlobalSingleton,
  isThenable,
  logger,
  uuid4,
} from '@sentry/utils';

import { DEFAULT_ENVIRONMENT } from './constants';
import { DEBUG_BUILD } from './debug-build';
import { Scope } from './scope';
import { closeSession, makeSession, updateSession } from './session';
import { SDK_VERSION } from './version';

/**
 * API compatibility version of this hub.
 *
 * WARNING: This number should only be increased when the global interface
 * changes and new methods are introduced.
 *
 * @hidden
 */
export const API_VERSION = parseFloat(SDK_VERSION);

/**
 * Default maximum number of breadcrumbs added to an event. Can be overwritten
 * with {@link Options.maxBreadcrumbs}.
 */
const DEFAULT_BREADCRUMBS = 100;

export interface RunWithAsyncContextOptions {
  /** Whether to reuse an existing async context if one exists. Defaults to false. */
  reuseExisting?: boolean;
}

/**
 * @private Private API with no semver guarantees!
 *
 * Strategy used to track async context.
 */
export interface AsyncContextStrategy {
  /**
   * Gets the current async context. Returns undefined if there is no current async context.
   */
  getCurrentHub: () => Hub | undefined;
  /**
   * Runs the supplied callback in its own async context.
   */
  runWithAsyncContext<T>(callback: () => T, options: RunWithAsyncContextOptions): T;
}

/**
 * A layer in the process stack.
 * @hidden
 */
export interface Layer {
  client?: Client;
  scope: Scope;
}

/**
 * An object that contains a hub and maintains a scope stack.
 * @hidden
 */
export interface Carrier {
  __SENTRY__?: {
    hub?: Hub;
    acs?: AsyncContextStrategy;
    /**
     * Extra Hub properties injected by various SDKs
     */
    integrations?: Integration[];
    extensions?: {
      /** Extension methods for the hub, which are bound to the current Hub instance */
      // eslint-disable-next-line @typescript-eslint/ban-types
      [key: string]: Function;
    };
  };
}

/**
 * @inheritDoc
 */
export class Hub implements HubInterface {
  /** Is a {@link Layer}[] containing the client and scope */
  private readonly _stack: Layer[];

  /** Contains the last event id of a captured event.  */
  private _lastEventId?: string;

  private _isolationScope: Scope;

  /**
   * Creates a new instance of the hub, will push one {@link Layer} into the
   * internal stack on creation.
   *
   * @param client bound to the hub.
   * @param scope bound to the hub.
   * @param version number, higher number means higher priority.
   */
  public constructor(
    client?: Client,
    scope: Scope = new Scope(),
    isolationScope = new Scope(),
    private readonly _version: number = API_VERSION,
  ) {
    this._stack = [{ scope }];
    if (client) {
      this.bindClient(client);
    }

    this._isolationScope = isolationScope;
  }

  /**
   * @inheritDoc
   */
  public isOlderThan(version: number): boolean {
    return this._version < version;
  }

  /**
   * @inheritDoc
   */
  public bindClient(client?: Client): void {
    const top = this.getStackTop();
    top.client = client;
    if (client && client.setupIntegrations) {
      client.setupIntegrations();
    }
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `withScope` instead.
   */
  public pushScope(): Scope {
    // We want to clone the content of prev scope
    const scope = this.getScope().clone();
    this.getStack().push({
      client: this.getClient(),
      scope,
    });
    return scope;
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `withScope` instead.
   */
  public popScope(): boolean {
    if (this.getStack().length <= 1) return false;
    return !!this.getStack().pop();
  }

  /**
   * @inheritDoc
   */
  public withScope<T>(callback: (scope: Scope) => T): T {
    // eslint-disable-next-line deprecation/deprecation
    const scope = this.pushScope();

    let maybePromiseResult: T;
    try {
      maybePromiseResult = callback(scope);
    } catch (e) {
      // eslint-disable-next-line deprecation/deprecation
      this.popScope();
      throw e;
    }

    if (isThenable(maybePromiseResult)) {
      // @ts-expect-error - isThenable returns the wrong type
      return maybePromiseResult.then(
        res => {
          // eslint-disable-next-line deprecation/deprecation
          this.popScope();
          return res;
        },
        e => {
          // eslint-disable-next-line deprecation/deprecation
          this.popScope();
          throw e;
        },
      );
    }

    // eslint-disable-next-line deprecation/deprecation
    this.popScope();
    return maybePromiseResult;
  }

  /**
   * @inheritDoc
   */
  public getClient<C extends Client>(): C | undefined {
    return this.getStackTop().client as C;
  }

  /** Returns the scope of the top stack. */
  public getScope(): Scope {
    return this.getStackTop().scope;
  }

  /** @inheritdoc */
  public getIsolationScope(): Scope {
    return this._isolationScope;
  }

  /** Returns the scope stack for domains or the process. */
  public getStack(): Layer[] {
    return this._stack;
  }

  /** Returns the topmost scope layer in the order domain > local > process. */
  public getStackTop(): Layer {
    return this._stack[this._stack.length - 1];
  }

  /**
   * @inheritDoc
   */
  public captureException(exception: unknown, hint?: EventHint): string {
    const eventId = (this._lastEventId = hint && hint.event_id ? hint.event_id : uuid4());
    const syntheticException = new Error('Sentry syntheticException');
    this._withClient((client, scope) => {
      client.captureException(
        exception,
        {
          originalException: exception,
          syntheticException,
          ...hint,
          event_id: eventId,
        },
        scope,
      );
    });
    return eventId;
  }

  /**
   * @inheritDoc
   */
  public captureMessage(
    message: string,
    // eslint-disable-next-line deprecation/deprecation
    level?: Severity | SeverityLevel,
    hint?: EventHint,
  ): string {
    const eventId = (this._lastEventId = hint && hint.event_id ? hint.event_id : uuid4());
    const syntheticException = new Error(message);
    this._withClient((client, scope) => {
      client.captureMessage(
        message,
        level,
        {
          originalException: message,
          syntheticException,
          ...hint,
          event_id: eventId,
        },
        scope,
      );
    });
    return eventId;
  }

  /**
   * @inheritDoc
   */
  public captureEvent(event: Event, hint?: EventHint): string {
    const eventId = hint && hint.event_id ? hint.event_id : uuid4();
    if (!event.type) {
      this._lastEventId = eventId;
    }

    this._withClient((client, scope) => {
      client.captureEvent(event, { ...hint, event_id: eventId }, scope);
    });
    return eventId;
  }

  /**
   * @inheritDoc
   */
  public lastEventId(): string | undefined {
    return this._lastEventId;
  }

  /**
   * @inheritDoc
   */
  public addBreadcrumb(breadcrumb: Breadcrumb, hint?: BreadcrumbHint): void {
    const { scope, client } = this.getStackTop();

    if (!client) return;

    const { beforeBreadcrumb = null, maxBreadcrumbs = DEFAULT_BREADCRUMBS } =
      (client.getOptions && client.getOptions()) || {};

    if (maxBreadcrumbs <= 0) return;

    const timestamp = dateTimestampInSeconds();
    const mergedBreadcrumb = { timestamp, ...breadcrumb };
    const finalBreadcrumb = beforeBreadcrumb
      ? (consoleSandbox(() => beforeBreadcrumb(mergedBreadcrumb, hint)) as Breadcrumb | null)
      : mergedBreadcrumb;

    if (finalBreadcrumb === null) return;

    if (client.emit) {
      client.emit('beforeAddBreadcrumb', finalBreadcrumb, hint);
    }

    scope.addBreadcrumb(finalBreadcrumb, maxBreadcrumbs);
  }

  /**
   * @inheritDoc
   */
  public setUser(user: User | null): void {
    this.getScope().setUser(user);
  }

  /**
   * @inheritDoc
   */
  public setTags(tags: { [key: string]: Primitive }): void {
    this.getScope().setTags(tags);
  }

  /**
   * @inheritDoc
   */
  public setExtras(extras: Extras): void {
    this.getScope().setExtras(extras);
  }

  /**
   * @inheritDoc
   */
  public setTag(key: string, value: Primitive): void {
    this.getScope().setTag(key, value);
  }

  /**
   * @inheritDoc
   */
  public setExtra(key: string, extra: Extra): void {
    this.getScope().setExtra(key, extra);
  }

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public setContext(name: string, context: { [key: string]: any } | null): void {
    this.getScope().setContext(name, context);
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `getScope()` directly.
   */
  public configureScope(callback: (scope: Scope) => void): void {
    const { scope, client } = this.getStackTop();
    if (client) {
      callback(scope);
    }
  }

  /**
   * @inheritDoc
   */
  public run(callback: (hub: Hub) => void): void {
    const oldHub = makeMain(this);
    try {
      callback(this);
    } finally {
      makeMain(oldHub);
    }
  }

  /**
   * @inheritDoc
   */
  public getIntegration<T extends Integration>(integration: IntegrationClass<T>): T | null {
    const client = this.getClient();
    if (!client) return null;
    try {
      return client.getIntegration(integration);
    } catch (_oO) {
      DEBUG_BUILD && logger.warn(`Cannot retrieve integration ${integration.id} from the current Hub`);
      return null;
    }
  }

  /**
   * @inheritDoc
   */
  public startTransaction(context: TransactionContext, customSamplingContext?: CustomSamplingContext): Transaction {
    const result = this._callExtensionMethod<Transaction>('startTransaction', context, customSamplingContext);

    if (DEBUG_BUILD && !result) {
      const client = this.getClient();
      if (!client) {
        logger.warn(
          "Tracing extension 'startTransaction' is missing. You should 'init' the SDK before calling 'startTransaction'",
        );
      } else {
        logger.warn(`Tracing extension 'startTransaction' has not been added. Call 'addTracingExtensions' before calling 'init':
Sentry.addTracingExtensions();
Sentry.init({...});
`);
      }
    }

    return result;
  }

  /**
   * @inheritDoc
   */
  public traceHeaders(): { [key: string]: string } {
    return this._callExtensionMethod<{ [key: string]: string }>('traceHeaders');
  }

  /**
   * @inheritDoc
   */
  public captureSession(endSession: boolean = false): void {
    // both send the update and pull the session from the scope
    if (endSession) {
      return this.endSession();
    }

    // only send the update
    this._sendSessionUpdate();
  }

  /**
   * @inheritDoc
   */
  public endSession(): void {
    const layer = this.getStackTop();
    const scope = layer.scope;
    const session = scope.getSession();
    if (session) {
      closeSession(session);
    }
    this._sendSessionUpdate();

    // the session is over; take it off of the scope
    scope.setSession();
  }

  /**
   * @inheritDoc
   */
  public startSession(context?: SessionContext): Session {
    const { scope, client } = this.getStackTop();
    const { release, environment = DEFAULT_ENVIRONMENT } = (client && client.getOptions()) || {};

    // Will fetch userAgent if called from browser sdk
    const { userAgent } = GLOBAL_OBJ.navigator || {};

    const session = makeSession({
      release,
      environment,
      user: scope.getUser(),
      ...(userAgent && { userAgent }),
      ...context,
    });

    // End existing session if there's one
    const currentSession = scope.getSession && scope.getSession();
    if (currentSession && currentSession.status === 'ok') {
      updateSession(currentSession, { status: 'exited' });
    }
    this.endSession();

    // Afterwards we set the new session on the scope
    scope.setSession(session);

    return session;
  }

  /**
   * Returns if default PII should be sent to Sentry and propagated in ourgoing requests
   * when Tracing is used.
   */
  public shouldSendDefaultPii(): boolean {
    const client = this.getClient();
    const options = client && client.getOptions();
    return Boolean(options && options.sendDefaultPii);
  }

  /**
   * Sends the current Session on the scope
   */
  private _sendSessionUpdate(): void {
    const { scope, client } = this.getStackTop();

    const session = scope.getSession();
    if (session && client && client.captureSession) {
      client.captureSession(session);
    }
  }

  /**
   * Internal helper function to call a method on the top client if it exists.
   *
   * @param method The method to call on the client.
   * @param args Arguments to pass to the client function.
   */
  private _withClient(callback: (client: Client, scope: Scope) => void): void {
    const { scope, client } = this.getStackTop();
    if (client) {
      callback(client, scope);
    }
  }

  /**
   * Calls global extension method and binding current instance to the function call
   */
  // @ts-expect-error Function lacks ending return statement and return type does not include 'undefined'. ts(2366)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _callExtensionMethod<T>(method: string, ...args: any[]): T {
    const carrier = getMainCarrier();
    const sentry = carrier.__SENTRY__;
    if (sentry && sentry.extensions && typeof sentry.extensions[method] === 'function') {
      return sentry.extensions[method].apply(this, args);
    }
    DEBUG_BUILD && logger.warn(`Extension method ${method} couldn't be found, doing nothing.`);
  }
}

/**
 * Returns the global shim registry.
 *
 * FIXME: This function is problematic, because despite always returning a valid Carrier,
 * it has an optional `__SENTRY__` property, which then in turn requires us to always perform an unnecessary check
 * at the call-site. We always access the carrier through this function, so we can guarantee that `__SENTRY__` is there.
 **/
export function getMainCarrier(): Carrier {
  GLOBAL_OBJ.__SENTRY__ = GLOBAL_OBJ.__SENTRY__ || {
    extensions: {},
    hub: undefined,
  };
  return GLOBAL_OBJ;
}

/**
 * Replaces the current main hub with the passed one on the global object
 *
 * @returns The old replaced hub
 */
export function makeMain(hub: Hub): Hub {
  const registry = getMainCarrier();
  const oldHub = getHubFromCarrier(registry);
  setHubOnCarrier(registry, hub);
  return oldHub;
}

/**
 * Returns the default hub instance.
 *
 * If a hub is already registered in the global carrier but this module
 * contains a more recent version, it replaces the registered version.
 * Otherwise, the currently registered hub will be returned.
 */
export function getCurrentHub(): Hub {
  // Get main carrier (global for every environment)
  const registry = getMainCarrier();

  if (registry.__SENTRY__ && registry.__SENTRY__.acs) {
    const hub = registry.__SENTRY__.acs.getCurrentHub();

    if (hub) {
      return hub;
    }
  }

  // Return hub that lives on a global object
  return getGlobalHub(registry);
}

/**
 * Get the currently active isolation scope.
 * The isolation scope is active for the current exection context,
 * meaning that it will remain stable for the same Hub.
 */
export function getIsolationScope(): Scope {
  return getCurrentHub().getIsolationScope();
}

function getGlobalHub(registry: Carrier = getMainCarrier()): Hub {
  // If there's no hub, or its an old API, assign a new one
  if (!hasHubOnCarrier(registry) || getHubFromCarrier(registry).isOlderThan(API_VERSION)) {
    setHubOnCarrier(registry, new Hub());
  }

  // Return hub that lives on a global object
  return getHubFromCarrier(registry);
}

/**
 * @private Private API with no semver guarantees!
 *
 * If the carrier does not contain a hub, a new hub is created with the global hub client and scope.
 */
export function ensureHubOnCarrier(carrier: Carrier, parent: Hub = getGlobalHub()): void {
  // If there's no hub on current domain, or it's an old API, assign a new one
  if (!hasHubOnCarrier(carrier) || getHubFromCarrier(carrier).isOlderThan(API_VERSION)) {
    const client = parent.getClient();
    const scope = parent.getScope();
    const isolationScope = parent.getIsolationScope();
    setHubOnCarrier(carrier, new Hub(client, scope.clone(), isolationScope.clone()));
  }
}

/**
 * @private Private API with no semver guarantees!
 *
 * Sets the global async context strategy
 */
export function setAsyncContextStrategy(strategy: AsyncContextStrategy | undefined): void {
  // Get main carrier (global for every environment)
  const registry = getMainCarrier();
  registry.__SENTRY__ = registry.__SENTRY__ || {};
  registry.__SENTRY__.acs = strategy;
}

/**
 * Runs the supplied callback in its own async context. Async Context strategies are defined per SDK.
 *
 * @param callback The callback to run in its own async context
 * @param options Options to pass to the async context strategy
 * @returns The result of the callback
 */
export function runWithAsyncContext<T>(callback: () => T, options: RunWithAsyncContextOptions = {}): T {
  const registry = getMainCarrier();

  if (registry.__SENTRY__ && registry.__SENTRY__.acs) {
    return registry.__SENTRY__.acs.runWithAsyncContext(callback, options);
  }

  // if there was no strategy, fallback to just calling the callback
  return callback();
}

/**
 * This will tell whether a carrier has a hub on it or not
 * @param carrier object
 */
function hasHubOnCarrier(carrier: Carrier): boolean {
  return !!(carrier && carrier.__SENTRY__ && carrier.__SENTRY__.hub);
}

/**
 * This will create a new {@link Hub} and add to the passed object on
 * __SENTRY__.hub.
 * @param carrier object
 * @hidden
 */
export function getHubFromCarrier(carrier: Carrier): Hub {
  return getGlobalSingleton<Hub>('hub', () => new Hub(), carrier);
}

/**
 * This will set passed {@link Hub} on the passed object's __SENTRY__.hub attribute
 * @param carrier object
 * @param hub Hub
 * @returns A boolean indicating success or failure
 */
export function setHubOnCarrier(carrier: Carrier, hub: Hub): boolean {
  if (!carrier) return false;
  const __SENTRY__ = (carrier.__SENTRY__ = carrier.__SENTRY__ || {});
  __SENTRY__.hub = hub;
  return true;
}
