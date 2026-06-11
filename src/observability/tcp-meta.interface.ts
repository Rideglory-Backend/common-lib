export interface TcpMeta {
  traceId: string;
  [key: string]: unknown; // Fase 2 añadirá sentryTrace, baggage
}
