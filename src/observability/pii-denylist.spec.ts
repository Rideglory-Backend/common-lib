import { PII_SENSITIVE_FIELDS, PII_REDACT_PATHS } from './pii-denylist';
import { PiiRedactInterceptor } from './pii-redact.interceptor';

/**
 * Anti-regression: verifies that known PII fields are redacted and that
 * adding a new sensitive field without updating the denylist is caught.
 */
describe('PII Denylist — anti-regression', () => {
  const interceptor = new PiiRedactInterceptor();
  // Access private method via type cast for white-box testing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const redact = (v: unknown) => (interceptor as any).redact(v);

  it('should define known PII sensitive fields', () => {
    const required = [
      'authorization',
      'password',
      'email',
      'phone',
      'phoneNumber',
      'soatNumber',
      'licensePlate',
      'vin',
      'idToken',
      'token',
      'firebaseToken',
      'fcmToken',
    ];

    for (const field of required) {
      expect(PII_SENSITIVE_FIELDS).toContain(field);
    }
  });

  it('should redact authorization field', () => {
    const result = redact({ authorization: 'Bearer secret-token' }) as Record<string, unknown>;
    expect(result['authorization']).toBe('[REDACTED]');
  });

  it('should redact password field', () => {
    const result = redact({ password: 'my-secret' }) as Record<string, unknown>;
    expect(result['password']).toBe('[REDACTED]');
  });

  it('should redact email field', () => {
    const result = redact({ email: 'user@example.com' }) as Record<string, unknown>;
    expect(result['email']).toBe('[REDACTED]');
  });

  it('should redact phone field', () => {
    const result = redact({ phone: '+573001234567' }) as Record<string, unknown>;
    expect(result['phone']).toBe('[REDACTED]');
  });

  it('should redact licensePlate field', () => {
    const result = redact({ licensePlate: 'ABC123' }) as Record<string, unknown>;
    expect(result['licensePlate']).toBe('[REDACTED]');
  });

  it('should redact vin field', () => {
    const result = redact({ vin: '1HGBH41JXMN109186' }) as Record<string, unknown>;
    expect(result['vin']).toBe('[REDACTED]');
  });

  it('should redact soatNumber field', () => {
    const result = redact({ soatNumber: 'SOAT-001' }) as Record<string, unknown>;
    expect(result['soatNumber']).toBe('[REDACTED]');
  });

  it('should redact fcmToken field', () => {
    const result = redact({ fcmToken: 'fcm-token-value' }) as Record<string, unknown>;
    expect(result['fcmToken']).toBe('[REDACTED]');
  });

  it('should NOT redact non-PII fields', () => {
    const result = redact({ name: 'John', eventId: 'abc-123' }) as Record<string, unknown>;
    expect(result['name']).toBe('John');
    expect(result['eventId']).toBe('abc-123');
  });

  it('should redact PII in nested objects', () => {
    const result = redact({ user: { email: 'u@e.com', name: 'Alice' } }) as Record<string, unknown>;
    const user = result['user'] as Record<string, unknown>;
    expect(user['email']).toBe('[REDACTED]');
    expect(user['name']).toBe('Alice');
  });

  it('should redact PII in arrays', () => {
    const result = redact([{ email: 'a@b.com' }, { email: 'c@d.com' }]) as Array<Record<string, unknown>>;
    expect(result[0]['email']).toBe('[REDACTED]');
    expect(result[1]['email']).toBe('[REDACTED]');
  });

  it('PII_REDACT_PATHS should be defined and non-empty', () => {
    expect(PII_REDACT_PATHS.length).toBeGreaterThan(0);
    expect(PII_REDACT_PATHS).toContain('req.headers.authorization');
    expect(PII_REDACT_PATHS).toContain('req.body.password');
  });

  /**
   * Coverage guardrail: every entry in PII_SENSITIVE_FIELDS must appear in at
   * least one PII_REDACT_PATHS path (as the terminal key segment).
   * If a new sensitive field is added to PII_SENSITIVE_FIELDS without a
   * corresponding pino redact path, this test fails.
   */
  it('every PII_SENSITIVE_FIELDS entry must have at least one path in PII_REDACT_PATHS', () => {
    const uncovered: string[] = [];
    for (const field of PII_SENSITIVE_FIELDS) {
      const covered = PII_REDACT_PATHS.some((path) => {
        const parts = path.split('.');
        return parts[parts.length - 1] === field;
      });
      if (!covered) uncovered.push(field);
    }
    expect(uncovered).toHaveLength(0);
  });
});
