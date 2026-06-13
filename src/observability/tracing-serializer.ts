import { Serializer } from '@nestjs/microservices';
import { TcpMeta } from './tcp-meta.interface';

/**
 * Gateway-side TCP serializer.
 * Reads traceId from a CLS-compatible store and injects it into the
 * outgoing TCP envelope as `data._meta` without modifying `.send()`,
 * DTOs or any of the ~56 message patterns.
 *
 * The cls parameter is typed as `any` so that common-lib does not take a
 * hard dependency on nestjs-cls (it remains a peerDependency of consumers).
 */
export class TracingSerializer implements Serializer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly cls: any) {}

  serialize(value: { data?: Record<string, unknown>; [key: string]: unknown }) {
    const traceId: string | undefined = this.cls?.get?.('traceId');

    if (traceId && value?.data !== undefined) {
      const meta: TcpMeta = { traceId };
      const sentryTrace: string | undefined = this.cls?.get?.('sentryTrace');
      const baggage: string | undefined = this.cls?.get?.('baggage');
      if (sentryTrace) meta.sentryTrace = sentryTrace;
      if (baggage) meta.baggage = baggage;
      (value.data as Record<string, unknown>)['_meta'] = meta;
    }

    return JSON.stringify(value);
  }
}
