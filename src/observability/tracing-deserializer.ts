import { Deserializer, IncomingRequest } from '@nestjs/microservices';
import { TcpMeta } from './tcp-meta.interface';

/**
 * MS-side TCP deserializer.
 * Parses the incoming TCP buffer and preserves `data._meta` (including
 * `traceId`) so that ClsRpcInterceptor can seed the CLS store.
 * Gracefully tolerates messages without `_meta` (backwards compatible).
 */
export class TracingDeserializer implements Deserializer {
  deserialize(
    value: unknown,
  ): IncomingRequest & { data: { _meta?: TcpMeta; [key: string]: unknown } } {
    let parsed: {
      pattern?: unknown;
      id?: string;
      data?: { _meta?: TcpMeta; [key: string]: unknown };
    };

    if (typeof value === 'string') {
      parsed = JSON.parse(value);
    } else if (Buffer.isBuffer(value)) {
      parsed = JSON.parse(value.toString('utf8'));
    } else {
      // NestJS already parses the JSON in TcpSocket.emitMessage when the caller
      // uses the default IdentitySerializer — the packet arrives as a plain object.
      parsed = value as typeof parsed;
    }

    return {
      pattern: parsed?.pattern,
      id: parsed?.id,
      data: parsed?.data ?? {},
    };
  }
}
