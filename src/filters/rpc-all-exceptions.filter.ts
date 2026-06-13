import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseRpcExceptionFilter, RpcException } from '@nestjs/microservices';
import * as Sentry from '@sentry/node';
import { RpcErrorResponse } from '../interfaces';

/**
 * ClsService-compatible interface. We use `any` typed cls to avoid a hard
 * compile-time dependency on `nestjs-cls` inside common-lib (it remains a
 * peerDependency of consumers). The filter reads `traceId` via the duck-typed
 * `get` method, mirroring the same pattern used in TracingSerializer and
 * ClsRpcInterceptor.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClsLike = { get: (key: string) => any } | undefined | null;

@Catch()
export class RpcAllExceptionsFilter extends BaseRpcExceptionFilter {
  private readonly logger = new Logger(RpcAllExceptionsFilter.name);

  constructor(
    private readonly service?: string,
    private readonly cls?: ClsLike,
  ) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const traceId: string | undefined = this.cls?.get?.('traceId');

    if (exception instanceof RpcException) {
      const rpcError = exception.getError();
      const message =
        typeof rpcError === 'string' ? rpcError : JSON.stringify(rpcError);

      const status =
        typeof rpcError === 'object' &&
        rpcError !== null &&
        'status' in rpcError
          ? Number((rpcError as { status: number }).status)
          : HttpStatus.BAD_REQUEST;

      this.logger.error(`Handled RPC exception: ${message}`);

      if (status >= 500) {
        Sentry.captureException(exception, {
          tags: { service: this.service ?? 'unknown-ms' },
          extra: { traceId },
        });
      } else {
        Sentry.logger.warn('4xx rpc error', {
          service: this.service ?? 'unknown-ms',
          status,
          traceId,
          message,
        });
      }

      return super.catch(exception, host);
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : Array.isArray((response as RpcErrorResponse).message)
            ? (response as RpcErrorResponse).message
            : (response as RpcErrorResponse).message ?? exception.message;

      this.logger.error(
        `Handled HTTP exception as RPC: ${JSON.stringify(message)}`,
      );

      if (status >= 500) {
        Sentry.captureException(exception, {
          tags: { service: this.service ?? 'unknown-ms' },
          extra: { traceId },
        });
      } else {
        Sentry.logger.warn('4xx http error', {
          service: this.service ?? 'unknown-ms',
          status,
          traceId,
          message: JSON.stringify(message),
        });
      }

      return super.catch(
        new RpcException({ status, message } satisfies RpcErrorResponse),
        host,
      );
    }

    const message =
      exception instanceof Error ? exception.message : 'Internal server error';
    const stack = exception instanceof Error ? exception.stack : undefined;
    const code = (exception as Record<string, unknown>)?.['code'];
    const meta = (exception as Record<string, unknown>)?.['meta'];

    this.logger.error(
      `Unhandled exception${code ? ` [${code}]` : ''}${meta ? ` meta=${JSON.stringify(meta)}` : ''}: ${message}`,
      stack,
    );

    // Unhandled exceptions are always >= 500
    Sentry.captureException(exception, {
      tags: { service: this.service ?? 'unknown-ms' },
      extra: { traceId },
    });

    return super.catch(
      new RpcException({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message,
      } satisfies RpcErrorResponse),
      host,
    );
  }
}
