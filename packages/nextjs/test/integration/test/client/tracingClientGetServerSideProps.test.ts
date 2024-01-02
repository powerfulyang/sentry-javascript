import { expect, test } from '@playwright/test';
import { Transaction } from '@sentry/types';
import { countEnvelopes, getMultipleSentryEnvelopeRequests } from './utils/helpers';

test('should instrument `getServerSideProps` for performance tracing', async ({ page }) => {
  const transaction = await getMultipleSentryEnvelopeRequests<Transaction>(page, 1, {
    url: '/1337/withServerSideProps',
    envelopeType: 'transaction',
  });

  expect(transaction[0]).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
      },
    },
  });

  const nextDataTag = await page.waitForSelector('#__NEXT_DATA__', { state: 'attached' });
  const nextDataTagValue = JSON.parse(await nextDataTag.evaluate(tag => (tag as HTMLElement).innerText));

  // @ts-expect-error - We know `contexts` is defined in the Transaction envelope
  const traceId = transaction[0].contexts.trace.trace_id;

  expect(traceId).toBeDefined();

  expect(nextDataTagValue.props.pageProps.data).toBe('[some getServerSideProps data]');
  expect(nextDataTagValue.props.pageProps._sentryTraceData).toBeTruthy();
  expect(nextDataTagValue.props.pageProps._sentryBaggage).toBeTruthy();

  expect(nextDataTagValue.props.pageProps._sentryTraceData.split('-')[0]).toBe(traceId);

  expect(nextDataTagValue.props.pageProps._sentryBaggage.match(/sentry-trace_id=([a-f0-9]*),/)[1]).toBe(traceId);

  expect(
    await countEnvelopes(page, { url: '/1337/withServerSideProps', envelopeType: 'transaction', timeout: 2500 }),
  ).toBe(1);
});
