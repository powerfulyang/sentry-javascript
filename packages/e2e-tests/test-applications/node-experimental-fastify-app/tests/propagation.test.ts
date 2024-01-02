import { expect, test } from '@playwright/test';
import { Span } from '@sentry/types';
import axios from 'axios';
import { waitForTransaction } from '../event-proxy-server';

const authToken = process.env.E2E_TEST_AUTH_TOKEN;
const sentryTestOrgSlug = process.env.E2E_TEST_SENTRY_ORG_SLUG;
const sentryTestProject = process.env.E2E_TEST_SENTRY_TEST_PROJECT;
const EVENT_POLLING_TIMEOUT = 90_000;

test('Propagates trace for outgoing http requests', async ({ baseURL }) => {
  const inboundTransactionPromise = waitForTransaction('node-experimental-fastify-app', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-inbound-headers'
    );
  });

  const outboundTransactionPromise = waitForTransaction('node-experimental-fastify-app', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-outgoing-http'
    );
  });

  const { data } = await axios.get(`${baseURL}/test-outgoing-http`);

  const inboundTransaction = await inboundTransactionPromise;
  const outboundTransaction = await outboundTransactionPromise;

  const traceId = outboundTransaction?.contexts?.trace?.trace_id;
  const outgoingHttpSpan = outboundTransaction?.spans?.find(span => span.op === 'http.client') as
    | ReturnType<Span['toJSON']>
    | undefined;

  expect(outgoingHttpSpan).toBeDefined();

  const outgoingHttpSpanId = outgoingHttpSpan?.span_id;

  expect(traceId).toEqual(expect.any(String));

  // data is passed through from the inbound request, to verify we have the correct headers set
  const inboundHeaderSentryTrace = data.headers?.['sentry-trace'];
  const inboundHeaderBaggage = data.headers?.['baggage'];

  expect(inboundHeaderSentryTrace).toEqual(`${traceId}-${outgoingHttpSpanId}-1`);
  expect(inboundHeaderBaggage).toBeDefined();

  const baggage = (inboundHeaderBaggage || '').split(',');
  expect(baggage).toEqual(
    expect.arrayContaining([
      'sentry-environment=qa',
      `sentry-trace_id=${traceId}`,
      expect.stringMatching(/sentry-public_key=/),
    ]),
  );

  expect(outboundTransaction).toEqual(
    expect.objectContaining({
      contexts: expect.objectContaining({
        trace: {
          data: {
            url: 'http://localhost:3030/test-outgoing-http',
            'otel.kind': 'SERVER',
            'http.response.status_code': 200,
          },
          op: 'http.server',
          span_id: expect.any(String),
          status: 'ok',
          tags: {
            'http.status_code': 200,
          },
          trace_id: traceId,
          origin: 'auto.http.otel.http',
        },
      }),
    }),
  );

  expect(inboundTransaction).toEqual(
    expect.objectContaining({
      contexts: expect.objectContaining({
        trace: {
          data: {
            url: 'http://localhost:3030/test-inbound-headers',
            'otel.kind': 'SERVER',
            'http.response.status_code': 200,
          },
          op: 'http.server',
          parent_span_id: outgoingHttpSpanId,
          span_id: expect.any(String),
          status: 'ok',
          tags: {
            'http.status_code': 200,
          },
          trace_id: traceId,
          origin: 'auto.http.otel.http',
        },
      }),
    }),
  );
});

test('Propagates trace for outgoing fetch requests', async ({ baseURL }) => {
  const inboundTransactionPromise = waitForTransaction('node-experimental-fastify-app', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-inbound-headers'
    );
  });

  const outboundTransactionPromise = waitForTransaction('node-experimental-fastify-app', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-outgoing-fetch'
    );
  });

  const { data } = await axios.get(`${baseURL}/test-outgoing-fetch`);

  const inboundTransaction = await inboundTransactionPromise;
  const outboundTransaction = await outboundTransactionPromise;

  const traceId = outboundTransaction?.contexts?.trace?.trace_id;
  const outgoingHttpSpan = outboundTransaction?.spans?.find(span => span.op === 'http.client') as
    | ReturnType<Span['toJSON']>
    | undefined;

  expect(outgoingHttpSpan).toBeDefined();

  const outgoingHttpSpanId = outgoingHttpSpan?.span_id;

  expect(traceId).toEqual(expect.any(String));

  // data is passed through from the inbound request, to verify we have the correct headers set
  const inboundHeaderSentryTrace = data.headers?.['sentry-trace'];
  const inboundHeaderBaggage = data.headers?.['baggage'];

  expect(inboundHeaderSentryTrace).toEqual(`${traceId}-${outgoingHttpSpanId}-1`);
  expect(inboundHeaderBaggage).toBeDefined();

  const baggage = (inboundHeaderBaggage || '').split(',');
  expect(baggage).toEqual(
    expect.arrayContaining([
      'sentry-environment=qa',
      `sentry-trace_id=${traceId}`,
      expect.stringMatching(/sentry-public_key=/),
    ]),
  );

  expect(outboundTransaction).toEqual(
    expect.objectContaining({
      contexts: expect.objectContaining({
        trace: {
          data: {
            url: 'http://localhost:3030/test-outgoing-fetch',
            'otel.kind': 'SERVER',
            'http.response.status_code': 200,
          },
          op: 'http.server',
          span_id: expect.any(String),
          status: 'ok',
          tags: {
            'http.status_code': 200,
          },
          trace_id: traceId,
          origin: 'auto.http.otel.http',
        },
      }),
    }),
  );

  expect(inboundTransaction).toEqual(
    expect.objectContaining({
      contexts: expect.objectContaining({
        trace: {
          data: {
            url: 'http://localhost:3030/test-inbound-headers',
            'otel.kind': 'SERVER',
            'http.response.status_code': 200,
          },
          op: 'http.server',
          parent_span_id: outgoingHttpSpanId,
          span_id: expect.any(String),
          status: 'ok',
          tags: {
            'http.status_code': 200,
          },
          trace_id: traceId,
          origin: 'auto.http.otel.http',
        },
      }),
    }),
  );
});
