import type { Contexts, DsnComponents, SdkMetadata } from '@sentry/types';

export interface Options {
  /**
   * Interval to send heartbeat messages to the ANR worker.
   *
   * Defaults to 50ms.
   */
  pollInterval: number;
  /**
   * Threshold in milliseconds to trigger an ANR event.
   *
   * Defaults to 5000ms.
   */
  anrThreshold: number;
  /**
   * Whether to capture a stack trace when the ANR event is triggered.
   *
   * Defaults to `false`.
   *
   * This uses the node debugger which enables the inspector API and opens the required ports.
   */
  captureStackTrace: boolean;
}

export interface WorkerStartData extends Options {
  debug: boolean;
  sdkMetadata: SdkMetadata;
  dsn: DsnComponents;
  release: string | undefined;
  environment: string;
  dist: string | undefined;
  contexts: Contexts;
}
