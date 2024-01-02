// This is exported so the loader does not fail when switching off Replay
import { Feedback, Replay } from '@sentry-internal/integration-shims';
import { BrowserTracing, Span, addExtensionMethods } from '@sentry-internal/tracing';

import * as Sentry from './index.bundle.base';

// TODO (v8): Remove this as it was only needed for backwards compatibility
// We want replay to be available under Sentry.Replay, to be consistent
// with the NPM package version.
Sentry.Integrations.Replay = Replay;

Sentry.Integrations.BrowserTracing = BrowserTracing;

// We are patching the global object with our hub extension methods
addExtensionMethods();

export { Feedback, Replay, BrowserTracing, Span, addExtensionMethods };
export * from './index.bundle.base';
