import { pinoHttpOptions } from './logger-options.factory';

describe('pinoHttpOptions', () => {
  it('should return basic pino-http config without mixin when no getTraceId is provided', () => {
    const opts = pinoHttpOptions('TestService');
    expect(opts.pinoHttp.name).toBe('TestService');
    expect(opts.pinoHttp.redact).toBeDefined();
    expect(opts.pinoHttp.mixin).toBeUndefined();
  });

  it('should include mixin when getTraceId is provided', () => {
    const opts = pinoHttpOptions('TestService', () => 'trace-abc');
    expect(opts.pinoHttp.mixin).toBeDefined();
  });

  it('mixin should return { traceId } when getTraceId returns a string (AC-1)', () => {
    const getTraceId = jest.fn().mockReturnValue('trace-abc-123');
    const opts = pinoHttpOptions('TestService', getTraceId);
    const result = opts.pinoHttp.mixin!();
    expect(result).toEqual({ traceId: 'trace-abc-123' });
    expect(getTraceId).toHaveBeenCalledTimes(1);
  });

  it('mixin should return {} when getTraceId returns undefined (no active request)', () => {
    const getTraceId = jest.fn().mockReturnValue(undefined);
    const opts = pinoHttpOptions('TestService', getTraceId);
    const result = opts.pinoHttp.mixin!();
    expect(result).toEqual({});
  });

  it('should include redact config with PII paths', () => {
    const opts = pinoHttpOptions('TestService');
    expect(opts.pinoHttp.redact.paths).toContain('req.headers.authorization');
    expect(opts.pinoHttp.redact.paths).toContain('req.body.password');
    expect(opts.pinoHttp.redact.censor).toBe('[REDACTED]');
  });

  it('should use info level in production', () => {
    process.env['NODE_ENV'] = 'production';
    const opts = pinoHttpOptions('TestService');
    expect(opts.pinoHttp.level).toBe('info');
    expect(opts.pinoHttp.transport).toBeUndefined();
    delete process.env['NODE_ENV'];
  });

  it('should use debug level and pino-pretty transport outside production', () => {
    process.env['NODE_ENV'] = 'development';
    const opts = pinoHttpOptions('TestService');
    expect(opts.pinoHttp.level).toBe('debug');
    expect(opts.pinoHttp.transport).toBeDefined();
    expect(opts.pinoHttp.transport!.target).toBe('pino-pretty');
    delete process.env['NODE_ENV'];
  });
});
