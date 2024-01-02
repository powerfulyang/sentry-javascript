import * as os from 'os';
import type { ServerRuntimeClientOptions } from '@sentry/core';
import { SDK_VERSION, ServerRuntimeClient } from '@sentry/core';

import type { BunClientOptions } from './types';

/**
 * The Sentry Bun SDK Client.
 *
 * @see BunClientOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class BunClient extends ServerRuntimeClient<BunClientOptions> {
  /**
   * Creates a new Bun SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: BunClientOptions) {
    options._metadata = options._metadata || {};
    options._metadata.sdk = options._metadata.sdk || {
      name: 'sentry.javascript.bun',
      packages: [
        {
          name: 'npm:@sentry/bun',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    };

    const clientOptions: ServerRuntimeClientOptions = {
      ...options,
      platform: 'javascript',
      runtime: { name: 'bun', version: Bun.version },
      serverName: options.serverName || global.process.env.SENTRY_NAME || os.hostname(),
    };

    super(clientOptions);
  }
}
