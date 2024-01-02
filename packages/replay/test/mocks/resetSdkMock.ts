import type { EventProcessor } from '@sentry/types';
import { getGlobalSingleton, resetInstrumentationHandlers } from '@sentry/utils';

import type { Replay as ReplayIntegration } from '../../src';
import type { ReplayContainer } from '../../src/replay';
import type { RecordMock } from './../index';
import { BASE_TIMESTAMP } from './../index';
import type { DomHandler } from './../types';
import type { MockSdkParams } from './mockSdk';
import { mockSdk } from './mockSdk';

export async function resetSdkMock({ replayOptions, sentryOptions, autoStart }: MockSdkParams): Promise<{
  domHandler: DomHandler;
  mockRecord: RecordMock;
  replay: ReplayContainer;
  integration: ReplayIntegration;
}> {
  let domHandler: DomHandler;

  jest.setSystemTime(new Date(BASE_TIMESTAMP));
  jest.clearAllMocks();
  jest.resetModules();

  // Clear all handlers that have been registered
  resetInstrumentationHandlers();
  getGlobalSingleton<EventProcessor[]>('globalEventProcessors', () => []).length = 0;

  const SentryUtils = await import('@sentry/utils');
  jest.spyOn(SentryUtils, 'addClickKeypressInstrumentationHandler').mockImplementation(handler => {
    domHandler = handler;
  });
  const { mockRrweb } = await import('./mockRrweb');
  const { record: mockRecord } = mockRrweb();

  const { replay, integration } = await mockSdk({
    replayOptions,
    sentryOptions,
    autoStart,
  });

  // XXX: This is needed to ensure `domHandler` is set
  jest.runAllTimers();
  await new Promise(process.nextTick);
  jest.setSystemTime(new Date(BASE_TIMESTAMP));

  return {
    // @ts-expect-error use before assign
    domHandler,
    mockRecord,
    replay,
    integration,
  };
}
