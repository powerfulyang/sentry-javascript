import { captureException, flush, getCurrentScope, startSpanManual } from '@sentry/node';
import { isThenable, logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import { domainify, markEventUnhandled, proxyFunction } from '../utils';
import type { CloudEventFunction, CloudEventFunctionWithCallback, WrapperOptions } from './general';

export type CloudEventFunctionWrapperOptions = WrapperOptions;

/**
 * Wraps an event function handler adding it error capture and tracing capabilities.
 *
 * @param fn Event handler
 * @param options Options
 * @returns Event handler
 */
export function wrapCloudEventFunction(
  fn: CloudEventFunction | CloudEventFunctionWithCallback,
  wrapOptions: Partial<CloudEventFunctionWrapperOptions> = {},
): CloudEventFunctionWithCallback {
  return proxyFunction(fn, f => domainify(_wrapCloudEventFunction(f, wrapOptions)));
}

function _wrapCloudEventFunction(
  fn: CloudEventFunction | CloudEventFunctionWithCallback,
  wrapOptions: Partial<CloudEventFunctionWrapperOptions> = {},
): CloudEventFunctionWithCallback {
  const options: CloudEventFunctionWrapperOptions = {
    flushTimeout: 2000,
    ...wrapOptions,
  };
  return (context, callback) => {
    return startSpanManual(
      {
        name: context.type || '<unknown>',
        op: 'function.gcp.cloud_event',
        origin: 'auto.function.serverless.gcp_cloud_event',
        metadata: { source: 'component' },
      },
      span => {
        const scope = getCurrentScope();
        scope.setContext('gcp.function.context', { ...context });

        const newCallback = domainify((...args: unknown[]) => {
          if (args[0] !== null && args[0] !== undefined) {
            captureException(args[0], scope => markEventUnhandled(scope));
          }
          span?.end();

          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          flush(options.flushTimeout)
            .then(null, e => {
              DEBUG_BUILD && logger.error(e);
            })
            .then(() => {
              callback(...args);
            });
        });

        if (fn.length > 1) {
          let fnResult;
          try {
            fnResult = (fn as CloudEventFunctionWithCallback)(context, newCallback);
          } catch (err) {
            captureException(err, scope => markEventUnhandled(scope));
            throw err;
          }

          if (isThenable(fnResult)) {
            fnResult.then(null, err => {
              captureException(err, scope => markEventUnhandled(scope));
              throw err;
            });
          }

          return fnResult;
        }

        return Promise.resolve()
          .then(() => (fn as CloudEventFunction)(context))
          .then(
            result => newCallback(null, result),
            err => newCallback(err, undefined),
          );
      },
    );
  };
}
