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
    value: Buffer | string,
  ): IncomingRequest & { data: { _meta?: TcpMeta; [key: string]: unknown } } {
    const raw = typeof value === 'string' ? value : value.toString('utf8');
    const parsed = JSON.parse(raw) as {
      pattern?: unknown;
      id?: string;
      data?: { _meta?: TcpMeta; [key: string]: unknown };
    };

    return {
      pattern: parsed.pattern,
      id: parsed.id,
      data: parsed.data ?? {},
    };
  }
}
