import { TracingDeserializer } from './tracing-deserializer';

describe('TracingDeserializer', () => {
  const deserializer = new TracingDeserializer();

  it('should extract traceId from data._meta when present', () => {
    const payload = JSON.stringify({
      pattern: 'find_user',
      id: 'req-1',
      data: { userId: '42', _meta: { traceId: 'trace-abc-123' } },
    });

    const result = deserializer.deserialize(Buffer.from(payload));

    expect(result.pattern).toBe('find_user');
    expect(result.id).toBe('req-1');
    expect(result.data['_meta']).toBeDefined();
    expect((result.data['_meta'] as { traceId: string }).traceId).toBe('trace-abc-123');
    expect(result.data['userId']).toBe('42');
  });

  it('should handle missing _meta gracefully (backwards compatible)', () => {
    const payload = JSON.stringify({
      pattern: 'find_user',
      data: { userId: '42' },
    });

    const result = deserializer.deserialize(Buffer.from(payload));

    expect(result.data['_meta']).toBeUndefined();
    expect(result.data['userId']).toBe('42');
  });

  it('should handle string input as well as Buffer', () => {
    const payload = JSON.stringify({
      pattern: 'ping',
      data: { msg: 'hello' },
    });

    const result = deserializer.deserialize(payload);

    expect(result.pattern).toBe('ping');
    expect(result.data['msg']).toBe('hello');
  });

  it('should default data to empty object when absent', () => {
    const payload = JSON.stringify({ pattern: 'health' });

    const result = deserializer.deserialize(Buffer.from(payload));

    expect(result.data).toEqual({});
  });

  it('should preserve all non-PII fields in data unchanged', () => {
    const payload = JSON.stringify({
      pattern: 'create_event',
      data: {
        title: 'Ruta Norte',
        date: '2026-07-01',
        _meta: { traceId: 'trace-xyz' },
      },
    });

    const result = deserializer.deserialize(Buffer.from(payload));

    expect(result.data['title']).toBe('Ruta Norte');
    expect(result.data['date']).toBe('2026-07-01');
  });
});
