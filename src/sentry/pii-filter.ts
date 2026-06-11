import type { Breadcrumb, ErrorEvent, Log } from '@sentry/node';
import { PII_SENSITIVE_FIELDS } from '../observability/pii-denylist';

const REDACTED = '[Filtered]';

/**
 * Checks if a key matches any PII sensitive field (case-insensitive).
 */
function isPiiKey(key: string): boolean {
  const lower = key.toLowerCase();
  return PII_SENSITIVE_FIELDS.some((field) => field.toLowerCase() === lower);
}

/**
 * Scrubs PII fields from a plain object, returning a new object.
 */
function scrubObject(
  obj: Record<string, unknown> | undefined | null,
): Record<string, unknown> | undefined | null {
  if (!obj || typeof obj !== 'object') return obj;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = isPiiKey(key) ? REDACTED : value;
  }
  return result;
}

/**
 * Scrubs PII from exception value strings using regex patterns.
 */
function scrubString(value: string | undefined): string | undefined {
  if (!value) return value;
  let result = value;
  for (const field of PII_SENSITIVE_FIELDS) {
    // Matches key=value or "key":"value" patterns in stringified data
    const pattern = new RegExp(
      `("?${field}"?\\s*[:=]\\s*)"?([^"',\\s}]+)"?`,
      'gi',
    );
    result = result.replace(pattern, `$1${REDACTED}`);
  }
  return result;
}

/**
 * beforeSend hook: scrubs PII from request headers, request body, extra,
 * and exception values before the event is sent to Sentry.
 */
export function beforeSend(event: ErrorEvent): ErrorEvent | null {
  if (event.request) {
    if (event.request.headers) {
      event.request.headers = scrubObject(
        event.request.headers as Record<string, unknown>,
      ) as Record<string, string>;
    }
    if (event.request.data) {
      if (typeof event.request.data === 'object') {
        event.request.data = scrubObject(
          event.request.data as Record<string, unknown>,
        );
      } else if (typeof event.request.data === 'string') {
        event.request.data = scrubString(event.request.data);
      }
    }
  }

  if (event.extra) {
    event.extra = scrubObject(event.extra as Record<string, unknown>) as Record<
      string,
      unknown
    >;
  }

  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((exValue) => ({
      ...exValue,
      value: scrubString(exValue.value),
    }));
  }

  return event;
}

/**
 * beforeSendLog hook: scrubs PII from structured log attributes.
 * - Keys matching PII_SENSITIVE_FIELDS → value replaced with REDACTED
 * - String values of non-PII keys → scrubString applied so embedded PII
 *   (e.g. "password=secret" inside a message string) is also filtered
 */
export function beforeSendLog(log: Log): Log {
  if (log.attributes && typeof log.attributes === 'object') {
    const scrubbed: Record<string, unknown> = {};
    for (const [key, attr] of Object.entries(log.attributes)) {
      if (isPiiKey(key)) {
        scrubbed[key] = { value: REDACTED, type: 'string' };
      } else if (
        attr !== null &&
        typeof attr === 'object' &&
        'value' in (attr as object) &&
        typeof (attr as { value: unknown }).value === 'string'
      ) {
        // Scrub PII embedded in the string value of the attribute
        const scrubbedValue = scrubString(
          (attr as { value: string }).value,
        );
        scrubbed[key] = { ...(attr as object), value: scrubbedValue };
      } else {
        scrubbed[key] = attr;
      }
    }
    log.attributes = scrubbed as typeof log.attributes;
  }
  return log;
}

/**
 * beforeBreadcrumb hook: scrubs PII from breadcrumb data.
 */
export function beforeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.data) {
    breadcrumb.data = scrubObject(
      breadcrumb.data as Record<string, unknown>,
    ) as Record<string, unknown>;
  }
  return breadcrumb;
}
