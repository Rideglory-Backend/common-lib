import * as Sentry from '@sentry/node';
import { beforeSend, beforeSendLog, beforeBreadcrumb } from './pii-filter';

interface InitSentryOptions {
  tracesSampleRate?: number;
}

/**
 * Initializes Sentry for a given microservice.
 *
 * Gate: skips init when:
 *   - NODE_ENV !== 'production' AND SENTRY_DEV_VERIFY !== 'true'
 *   - dsn is not provided
 *
 * Import this module as the FIRST import in main.ts, before any other module,
 * so that Sentry can instrument NestJS correctly.
 */
export function initSentry(
  service: string,
  dsn?: string,
  opts?: InitSentryOptions,
): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevVerify = process.env.SENTRY_DEV_VERIFY === 'true';

  if (!isProduction && !isDevVerify) {
    return;
  }

  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    tracesSampleRate: opts?.tracesSampleRate ?? 0.1,
    enableLogs: true,
    beforeSend,
    beforeSendLog,
    beforeBreadcrumb,
    initialScope: {
      tags: { service },
    },
  });
}
