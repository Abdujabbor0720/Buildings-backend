import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator';

export interface ApiEnvelope<T> {
  success: true;
  data: T;
  meta?: unknown;
  timestamp: string;
}

/**
 * Hamma javob BITTA shaklda qaytadi: `{ success, data, meta }`.
 * Frontend shu tufayli har endpoint uchun alohida parser yozmaydi.
 * `@RawResponse()` — fayl yuklab berish kabi istisnolar uchun.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiEnvelope<T> | T
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiEnvelope<T> | T> {
    const isRaw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isRaw) return next.handle();

    return next.handle().pipe(
      map((payload) => {
        const timestamp = new Date().toISOString();

        // Servis `{ items, meta }` qaytarsa — meta'ni konvertdan tashqariga chiqaramiz.
        if (
          payload &&
          typeof payload === 'object' &&
          'items' in (payload as object) &&
          'meta' in (payload as object)
        ) {
          const p = payload as unknown as { items: unknown; meta: unknown };
          return {
            success: true,
            data: p.items,
            meta: p.meta,
            timestamp,
          } as ApiEnvelope<T>;
        }

        return { success: true, data: payload, timestamp };
      }),
    );
  }
}
