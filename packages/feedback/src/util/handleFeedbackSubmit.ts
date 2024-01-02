import type { TransportMakeRequestResponse } from '@sentry/types';
import { logger } from '@sentry/utils';

import { FEEDBACK_WIDGET_SOURCE } from '../constants';
import { DEBUG_BUILD } from '../debug-build';
import { sendFeedback } from '../sendFeedback';
import type { FeedbackFormData, SendFeedbackOptions } from '../types';
import type { DialogComponent } from '../widget/Dialog';

/**
 * Handles UI behavior of dialog when feedback is submitted, calls
 * `sendFeedback` to send feedback.
 */
export async function handleFeedbackSubmit(
  dialog: DialogComponent | null,
  feedback: FeedbackFormData,
  options?: SendFeedbackOptions,
): Promise<TransportMakeRequestResponse | void> {
  if (!dialog) {
    // Not sure when this would happen
    return;
  }

  const showFetchError = (): void => {
    if (!dialog) {
      return;
    }
    dialog.showError('There was a problem submitting feedback, please wait and try again.');
  };

  dialog.hideError();

  try {
    const resp = await sendFeedback({ ...feedback, source: FEEDBACK_WIDGET_SOURCE }, options);

    // Success!
    return resp;
  } catch (err) {
    DEBUG_BUILD && logger.error(err);
    showFetchError();
  }
}
