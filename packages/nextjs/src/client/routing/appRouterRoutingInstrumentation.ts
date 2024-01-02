import { WINDOW } from '@sentry/react';
import type { Primitive, Transaction, TransactionContext } from '@sentry/types';
import { addFetchInstrumentationHandler, browserPerformanceTimeOrigin } from '@sentry/utils';

type StartTransactionCb = (context: TransactionContext) => Transaction | undefined;

const DEFAULT_TAGS = {
  'routing.instrumentation': 'next-app-router',
} as const;

/**
 * Instruments the Next.js Clientside App Router.
 */
export function appRouterInstrumentation(
  startTransactionCb: StartTransactionCb,
  startTransactionOnPageLoad: boolean = true,
  startTransactionOnLocationChange: boolean = true,
): void {
  // We keep track of the active transaction so we can finish it when we start a navigation transaction.
  let activeTransaction: Transaction | undefined = undefined;

  // We keep track of the previous location name so we can set the `from` field on navigation transactions.
  // This is either a route or a pathname.
  let prevLocationName = WINDOW.location.pathname;

  if (startTransactionOnPageLoad) {
    activeTransaction = startTransactionCb({
      name: prevLocationName,
      op: 'pageload',
      origin: 'auto.pageload.nextjs.app_router_instrumentation',
      tags: DEFAULT_TAGS,
      // pageload should always start at timeOrigin (and needs to be in s, not ms)
      startTimestamp: browserPerformanceTimeOrigin ? browserPerformanceTimeOrigin / 1000 : undefined,
      metadata: { source: 'url' },
    });
  }

  if (startTransactionOnLocationChange) {
    addFetchInstrumentationHandler(handlerData => {
      // The instrumentation handler is invoked twice - once for starting a request and once when the req finishes
      // We can use the existence of the end-timestamp to filter out "finishing"-events.
      if (handlerData.endTimestamp !== undefined) {
        return;
      }

      // Only GET requests can be navigating RSC requests
      if (handlerData.fetchData.method !== 'GET') {
        return;
      }

      const parsedNavigatingRscFetchArgs = parseNavigatingRscFetchArgs(handlerData.args);

      if (parsedNavigatingRscFetchArgs === null) {
        return;
      }

      const transactionName = parsedNavigatingRscFetchArgs.targetPathname;
      const tags: Record<string, Primitive> = {
        ...DEFAULT_TAGS,
        from: prevLocationName,
      };

      prevLocationName = transactionName;

      if (activeTransaction) {
        activeTransaction.end();
      }

      startTransactionCb({
        name: transactionName,
        op: 'navigation',
        origin: 'auto.navigation.nextjs.app_router_instrumentation',
        tags,
        metadata: { source: 'url' },
      });
    });
  }
}

function parseNavigatingRscFetchArgs(fetchArgs: unknown[]): null | {
  targetPathname: string;
} {
  // Make sure the first arg is a URL object
  if (!fetchArgs[0] || typeof fetchArgs[0] !== 'object' || (fetchArgs[0] as URL).searchParams === undefined) {
    return null;
  }

  // Make sure the second argument is some kind of fetch config obj that contains headers
  if (!fetchArgs[1] || typeof fetchArgs[1] !== 'object' || !('headers' in fetchArgs[1])) {
    return null;
  }

  try {
    const url = fetchArgs[0] as URL;
    const headers = fetchArgs[1].headers as Record<string, string>;

    // Not an RSC request
    if (headers['RSC'] !== '1') {
      return null;
    }

    // Prefetch requests are not navigating RSC requests
    if (headers['Next-Router-Prefetch'] === '1') {
      return null;
    }

    return {
      targetPathname: url.pathname,
    };
  } catch {
    return null;
  }
}
