import type { Breadcrumb, ErrorEvent, Log } from '@sentry/node';
import { PII_SENSITIVE_FIELDS } from '../observability/pii-denylist';
import { beforeBreadcrumb, beforeSend, beforeSendLog } from './pii-filter';

describe('pii-filter', () => {
  describe('beforeSend', () => {
    it('redacts PII fields from request headers', () => {
      const event: ErrorEvent = {
        type: undefined,
        request: {
          headers: { authorization: 'Bearer token123', 'content-type': 'application/json' },
        },
      };
      const result = beforeSend(event);
      expect(result?.request?.headers?.['authorization']).toBe('[Filtered]');
      expect(result?.request?.headers?.['content-type']).toBe('application/json');
    });

    it('redacts PII fields from request data (object)', () => {
      const event: ErrorEvent = {
        type: undefined,
        request: {
          data: { password: 'secret', email: 'test@test.com', name: 'John' },
        },
      };
      const result = beforeSend(event);
      const data = result?.request?.data as Record<string, unknown>;
      expect(data['password']).toBe('[Filtered]');
      expect(data['email']).toBe('[Filtered]');
      expect(data['name']).toBe('John');
    });

    it('redacts PII from request data (string)', () => {
      const event: ErrorEvent = {
        type: undefined,
        request: {
          data: 'password=secret&name=John',
        },
      };
      const result = beforeSend(event);
      expect(result?.request?.data as string).not.toContain('secret');
      expect(result?.request?.data as string).toContain('[Filtered]');
    });

    it('redacts PII fields from extra', () => {
      const event: ErrorEvent = {
        type: undefined,
        extra: { token: 'abc123', requestId: 'xyz' },
      };
      const result = beforeSend(event);
      expect(result?.extra?.['token']).toBe('[Filtered]');
      expect(result?.extra?.['requestId']).toBe('xyz');
    });

    it('redacts PII from exception values containing key=value patterns', () => {
      const event: ErrorEvent = {
        type: undefined,
        exception: {
          values: [
            { type: 'Error', value: 'Error: password=secret123 is invalid' },
          ],
        },
      };
      const result = beforeSend(event);
      expect(result?.exception?.values?.[0]?.value).not.toContain('secret123');
      expect(result?.exception?.values?.[0]?.value).toContain('[Filtered]');
    });

    it('returns event with non-PII fields intact', () => {
      const event: ErrorEvent = {
        type: undefined,
        extra: { traceId: 'trace-123', service: 'api-gateway' },
      };
      const result = beforeSend(event);
      expect(result?.extra?.['traceId']).toBe('trace-123');
      expect(result?.extra?.['service']).toBe('api-gateway');
    });

    it('covers all PII_SENSITIVE_FIELDS', () => {
      const headers: Record<string, string> = {};
      const data: Record<string, string> = {};
      for (const field of PII_SENSITIVE_FIELDS) {
        headers[field] = 'sensitive-value';
        data[field] = 'sensitive-value';
      }
      const event: ErrorEvent = { type: undefined, request: { headers, data } };
      const result = beforeSend(event);
      for (const field of PII_SENSITIVE_FIELDS) {
        expect(result?.request?.headers?.[field]).toBe('[Filtered]');
        expect((result?.request?.data as Record<string, unknown>)?.[field]).toBe('[Filtered]');
      }
    });
  });

  describe('beforeSendLog', () => {
    it('redacts PII fields from log attributes by key', () => {
      const log = {
        level: 'warn' as const,
        message: 'test',
        attributes: {
          email: { value: 'test@test.com', type: 'string' },
          service: { value: 'api-gateway', type: 'string' },
          password: { value: 'secret', type: 'string' },
        },
      } as unknown as Log;
      const result = beforeSendLog(log);
      const attrs = result.attributes as Record<string, unknown>;
      expect((attrs['email'] as Record<string, unknown>)?.['value']).toBe('[Filtered]');
      expect((attrs['password'] as Record<string, unknown>)?.['value']).toBe('[Filtered]');
      expect((attrs['service'] as Record<string, unknown>)?.['value']).toBe('api-gateway');
    });

    it('scrubs PII embedded by VALUE in string attributes (AC #12)', () => {
      // Simulates a 4xx log where the message attribute contains embedded PII
      const log = {
        level: 'warn' as const,
        message: '4xx rpc error',
        attributes: {
          message: {
            value: 'Validation failed: email=user@example.com is already taken',
            type: 'string',
          },
          service: { value: 'users-ms', type: 'string' },
          status: { value: 400, type: 'integer' },
        },
      } as unknown as Log;
      const result = beforeSendLog(log);
      const attrs = result.attributes as Record<string, unknown>;
      const msgAttr = attrs['message'] as Record<string, unknown>;
      // The embedded email PII should be scrubbed from the string value
      expect(typeof msgAttr?.['value']).toBe('string');
      expect(msgAttr?.['value'] as string).not.toContain('user@example.com');
      expect(msgAttr?.['value'] as string).toContain('[Filtered]');
      // Non-PII string attributes unchanged
      expect((attrs['service'] as Record<string, unknown>)?.['value']).toBe('users-ms');
    });

    it('scrubs PII embedded in password key=value pattern in log value', () => {
      const log = {
        level: 'warn' as const,
        message: 'auth error',
        attributes: {
          message: {
            value: 'Login failed: password=supersecret123',
            type: 'string',
          },
        },
      } as unknown as Log;
      const result = beforeSendLog(log);
      const attrs = result.attributes as Record<string, unknown>;
      const msgAttr = attrs['message'] as Record<string, unknown>;
      expect(msgAttr?.['value'] as string).not.toContain('supersecret123');
      expect(msgAttr?.['value'] as string).toContain('[Filtered]');
    });

    it('returns log without attributes unchanged', () => {
      const log = { level: 'info' as const, message: 'no attributes' } as unknown as Log;
      const result = beforeSendLog(log);
      expect(result.message).toBe('no attributes');
    });
  });

  describe('beforeBreadcrumb', () => {
    it('redacts PII fields from breadcrumb data', () => {
      const breadcrumb: Breadcrumb = {
        category: 'http',
        data: { authorization: 'Bearer token', url: '/api/users' },
      };
      const result = beforeBreadcrumb(breadcrumb);
      expect(result?.data?.['authorization']).toBe('[Filtered]');
      expect(result?.data?.['url']).toBe('/api/users');
    });

    it('returns breadcrumb without data unchanged', () => {
      const breadcrumb: Breadcrumb = { category: 'navigation', message: 'page load' };
      const result = beforeBreadcrumb(breadcrumb);
      expect(result?.message).toBe('page load');
    });
  });
});
