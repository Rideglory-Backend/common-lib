import { PII_REDACT_PATHS } from './pii-denylist';

/**
 * Options bag returned by pinoHttpOptions and accepted by nestjs-pino's
 * LoggerModule.forRoot / LoggerModule.forRootAsync.
 *
 * The `mixin` callback is typed as optional so that microservices can pass
 * a ClsService resolver without the common-lib taking a hard dep on nestjs-cls
 * (it is a peerDependency of consumers, not a direct dep of the lib).
 */
export interface PinoHttpParams {
  pinoHttp: {
    name: string;
    level: string;
    redact: { paths: string[]; censor: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mixin?: () => Record<string, unknown>;
    transport?: { target: string };
  };
}

/**
 * Factory for pino-http options shared by all 6 services.
 *
 * @param context   - service name label (e.g. 'UsersMicroservice')
 * @param getTraceId - optional callback that returns the current traceId from
 *   the CLS store. Provide this in each MS's AppModule.forRootAsync useFactory
 *   by injecting ClsService and returning `() => cls.get('traceId')`.
 *   When provided, every pino log line will include `{ traceId }` (AC-1).
 */
export function pinoHttpOptions(
  context: string,
  getTraceId?: () => string | undefined,
): PinoHttpParams {
  const isProd = process.env['NODE_ENV'] === 'production';
  return {
    pinoHttp: {
      name: context,
      level: isProd ? 'info' : 'debug',
      redact: { paths: PII_REDACT_PATHS, censor: '[REDACTED]' },
      ...(getTraceId
        ? {
            mixin: () => {
              const traceId = getTraceId();
              return traceId ? { traceId } : {};
            },
          }
        : {}),
      ...(isProd ? {} : { transport: { target: 'pino-pretty' } }),
    },
  };
}
