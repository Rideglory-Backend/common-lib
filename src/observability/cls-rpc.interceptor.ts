import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import * as Sentry from '@sentry/node';
import { TcpMeta } from './tcp-meta.interface';

/**
 * MS-side interceptor that seeds the CLS store with `traceId` extracted
 * from `data._meta` (populated by TracingDeserializer).
 *
 * The cls parameter is injected via constructor; common-lib keeps nestjs-cls
 * as a peerDependency of consumers (not a direct dep of the lib).
 *
 * Register as global APP_INTERCEPTOR in each microservice AppModule.
 *
 * ClsModule is configured with `middleware: { mount: false }` in all MSs
 * because TCP transports never go through HTTP middleware.  Without an active
 * CLS context, cls.set() throws "Cannot set the key … No CLS context
 * available".  We therefore open a new CLS context with cls.run() before
 * calling set(), which guarantees a valid store for the lifetime of the RPC
 * handler regardless of whether a parent context already exists.
 */
@Injectable()
export class ClsRpcInterceptor implements NestInterceptor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly cls: any) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'rpc') {
      const data = context.getArgByIndex<{
        _meta?: TcpMeta;
        [key: string]: unknown;
      }>(0);
      const traceId = data?._meta?.traceId;
      const sentryTrace = data?._meta?.sentryTrace;
      const baggage = data?._meta?.baggage;
      // Strip _meta before the handler runs so it never reaches service DTOs or Prisma.
      delete data._meta;
      if (traceId) {
        // cls.run() creates a fresh AsyncLocalStorage context so that
        // cls.set() never throws "No CLS context available", which is the
        // failure mode when the TCP transport skips the HTTP middleware that
        // would normally mount the CLS store.
        return new Observable((subscriber) => {
          void this.cls.run(() => {
            this.cls.set('traceId', traceId);
            if (sentryTrace) {
              Sentry.continueTrace({ sentryTrace, baggage }, () => {
                next.handle().subscribe(subscriber);
              });
            } else {
              next.handle().subscribe(subscriber);
            }
          });
        });
      }
    }
    return next.handle();
  }
}
