import type { BrowserOptions } from '@sentry/browser';
import { SDK_VERSION, addEventProcessor, init as browserInit } from '@sentry/browser';
import type { EventProcessor, SdkMetadata } from '@sentry/types';
import { getDomElement } from '@sentry/utils';
/**
 * Inits the Svelte SDK
 */
export function init(options: BrowserOptions): void {
  const opts = {
    _metadata: {} as SdkMetadata,
    ...options,
  };

  opts._metadata.sdk = opts._metadata.sdk || {
    name: 'sentry.javascript.svelte',
    packages: [
      {
        name: 'npm:@sentry/svelte',
        version: SDK_VERSION,
      },
    ],
    version: SDK_VERSION,
  };
  browserInit(opts);

  detectAndReportSvelteKit();
}

/**
 * Adds a global event processor to detect if the SDK is initialized in a SvelteKit frontend,
 * in which case we add SvelteKit an event.modules entry to outgoing events.
 * SvelteKit detection is performed only once, when the event processor is called for the
 * first time. We cannot perform this check upfront (directly when init is called) because
 * at this time, the HTML element might not yet be accessible.
 */
export function detectAndReportSvelteKit(): void {
  let detectedSvelteKit: boolean | undefined = undefined;

  const svelteKitProcessor: EventProcessor = event => {
    if (detectedSvelteKit === undefined) {
      detectedSvelteKit = isSvelteKitApp();
    }
    if (detectedSvelteKit) {
      event.modules = {
        svelteKit: 'latest',
        ...event.modules,
      };
    }
    return event;
  };
  svelteKitProcessor.id = 'svelteKitProcessor';

  addEventProcessor(svelteKitProcessor);
}

/**
 * To actually detect a SvelteKit frontend, we search the DOM for a special
 * div that's inserted by SvelteKit when the page is rendered. It's identifyed
 * by its id, 'svelte-announcer', and it's used to improve page accessibility.
 * This div is not present when only using Svelte without SvelteKit.
 *
 * @see https://github.com/sveltejs/kit/issues/307 for more information
 */
export function isSvelteKitApp(): boolean {
  return getDomElement('div#svelte-announcer') !== null;
}
