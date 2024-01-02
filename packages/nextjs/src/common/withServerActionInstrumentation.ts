import {
  addTracingExtensions,
  captureException,
  getClient,
  getCurrentScope,
  runWithAsyncContext,
  trace,
} from '@sentry/core';
import { logger, tracingContextFromHeaders } from '@sentry/utils';

import { DEBUG_BUILD } from './debug-build';
import { platformSupportsStreaming } from './utils/platformSupportsStreaming';
import { flushQueue } from './utils/responseEnd';

interface Options {
  formData?: FormData;
  // TODO: Whenever we decide to drop support for Next.js <= 12 we can automatically pick up the headers becauase "next/headers" will be resolvable.
  headers?: Headers;
  recordResponse?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withServerActionInstrumentation<A extends (...args: any[]) => any>(
  serverActionName: string,
  callback: A,
): Promise<ReturnType<A>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withServerActionInstrumentation<A extends (...args: any[]) => any>(
  serverActionName: string,
  options: Options,
  callback: A,
): Promise<ReturnType<A>>;

/**
 * Wraps a Next.js Server Action implementation with Sentry Error and Performance instrumentation.
 */
export function withServerActionInstrumentation<A extends (...args: unknown[]) => unknown>(
  ...args: [string, Options, A] | [string, A]
): Promise<ReturnType<A>> {
  if (typeof args[1] === 'function') {
    const [serverActionName, callback] = args;
    return withServerActionInstrumentationImplementation(serverActionName, {}, callback);
  } else {
    const [serverActionName, options, callback] = args;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return withServerActionInstrumentationImplementation(serverActionName, options, callback!);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function withServerActionInstrumentationImplementation<A extends (...args: any[]) => any>(
  serverActionName: string,
  options: Options,
  callback: A,
): Promise<ReturnType<A>> {
  addTracingExtensions();
  return runWithAsyncContext(async () => {
    const sendDefaultPii = getClient()?.getOptions().sendDefaultPii;

    let sentryTraceHeader;
    let baggageHeader;
    const fullHeadersObject: Record<string, string> = {};
    try {
      sentryTraceHeader = options.headers?.get('sentry-trace') ?? undefined;
      baggageHeader = options.headers?.get('baggage');
      options.headers?.forEach((value, key) => {
        fullHeadersObject[key] = value;
      });
    } catch (e) {
      DEBUG_BUILD &&
        logger.warn(
          "Sentry wasn't able to extract the tracing headers for a server action. Will not trace this request.",
        );
    }

    const currentScope = getCurrentScope();
    const { traceparentData, dynamicSamplingContext, propagationContext } = tracingContextFromHeaders(
      sentryTraceHeader,
      baggageHeader,
    );
    currentScope.setPropagationContext(propagationContext);

    let res;
    try {
      res = await trace(
        {
          op: 'function.server_action',
          name: `serverAction/${serverActionName}`,
          status: 'ok',
          ...traceparentData,
          metadata: {
            source: 'route',
            dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
            request: {
              headers: fullHeadersObject,
            },
          },
        },
        async span => {
          const result = await callback();

          if (options.recordResponse !== undefined ? options.recordResponse : sendDefaultPii) {
            span?.setData('server_action_result', result);
          }

          if (options.formData) {
            const formDataObject: Record<string, unknown> = {};
            options.formData.forEach((value, key) => {
              if (typeof value === 'string') {
                formDataObject[key] = value;
              } else {
                formDataObject[key] = '[non-string value]';
              }
            });
            span?.setData('server_action_form_data', formDataObject);
          }

          return result;
        },
        error => {
          captureException(error, { mechanism: { handled: false } });
        },
      );
    } finally {
      if (!platformSupportsStreaming()) {
        // Lambdas require manual flushing to prevent execution freeze before the event is sent
        await flushQueue();
      }

      if (process.env.NEXT_RUNTIME === 'edge') {
        // flushQueue should not throw
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        flushQueue();
      }
    }

    return res;
  });
}
