import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PII_SENSITIVE_FIELDS } from './pii-denylist';

/**
 * Gateway-side HTTP response interceptor.
 * Strips PII fields from response bodies using the centralised denylist.
 * Register as global APP_INTERCEPTOR in api-gateway AppModule.
 */
@Injectable()
export class PiiRedactInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((responseBody) => this.redact(responseBody)),
    );
  }

  private redact(value: unknown): unknown {
    if (value === null || value === undefined || typeof value !== 'object') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.redact(item));
    }

    const obj = value as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(obj)) {
      const keyLower = key.toLowerCase();
      if (PII_SENSITIVE_FIELDS.some((f) => f.toLowerCase() === keyLower)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = this.redact(val);
      }
    }

    return sanitized;
  }
}
