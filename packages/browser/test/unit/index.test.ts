import { SDK_VERSION, getReportDialogEndpoint } from '@sentry/core';
import type { WrappedFunction } from '@sentry/types';
import * as utils from '@sentry/utils';

import type { Event } from '../../src';
import {
  BrowserClient,
  Integrations,
  Scope,
  WINDOW,
  addBreadcrumb,
  captureEvent,
  captureException,
  captureMessage,
  flush,
  getClient,
  getCurrentHub,
  getCurrentScope,
  init,
  showReportDialog,
  wrap,
} from '../../src';
import { getDefaultBrowserClientOptions } from './helper/browser-client-options';
import { makeSimpleTransport } from './mocks/simpletransport';

const dsn = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

// eslint-disable-next-line no-var
declare var global: any;

jest.mock('@sentry/core', () => {
  const original = jest.requireActual('@sentry/core');
  return {
    ...original,
    getReportDialogEndpoint: jest.fn(),
  };
});

describe('SentryBrowser', () => {
  const beforeSend = jest.fn(event => event);

  beforeEach(() => {
    WINDOW.__SENTRY__ = { hub: undefined, logger: undefined, globalEventProcessors: [] };
    init({
      beforeSend,
      dsn,
      transport: makeSimpleTransport,
    });
  });

  afterEach(() => {
    beforeSend.mockClear();
  });

  describe('getContext() / setContext()', () => {
    it('should store/load extra', () => {
      getCurrentScope().setExtra('abc', { def: [1] });
      expect(global.__SENTRY__.hub._stack[0].scope._extra).toEqual({
        abc: { def: [1] },
      });
    });

    it('should store/load tags', () => {
      getCurrentScope().setTag('abc', 'def');
      expect(global.__SENTRY__.hub._stack[0].scope._tags).toEqual({
        abc: 'def',
      });
    });

    it('should store/load user', () => {
      getCurrentScope().setUser({ id: 'def' });
      expect(global.__SENTRY__.hub._stack[0].scope._user).toEqual({
        id: 'def',
      });
    });
  });

  describe('showReportDialog', () => {
    beforeEach(() => {
      (getReportDialogEndpoint as jest.Mock).mockReset();
    });

    describe('user', () => {
      const EX_USER = { email: 'test@example.com' };
      const options = getDefaultBrowserClientOptions({ dsn });
      const client = new BrowserClient(options);
      it('uses the user on the scope', () => {
        getCurrentScope().setUser(EX_USER);
        getCurrentHub().bindClient(client);

        showReportDialog();

        expect(getReportDialogEndpoint).toHaveBeenCalledTimes(1);
        expect(getReportDialogEndpoint).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({ user: { email: EX_USER.email } }),
        );
      });

      it('prioritizes options user over scope user', () => {
        getCurrentScope().setUser(EX_USER);
        getCurrentHub().bindClient(client);

        const DIALOG_OPTION_USER = { email: 'option@example.com' };
        showReportDialog({ user: DIALOG_OPTION_USER });

        expect(getReportDialogEndpoint).toHaveBeenCalledTimes(1);
        expect(getReportDialogEndpoint).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({ user: { email: DIALOG_OPTION_USER.email } }),
        );
      });
    });

    describe('onClose', () => {
      const dummyErrorHandler = jest.fn();
      beforeEach(() => {
        // this prevents jest-environment-jsdom from failing the test
        // when an error in `onClose` is thrown
        // it does not prevent errors thrown directly inside the test,
        // so we don't have to worry about tests passing that should
        // otherwise fail
        // see: https://github.com/jestjs/jest/blob/main/packages/jest-environment-jsdom/src/index.ts#L95-L115
        WINDOW.addEventListener('error', dummyErrorHandler);
      });

      afterEach(() => {
        WINDOW.removeEventListener('error', dummyErrorHandler);
      });

      const waitForPostMessage = async (message: string) => {
        WINDOW.postMessage(message, '*');
        await flush(10);
      };

      it('should call `onClose` when receiving `__sentry_reportdialog_closed__` MessageEvent', async () => {
        const onClose = jest.fn();
        showReportDialog({ onClose });

        await waitForPostMessage('__sentry_reportdialog_closed__');
        expect(onClose).toHaveBeenCalledTimes(1);

        // ensure the event handler has been removed so onClose is not called again
        await waitForPostMessage('__sentry_reportdialog_closed__');
        expect(onClose).toHaveBeenCalledTimes(1);
      });

      it('should call `onClose` only once even if it throws', async () => {
        const onClose = jest.fn(() => {
          throw new Error();
        });
        showReportDialog({ onClose });

        await waitForPostMessage('__sentry_reportdialog_closed__');
        expect(onClose).toHaveBeenCalledTimes(1);

        // ensure the event handler has been removed so onClose is not called again
        await waitForPostMessage('__sentry_reportdialog_closed__');
        expect(onClose).toHaveBeenCalledTimes(1);
      });

      it('should not call `onClose` for other MessageEvents', async () => {
        const onClose = jest.fn();
        showReportDialog({ onClose });

        await waitForPostMessage('some_message');
        expect(onClose).not.toHaveBeenCalled();

        await waitForPostMessage('__sentry_reportdialog_closed__');
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('breadcrumbs', () => {
    it('should record breadcrumbs', async () => {
      addBreadcrumb({ message: 'test1' });
      addBreadcrumb({ message: 'test2' });

      captureMessage('event');
      await flush(2000);
      expect(beforeSend.mock.calls[0][0].breadcrumbs).toHaveLength(2);
    });
  });

  describe('capture', () => {
    it('should capture an exception', async () => {
      try {
        throw new Error('test');
      } catch (e) {
        captureException(e);
      }

      await flush(2000);

      const event = beforeSend.mock.calls[0][0];
      expect(event.exception).toBeDefined();
      expect(event.exception.values[0]).toBeDefined();
      expect(event.exception.values[0].type).toBe('Error');
      expect(event.exception.values[0].value).toBe('test');
      expect(event.exception.values[0].stacktrace.frames).not.toHaveLength(0);
    });

    it('should capture a message', done => {
      const options = getDefaultBrowserClientOptions({
        beforeSend: (event: Event): Event | null => {
          expect(event.message).toBe('test');
          expect(event.exception).toBeUndefined();
          done();
          return event;
        },
        dsn,
      });
      getCurrentHub().bindClient(new BrowserClient(options));
      captureMessage('test');
    });

    it('should capture an event', done => {
      const options = getDefaultBrowserClientOptions({
        beforeSend: (event: Event): Event | null => {
          expect(event.message).toBe('event');
          expect(event.exception).toBeUndefined();
          done();
          return event;
        },
        dsn,
      });
      getCurrentHub().bindClient(new BrowserClient(options));
      captureEvent({ message: 'event' });
    });

    it('should set `platform` on events', done => {
      const options = getDefaultBrowserClientOptions({
        beforeSend: (event: Event): Event | null => {
          expect(event.platform).toBe('javascript');
          done();
          return event;
        },
        dsn,
      });
      getCurrentHub().bindClient(new BrowserClient(options));
      captureEvent({ message: 'event' });
    });

    it('should not dedupe an event on bound client', async () => {
      const localBeforeSend = jest.fn();
      const options = getDefaultBrowserClientOptions({
        beforeSend: localBeforeSend,
        dsn,
        integrations: [],
      });
      getCurrentHub().bindClient(new BrowserClient(options));

      captureMessage('event222');
      captureMessage('event222');

      await flush(10);

      expect(localBeforeSend).toHaveBeenCalledTimes(2);
    });

    it('should use inboundfilter rules of bound client', async () => {
      const localBeforeSend = jest.fn();
      const options = getDefaultBrowserClientOptions({
        beforeSend: localBeforeSend,
        dsn,
        integrations: [new Integrations.InboundFilters({ ignoreErrors: ['capture'] })],
      });
      getCurrentHub().bindClient(new BrowserClient(options));

      captureMessage('capture');

      await flush(2000);

      expect(localBeforeSend).not.toHaveBeenCalled();
    });
  });
});

describe('SentryBrowser initialization', () => {
  it('should use window.SENTRY_RELEASE to set release on initialization if available', () => {
    global.SENTRY_RELEASE = { id: 'foobar' };
    init({ dsn });
    expect(global.__SENTRY__.hub._stack[0].client.getOptions().release).toBe('foobar');
    delete global.SENTRY_RELEASE;
  });

  it('should use initialScope', () => {
    init({ dsn, initialScope: { tags: { a: 'b' } } });
    expect(global.__SENTRY__.hub._stack[0].scope._tags).toEqual({ a: 'b' });
  });

  it('should use initialScope Scope', () => {
    const scope = new Scope();
    scope.setTags({ a: 'b' });
    init({ dsn, initialScope: scope });
    expect(global.__SENTRY__.hub._stack[0].scope._tags).toEqual({ a: 'b' });
  });

  it('should use initialScope callback', () => {
    init({
      dsn,
      initialScope: scope => {
        scope.setTags({ a: 'b' });
        return scope;
      },
    });
    expect(global.__SENTRY__.hub._stack[0].scope._tags).toEqual({ a: 'b' });
  });

  it('should have initialization proceed as normal if window.SENTRY_RELEASE is not set', () => {
    // This is mostly a happy-path test to ensure that the initialization doesn't throw an error.
    init({ dsn });
    expect(global.__SENTRY__.hub._stack[0].client.getOptions().release).toBeUndefined();
  });

  describe('SDK metadata', () => {
    it('should set SDK data when Sentry.init() is called', () => {
      init({ dsn });

      const sdkData = getClient()?.getOptions()._metadata?.sdk || {};

      expect(sdkData?.name).toBe('sentry.javascript.browser');
      expect(sdkData?.packages?.[0].name).toBe('npm:@sentry/browser');
      expect(sdkData?.packages?.[0].version).toBe(SDK_VERSION);
      expect(sdkData?.version).toBe(SDK_VERSION);
    });

    it('uses SDK source from window for package name', () => {
      global.SENTRY_SDK_SOURCE = 'loader';
      init({ dsn });

      const sdkData = getClient()?.getOptions()._metadata?.sdk || {};

      expect(sdkData.packages?.[0].name).toBe('loader:@sentry/browser');
      delete global.SENTRY_SDK_SOURCE;
    });

    it('uses SDK source from global for package name', () => {
      const spy = jest.spyOn(utils, 'getSDKSource').mockReturnValue('cdn');
      init({ dsn });

      const sdkData = getClient()?.getOptions()._metadata?.sdk || {};

      expect(sdkData.packages?.[0].name).toBe('cdn:@sentry/browser');
      expect(utils.getSDKSource).toBeCalledTimes(1);
      spy.mockRestore();
    });

    it('should set SDK data when instantiating a client directly', () => {
      const options = getDefaultBrowserClientOptions({ dsn });
      const client = new BrowserClient(options);

      const sdkData = client.getOptions()._metadata?.sdk as any;

      expect(sdkData.name).toBe('sentry.javascript.browser');
      expect(sdkData.packages[0].name).toBe('npm:@sentry/browser');
      expect(sdkData.packages[0].version).toBe(SDK_VERSION);
      expect(sdkData.version).toBe(SDK_VERSION);
    });

    // wrapper packages (like @sentry/angular and @sentry/react) set their SDK data in their `init` methods, which are
    // called before the client is instantiated, and we don't want to clobber that data
    it("shouldn't overwrite SDK data that's already there", () => {
      init({
        dsn,
        // this would normally be set by the wrapper SDK in init()
        _metadata: {
          sdk: {
            name: 'sentry.javascript.angular',
            packages: [
              {
                name: 'npm:@sentry/angular',
                version: SDK_VERSION,
              },
            ],
            version: SDK_VERSION,
          },
        },
      });

      const sdkData = getClient()?.getOptions()._metadata?.sdk || {};

      expect(sdkData.name).toBe('sentry.javascript.angular');
      expect(sdkData.packages?.[0].name).toBe('npm:@sentry/angular');
      expect(sdkData.packages?.[0].version).toBe(SDK_VERSION);
      expect(sdkData.version).toBe(SDK_VERSION);
    });
  });
});

describe('wrap()', () => {
  it('should wrap and call function while capturing error', done => {
    const options = getDefaultBrowserClientOptions({
      beforeSend: (event: Event): Event | null => {
        expect(event.exception!.values![0].type).toBe('TypeError');
        expect(event.exception!.values![0].value).toBe('mkey');
        done();
        return null;
      },
      dsn,
    });
    getCurrentHub().bindClient(new BrowserClient(options));

    try {
      // eslint-disable-next-line deprecation/deprecation
      wrap(() => {
        throw new TypeError('mkey');
      });
    } catch (e) {
      // no-empty
    }
  });

  it('should return result of a function call', () => {
    // eslint-disable-next-line deprecation/deprecation
    const result = wrap(() => 2);
    expect(result).toBe(2);
  });

  it('should allow for passing this and arguments through binding', () => {
    // eslint-disable-next-line deprecation/deprecation
    const result = wrap(
      function (this: unknown, a: string, b: number): unknown[] {
        return [this, a, b];
      }.bind({ context: 'this' }, 'b', 42),
    );

    expect((result as unknown[])[0]).toEqual({ context: 'this' });
    expect((result as unknown[])[1]).toBe('b');
    expect((result as unknown[])[2]).toBe(42);

    // eslint-disable-next-line deprecation/deprecation
    const result2 = wrap(
      function (this: { x: number }): number {
        return this.x;
      }.bind({ x: 42 }),
    );

    expect(result2).toBe(42);
  });

  it('should ignore frozen functions', () => {
    const func = Object.freeze(() => 42);

    // eslint-disable-next-line deprecation/deprecation
    wrap(func);

    expect(func()).toBe(42);
    expect((func as WrappedFunction).__sentry_wrapped__).toBeUndefined();
  });
});
