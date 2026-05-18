import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseRpcExceptionFilter, RpcException } from '@nestjs/microservices';
import { RpcErrorResponse } from '../interfaces';

@Catch()
export class RpcAllExceptionsFilter extends BaseRpcExceptionFilter {
  private readonly logger = new Logger(RpcAllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof RpcException) {
      const rpcError = exception.getError();
      const message =
        typeof rpcError === 'string' ? rpcError : JSON.stringify(rpcError);

      this.logger.error(`Handled RPC exception: ${message}`);
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

    return super.catch(
      new RpcException({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message,
      } satisfies RpcErrorResponse),
      host,
    );
  }
}
