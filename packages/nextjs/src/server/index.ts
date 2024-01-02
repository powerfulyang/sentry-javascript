import * as path from 'path';
import { addTracingExtensions, getClient } from '@sentry/core';
import { RewriteFrames } from '@sentry/integrations';
import type { NodeOptions } from '@sentry/node';
import { Integrations, getCurrentScope, init as nodeInit } from '@sentry/node';
import type { EventProcessor } from '@sentry/types';
import type { IntegrationWithExclusionOption } from '@sentry/utils';
import { addOrUpdateIntegration, escapeStringForRegex, logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../common/debug-build';
import { devErrorSymbolicationEventProcessor } from '../common/devErrorSymbolicationEventProcessor';
import { getVercelEnv } from '../common/getVercelEnv';
import { buildMetadata } from '../common/metadata';
import { isBuild } from '../common/utils/isBuild';

export { createReduxEnhancer } from '@sentry/react';
export * from '@sentry/node';
export { captureUnderscoreErrorException } from '../common/_error';

/**
 * A passthrough error boundary for the server that doesn't depend on any react. Error boundaries don't catch SSR errors
 * so they should simply be a passthrough.
 */
export const ErrorBoundary = (props: React.PropsWithChildren<unknown>): React.ReactNode => {
  if (!props.children) {
    return null;
  }

  if (typeof props.children === 'function') {
    return (props.children as () => React.ReactNode)();
  }

  // since Next.js >= 10 requires React ^16.6.0 we are allowed to return children like this here
  return props.children as React.ReactNode;
};

/**
 * A passthrough error boundary wrapper for the server that doesn't depend on any react. Error boundaries don't catch
 * SSR errors so they should simply be a passthrough.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withErrorBoundary<P extends Record<string, any>>(
  WrappedComponent: React.ComponentType<P>,
): React.FC<P> {
  return WrappedComponent as React.FC<P>;
}

/**
 * Just a passthrough since we're on the server and showing the report dialog on the server doesn't make any sense.
 */
export function showReportDialog(): void {
  return;
}

const globalWithInjectedValues = global as typeof global & {
  __rewriteFramesDistDir__?: string;
};

// TODO (v8): Remove this
/**
 * @deprecated This constant will be removed in the next major update.
 */
export const IS_BUILD = isBuild();

const IS_VERCEL = !!process.env.VERCEL;

/** Inits the Sentry NextJS SDK on node. */
export function init(options: NodeOptions): void {
  addTracingExtensions();

  if (isBuild()) {
    return;
  }

  const opts = {
    environment: process.env.SENTRY_ENVIRONMENT || getVercelEnv(false) || process.env.NODE_ENV,
    ...options,
    // Right now we only capture frontend sessions for Next.js
    autoSessionTracking: false,
  };

  if (DEBUG_BUILD && opts.debug) {
    logger.enable();
  }

  DEBUG_BUILD && logger.log('Initializing SDK...');

  if (sdkAlreadyInitialized()) {
    DEBUG_BUILD && logger.log('SDK already initialized');
    return;
  }

  buildMetadata(opts, ['nextjs', 'node']);

  addServerIntegrations(opts);

  nodeInit(opts);

  const filterTransactions: EventProcessor = event => {
    return event.type === 'transaction' && event.transaction === '/404' ? null : event;
  };

  filterTransactions.id = 'NextServer404TransactionFilter';

  const scope = getCurrentScope();
  scope.setTag('runtime', 'node');
  if (IS_VERCEL) {
    scope.setTag('vercel', true);
  }

  scope.addEventProcessor(filterTransactions);

  if (process.env.NODE_ENV === 'development') {
    scope.addEventProcessor(devErrorSymbolicationEventProcessor);
  }

  DEBUG_BUILD && logger.log('SDK successfully initialized');
}

function sdkAlreadyInitialized(): boolean {
  return !!getClient();
}

function addServerIntegrations(options: NodeOptions): void {
  let integrations = options.integrations || [];

  // This value is injected at build time, based on the output directory specified in the build config. Though a default
  // is set there, we set it here as well, just in case something has gone wrong with the injection.
  const distDirName = globalWithInjectedValues.__rewriteFramesDistDir__;
  if (distDirName) {
    // nextjs always puts the build directory at the project root level, which is also where you run `next start` from, so
    // we can read in the project directory from the currently running process
    const distDirAbsPath = path.resolve(distDirName).replace(/(\/|\\)$/, ''); // We strip trailing slashes because "app:///_next" also doesn't have one
    const SOURCEMAP_FILENAME_REGEX = new RegExp(escapeStringForRegex(distDirAbsPath));

    const defaultRewriteFramesIntegration = new RewriteFrames({
      iteratee: frame => {
        frame.filename = frame.filename?.replace(SOURCEMAP_FILENAME_REGEX, 'app:///_next');
        return frame;
      },
    });
    integrations = addOrUpdateIntegration(defaultRewriteFramesIntegration, integrations);
  }

  const defaultOnUncaughtExceptionIntegration: IntegrationWithExclusionOption = new Integrations.OnUncaughtException({
    exitEvenIfOtherHandlersAreRegistered: false,
  });
  defaultOnUncaughtExceptionIntegration.allowExclusionByUser = true;
  integrations = addOrUpdateIntegration(defaultOnUncaughtExceptionIntegration, integrations, {
    _options: { exitEvenIfOtherHandlersAreRegistered: false },
  });

  const defaultHttpTracingIntegration = new Integrations.Http({ tracing: true });
  integrations = addOrUpdateIntegration(defaultHttpTracingIntegration, integrations, {
    _tracing: {},
  });

  options.integrations = integrations;
}

// TODO (v8): Remove this
/**
 * @deprecated This constant will be removed in the next major update.
 */
const deprecatedIsBuild = (): boolean => isBuild();
// eslint-disable-next-line deprecation/deprecation
export { deprecatedIsBuild as isBuild };

export * from '../common';

export {
  // eslint-disable-next-line deprecation/deprecation
  withSentry,
  // eslint-disable-next-line deprecation/deprecation
  withSentryAPI,
  wrapApiHandlerWithSentry,
} from '../common/wrapApiHandlerWithSentry';
