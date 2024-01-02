import type { Event, EventProcessor, Integration } from '@sentry/types';

import { getCurrentHub, getCurrentScope } from '../../src';

export class TestIntegration implements Integration {
  public static id: string = 'TestIntegration';

  public name: string = 'TestIntegration';

  public setupOnce(): void {
    const eventProcessor: EventProcessor = (event: Event) => {
      if (!getCurrentHub().getIntegration(TestIntegration)) {
        return event;
      }

      return null;
    };

    eventProcessor.id = this.name;

    getCurrentScope().addEventProcessor(eventProcessor);
  }
}

export class AddAttachmentTestIntegration implements Integration {
  public static id: string = 'AddAttachmentTestIntegration';

  public name: string = 'AddAttachmentTestIntegration';

  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void): void {
    addGlobalEventProcessor((event, hint) => {
      hint.attachments = [...(hint.attachments || []), { filename: 'integration.file', data: 'great content!' }];
      return event;
    });
  }
}

export class AdHocIntegration implements Integration {
  public static id: string = 'AdHockIntegration';

  public name: string = 'AdHockIntegration';

  public setupOnce(): void {
    // Noop
  }
}
