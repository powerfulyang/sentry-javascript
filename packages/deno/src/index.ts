export type {
  Breadcrumb,
  BreadcrumbHint,
  PolymorphicRequest,
  Request,
  SdkInfo,
  Event,
  EventHint,
  Exception,
  Session,
  // eslint-disable-next-line deprecation/deprecation
  Severity,
  SeverityLevel,
  Span,
  StackFrame,
  Stacktrace,
  Thread,
  Transaction,
  User,
} from '@sentry/types';
export type { AddRequestDataToEventOptions } from '@sentry/utils';

export type { DenoOptions } from './types';

export {
  // eslint-disable-next-line deprecation/deprecation
  addGlobalEventProcessor,
  addEventProcessor,
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  close,
  // eslint-disable-next-line deprecation/deprecation
  configureScope,
  createTransport,
  // eslint-disable-next-line deprecation/deprecation
  extractTraceparentData,
  continueTrace,
  flush,
  getActiveTransaction,
  getHubFromCarrier,
  getCurrentHub,
  getClient,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  Hub,
  lastEventId,
  makeMain,
  runWithAsyncContext,
  Scope,
  startTransaction,
  SDK_VERSION,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  spanStatusfromHttpCode,
  trace,
  withScope,
  captureCheckIn,
  withMonitor,
  setMeasurement,
  getActiveSpan,
  startSpan,
  startInactiveSpan,
  startSpanManual,
  metrics,
} from '@sentry/core';
export type { SpanStatusType } from '@sentry/core';

export { DenoClient } from './client';

export { defaultIntegrations, init } from './sdk';

import { Integrations as CoreIntegrations } from '@sentry/core';

import * as DenoIntegrations from './integrations';

const INTEGRATIONS = {
  ...CoreIntegrations,
  ...DenoIntegrations,
};

export { INTEGRATIONS as Integrations };
