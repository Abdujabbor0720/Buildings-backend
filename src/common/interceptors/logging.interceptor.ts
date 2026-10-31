import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const started = Date.now();

    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - started;
        // Sekin so‘rovni darhol ko‘rish uchun alohida darajada yozamiz.
        const line = `${req.method} ${req.originalUrl} ${res.statusCode} — ${ms}ms`;
        if (ms > 1000) this.logger.warn(`${line} (sekin)`);
        else this.logger.log(line);
      }),
    );
  }
}
