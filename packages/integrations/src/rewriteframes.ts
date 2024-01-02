import { convertIntegrationFnToClass } from '@sentry/core';
import type { Event, IntegrationFn, StackFrame, Stacktrace } from '@sentry/types';
import { basename, relative } from '@sentry/utils';

type StackFrameIteratee = (frame: StackFrame) => StackFrame;

const INTEGRATION_NAME = 'RewriteFrames';

interface RewriteFramesOptions {
  root?: string;
  prefix?: string;
  iteratee?: StackFrameIteratee;
}

const rewriteFramesIntegration = ((options: RewriteFramesOptions = {}) => {
  const root = options.root;
  const prefix = options.prefix || 'app:///';

  const iteratee: StackFrameIteratee =
    options.iteratee ||
    ((frame: StackFrame) => {
      if (!frame.filename) {
        return frame;
      }
      // Determine if this is a Windows frame by checking for a Windows-style prefix such as `C:\`
      const isWindowsFrame =
        /^[a-zA-Z]:\\/.test(frame.filename) ||
        // or the presence of a backslash without a forward slash (which are not allowed on Windows)
        (frame.filename.includes('\\') && !frame.filename.includes('/'));
      // Check if the frame filename begins with `/`
      const startsWithSlash = /^\//.test(frame.filename);
      if (isWindowsFrame || startsWithSlash) {
        const filename = isWindowsFrame
          ? frame.filename
              .replace(/^[a-zA-Z]:/, '') // remove Windows-style prefix
              .replace(/\\/g, '/') // replace all `\\` instances with `/`
          : frame.filename;
        const base = root ? relative(root, filename) : basename(filename);
        frame.filename = `${prefix}${base}`;
      }
      return frame;
    });

  function _processExceptionsEvent(event: Event): Event {
    try {
      return {
        ...event,
        exception: {
          ...event.exception,
          // The check for this is performed inside `process` call itself, safe to skip here
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          values: event.exception!.values!.map(value => ({
            ...value,
            ...(value.stacktrace && { stacktrace: _processStacktrace(value.stacktrace) }),
          })),
        },
      };
    } catch (_oO) {
      return event;
    }
  }

  function _processStacktrace(stacktrace?: Stacktrace): Stacktrace {
    return {
      ...stacktrace,
      frames: stacktrace && stacktrace.frames && stacktrace.frames.map(f => iteratee(f)),
    };
  }

  return {
    name: INTEGRATION_NAME,
    processEvent(originalEvent) {
      let processedEvent = originalEvent;

      if (originalEvent.exception && Array.isArray(originalEvent.exception.values)) {
        processedEvent = _processExceptionsEvent(processedEvent);
      }

      return processedEvent;
    },
  };
}) satisfies IntegrationFn;

/** Rewrite event frames paths */
// eslint-disable-next-line deprecation/deprecation
export const RewriteFrames = convertIntegrationFnToClass(INTEGRATION_NAME, rewriteFramesIntegration);
