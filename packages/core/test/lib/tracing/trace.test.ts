import type { Span } from '@sentry/types';
import { Hub, addTracingExtensions, getCurrentScope, makeMain } from '../../../src';
import { continueTrace, startInactiveSpan, startSpan, startSpanManual } from '../../../src/tracing';
import { TestClient, getDefaultTestClientOptions } from '../../mocks/client';

beforeAll(() => {
  addTracingExtensions();
});

const enum Type {
  Sync = 'sync',
  Async = 'async',
}

let hub: Hub;
let client: TestClient;

describe('startSpan', () => {
  beforeEach(() => {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 0.0 });
    client = new TestClient(options);
    hub = new Hub(client);
    makeMain(hub);
  });

  describe.each([
    // isSync, isError, callback, expectedReturnValue
    [Type.Async, false, () => Promise.resolve('async good'), 'async good'],
    [Type.Sync, false, () => 'sync good', 'sync good'],
    [Type.Async, true, () => Promise.reject('async bad'), 'async bad'],
    [
      Type.Sync,
      true,
      () => {
        throw 'sync bad';
      },
      'sync bad',
    ],
  ])('with %s callback and error %s', (_type, isError, callback, expected) => {
    it('should return the same value as the callback', async () => {
      try {
        const result = await startSpan({ name: 'GET users/[id]' }, () => {
          return callback();
        });
        expect(result).toEqual(expected);
      } catch (e) {
        expect(e).toEqual(expected);
      }
    });

    it('should return the same value as the callback if transactions are undefined', async () => {
      // @ts-expect-error we are force overriding the transaction return to be undefined
      // The `startTransaction` types are actually wrong - it can return undefined
      // if tracingExtensions are not enabled
      jest.spyOn(hub, 'startTransaction').mockReturnValue(undefined);
      try {
        const result = await startSpan({ name: 'GET users/[id]' }, () => {
          return callback();
        });
        expect(result).toEqual(expected);
      } catch (e) {
        expect(e).toEqual(expected);
      }
    });

    it('creates a transaction', async () => {
      let ref: any = undefined;
      client.on('finishTransaction', transaction => {
        ref = transaction;
      });
      try {
        await startSpan({ name: 'GET users/[id]' }, () => {
          return callback();
        });
      } catch (e) {
        //
      }
      expect(ref).toBeDefined();

      expect(ref.name).toEqual('GET users/[id]');
      expect(ref.status).toEqual(isError ? 'internal_error' : undefined);
    });

    it('creates & finishes span', async () => {
      let _span: Span | undefined;
      startSpan({ name: 'GET users/[id]' }, span => {
        expect(span).toBeDefined();
        expect(span?.endTimestamp).toBeUndefined();
        _span = span;
      });

      expect(_span).toBeDefined();
      expect(_span?.endTimestamp).toBeDefined();
    });

    it('allows traceparent information to be overriden', async () => {
      let ref: any = undefined;
      client.on('finishTransaction', transaction => {
        ref = transaction;
      });
      try {
        await startSpan(
          {
            name: 'GET users/[id]',
            parentSampled: true,
            traceId: '12345678901234567890123456789012',
            parentSpanId: '1234567890123456',
          },
          () => {
            return callback();
          },
        );
      } catch (e) {
        //
      }
      expect(ref).toBeDefined();

      expect(ref.sampled).toEqual(true);
      expect(ref.traceId).toEqual('12345678901234567890123456789012');
      expect(ref.parentSpanId).toEqual('1234567890123456');
    });

    it('allows for transaction to be mutated', async () => {
      let ref: any = undefined;
      client.on('finishTransaction', transaction => {
        ref = transaction;
      });
      try {
        await startSpan({ name: 'GET users/[id]' }, span => {
          if (span) {
            span.op = 'http.server';
          }
          return callback();
        });
      } catch (e) {
        //
      }

      expect(ref.op).toEqual('http.server');
    });

    it('creates a span with correct description', async () => {
      let ref: any = undefined;
      client.on('finishTransaction', transaction => {
        ref = transaction;
      });
      try {
        await startSpan({ name: 'GET users/[id]', parentSampled: true }, () => {
          return startSpan({ name: 'SELECT * from users' }, () => {
            return callback();
          });
        });
      } catch (e) {
        //
      }

      expect(ref.spanRecorder.spans).toHaveLength(2);
      expect(ref.spanRecorder.spans[1].description).toEqual('SELECT * from users');
      expect(ref.spanRecorder.spans[1].parentSpanId).toEqual(ref.spanId);
      expect(ref.spanRecorder.spans[1].status).toEqual(isError ? 'internal_error' : undefined);
    });

    it('allows for span to be mutated', async () => {
      let ref: any = undefined;
      client.on('finishTransaction', transaction => {
        ref = transaction;
      });
      try {
        await startSpan({ name: 'GET users/[id]', parentSampled: true }, () => {
          return startSpan({ name: 'SELECT * from users' }, childSpan => {
            if (childSpan) {
              childSpan.op = 'db.query';
            }
            return callback();
          });
        });
      } catch (e) {
        //
      }

      expect(ref.spanRecorder.spans).toHaveLength(2);
      expect(ref.spanRecorder.spans[1].op).toEqual('db.query');
    });

    it('forks the scope', () => {
      const initialScope = getCurrentScope();

      startSpan({ name: 'GET users/[id]' }, span => {
        expect(getCurrentScope()).not.toBe(initialScope);
        expect(getCurrentScope().getSpan()).toBe(span);
      });

      expect(getCurrentScope()).toBe(initialScope);
      expect(initialScope.getSpan()).toBe(undefined);
    });
  });
});

describe('startSpanManual', () => {
  it('creates & finishes span', async () => {
    startSpanManual({ name: 'GET users/[id]' }, (span, finish) => {
      expect(span).toBeDefined();
      expect(span?.endTimestamp).toBeUndefined();
      finish();
      expect(span?.endTimestamp).toBeDefined();
    });
  });

  it('forks the scope automatically', () => {
    const initialScope = getCurrentScope();

    startSpanManual({ name: 'GET users/[id]' }, (span, finish) => {
      expect(getCurrentScope()).not.toBe(initialScope);
      expect(getCurrentScope().getSpan()).toBe(span);

      finish();

      // Is still the active span
      expect(getCurrentScope().getSpan()).toBe(span);
    });

    expect(getCurrentScope()).toBe(initialScope);
    expect(initialScope.getSpan()).toBe(undefined);
  });
});

describe('startInactiveSpan', () => {
  it('creates & finishes span', async () => {
    const span = startInactiveSpan({ name: 'GET users/[id]' });

    expect(span).toBeDefined();
    expect(span?.endTimestamp).toBeUndefined();

    span?.end();

    expect(span?.endTimestamp).toBeDefined();
  });

  it('does not set span on scope', () => {
    const initialScope = getCurrentScope();

    const span = startInactiveSpan({ name: 'GET users/[id]' });

    expect(span).toBeDefined();
    expect(initialScope.getSpan()).toBeUndefined();

    span?.end();

    expect(initialScope.getSpan()).toBeUndefined();
  });
});

describe('continueTrace', () => {
  beforeEach(() => {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 0.0 });
    client = new TestClient(options);
    hub = new Hub(client);
    makeMain(hub);
  });

  it('works without trace & baggage data', () => {
    const expectedContext = {
      metadata: {},
    };

    const result = continueTrace({ sentryTrace: undefined, baggage: undefined }, ctx => {
      expect(ctx).toEqual(expectedContext);
      return ctx;
    });

    expect(result).toEqual(expectedContext);

    const scope = hub.getScope();

    expect(scope.getPropagationContext()).toEqual({
      sampled: undefined,
      spanId: expect.any(String),
      traceId: expect.any(String),
    });

    expect(scope['_sdkProcessingMetadata']).toEqual({});
  });

  it('works with trace data', () => {
    const expectedContext = {
      metadata: {
        dynamicSamplingContext: {},
      },
      parentSampled: false,
      parentSpanId: '1121201211212012',
      traceId: '12312012123120121231201212312012',
    };

    const result = continueTrace(
      {
        sentryTrace: '12312012123120121231201212312012-1121201211212012-0',
        baggage: undefined,
      },
      ctx => {
        expect(ctx).toEqual(expectedContext);
        return ctx;
      },
    );

    expect(result).toEqual(expectedContext);

    const scope = hub.getScope();

    expect(scope.getPropagationContext()).toEqual({
      sampled: false,
      parentSpanId: '1121201211212012',
      spanId: expect.any(String),
      traceId: '12312012123120121231201212312012',
    });

    expect(scope['_sdkProcessingMetadata']).toEqual({});
  });

  it('works with trace & baggage data', () => {
    const expectedContext = {
      metadata: {
        dynamicSamplingContext: {
          environment: 'production',
          version: '1.0',
        },
      },
      parentSampled: true,
      parentSpanId: '1121201211212012',
      traceId: '12312012123120121231201212312012',
    };

    const result = continueTrace(
      {
        sentryTrace: '12312012123120121231201212312012-1121201211212012-1',
        baggage: 'sentry-version=1.0,sentry-environment=production',
      },
      ctx => {
        expect(ctx).toEqual(expectedContext);
        return ctx;
      },
    );

    expect(result).toEqual(expectedContext);

    const scope = hub.getScope();

    expect(scope.getPropagationContext()).toEqual({
      dsc: {
        environment: 'production',
        version: '1.0',
      },
      sampled: true,
      parentSpanId: '1121201211212012',
      spanId: expect.any(String),
      traceId: '12312012123120121231201212312012',
    });

    expect(scope['_sdkProcessingMetadata']).toEqual({});
  });

  it('works with trace & 3rd party baggage data', () => {
    const expectedContext = {
      metadata: {
        dynamicSamplingContext: {
          environment: 'production',
          version: '1.0',
        },
      },
      parentSampled: true,
      parentSpanId: '1121201211212012',
      traceId: '12312012123120121231201212312012',
    };

    const result = continueTrace(
      {
        sentryTrace: '12312012123120121231201212312012-1121201211212012-1',
        baggage: 'sentry-version=1.0,sentry-environment=production,dogs=great,cats=boring',
      },
      ctx => {
        expect(ctx).toEqual(expectedContext);
        return ctx;
      },
    );

    expect(result).toEqual(expectedContext);

    const scope = hub.getScope();

    expect(scope.getPropagationContext()).toEqual({
      dsc: {
        environment: 'production',
        version: '1.0',
      },
      sampled: true,
      parentSpanId: '1121201211212012',
      spanId: expect.any(String),
      traceId: '12312012123120121231201212312012',
    });

    expect(scope['_sdkProcessingMetadata']).toEqual({});
  });

  it('returns response of callback', () => {
    const expectedContext = {
      metadata: {
        dynamicSamplingContext: {},
      },
      parentSampled: false,
      parentSpanId: '1121201211212012',
      traceId: '12312012123120121231201212312012',
    };

    const result = continueTrace(
      {
        sentryTrace: '12312012123120121231201212312012-1121201211212012-0',
        baggage: undefined,
      },
      ctx => {
        return { ctx };
      },
    );

    expect(result).toEqual({ ctx: expectedContext });
  });

  it('works without a callback', () => {
    const expectedContext = {
      metadata: {
        dynamicSamplingContext: {},
      },
      parentSampled: false,
      parentSpanId: '1121201211212012',
      traceId: '12312012123120121231201212312012',
    };

    const ctx = continueTrace({
      sentryTrace: '12312012123120121231201212312012-1121201211212012-0',
      baggage: undefined,
    });

    expect(ctx).toEqual(expectedContext);
  });
});
