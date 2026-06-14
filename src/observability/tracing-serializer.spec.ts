import { TracingSerializer } from './tracing-serializer';

describe('TracingSerializer', () => {
  const makeClsMock = (traceId?: string) => ({
    get: jest.fn().mockReturnValue(traceId),
  });

  it('should inject _meta.traceId into data when CLS has traceId', () => {
    const cls = makeClsMock('trace-abc-123');
    const serializer = new TracingSerializer(cls);

    const payload = { pattern: 'find_user', data: { userId: '42' } };
    const result = JSON.parse(serializer.serialize(payload)) as {
      data: { _meta?: { traceId: string }; userId: string };
    };

    expect(result.data._meta).toBeDefined();
    expect(result.data._meta!.traceId).toBe('trace-abc-123');
    expect(result.data.userId).toBe('42');
  });

  it('should NOT mutate data when CLS has no traceId', () => {
    const cls = makeClsMock(undefined);
    const serializer = new TracingSerializer(cls);

    const payload = { pattern: 'find_user', data: { userId: '42' } };
    const result = JSON.parse(serializer.serialize(payload)) as {
      data: { _meta?: unknown; userId: string };
    };

    expect(result.data._meta).toBeUndefined();
    expect(result.data.userId).toBe('42');
  });

  it('should serialize the full payload as JSON string', () => {
    const cls = makeClsMock('trace-xyz');
    const serializer = new TracingSerializer(cls);

    const payload = { pattern: 'ping', data: { msg: 'hello' } };
    const result = serializer.serialize(payload);

    expect(typeof result).toBe('string');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('should handle null CLS gracefully', () => {
    const serializer = new TracingSerializer(null);

    const payload = { pattern: 'test', data: { x: 1 } };
    expect(() => serializer.serialize(payload)).not.toThrow();
    const result = JSON.parse(serializer.serialize(payload)) as {
      data: { _meta?: unknown };
    };
    expect(result.data._meta).toBeUndefined();
  });

  it('should handle missing data field gracefully', () => {
    const cls = makeClsMock('trace-123');
    const serializer = new TracingSerializer(cls);

    const payload = { pattern: 'test' };
    expect(() => serializer.serialize(payload)).not.toThrow();
  });

  it('should NOT throw when data is a primitive string (e.g. removeEvent uuid)', () => {
    const cls = makeClsMock('trace-123');
    const serializer = new TracingSerializer(cls);

    const payload = { pattern: 'removeEvent', data: '9aa9daa0-c7e1-4885-b872-066c45a73f89' };
    expect(() => serializer.serialize(payload)).not.toThrow();
    const result = JSON.parse(serializer.serialize(payload)) as { data: unknown };
    expect(result.data).toBe('9aa9daa0-c7e1-4885-b872-066c45a73f89');
  });
});
