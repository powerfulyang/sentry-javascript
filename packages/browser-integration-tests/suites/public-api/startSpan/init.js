/* eslint-disable no-unused-vars */
import * as Sentry from '@sentry/browser';
// biome-ignore lint/nursery/noUnusedImports: Need to import tracing for side effect
import * as _ from '@sentry/tracing';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  normalizeDepth: 10,
  debug: true,
});
