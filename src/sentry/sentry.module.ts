import { Global, Module } from '@nestjs/common';

/**
 * SentryModule — stub documental.
 *
 * La inicialización de Sentry se realiza en `instrument.ts` de cada servicio
 * (side-effect import, primera línea de main.ts) mediante `initSentry()`.
 * Este módulo existe para satisfacer el contrato del PRD y permitir futuras
 * extensiones (p.ej. SentryInterceptor, SentryTraceService) sin cambiar la API.
 *
 * No requiere registro en AppModule mientras no exporte providers.
 */
@Global()
@Module({})
export class SentryModule {}
