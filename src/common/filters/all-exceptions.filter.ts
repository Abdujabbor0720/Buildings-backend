import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { stableString } from '../../helpers/stringify.helpers';
import { QueryFailedError } from 'typeorm';

interface ErrorBody {
  success: false;
  statusCode: number;
  error: { code: string; message: string; details?: unknown };
  path: string;
  timestamp: string;
}

/** PostgreSQL xato kodi → foydalanuvchiga ko‘rinadigan o‘zbekcha xabar. */
const PG_MESSAGES: Record<
  string,
  { status: number; code: string; message: string }
> = {
  '23505': {
    status: HttpStatus.CONFLICT,
    code: 'DUPLICATE_ENTRY',
    message: 'Bunday yozuv allaqachon mavjud',
  },
  '23503': {
    status: HttpStatus.CONFLICT,
    code: 'FOREIGN_KEY_VIOLATION',
    message:
      'Bog‘liq yozuvlar mavjud — avval ularni o‘chiring yoki boshqasiga bog‘lang',
  },
  '23502': {
    status: HttpStatus.BAD_REQUEST,
    code: 'NOT_NULL_VIOLATION',
    message: 'Majburiy maydon to‘ldirilmagan',
  },
  '22P02': {
    status: HttpStatus.BAD_REQUEST,
    code: 'INVALID_INPUT',
    message: 'Yuborilgan qiymat formati noto‘g‘ri',
  },
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.toBody(exception, request);

    // 5xx — stack bilan, 4xx — bitta qator. Aks holda log kutilgan
    // validatsiya xatolari bilan to‘lib ketadi va haqiqiy nosozlik ko‘rinmaydi.
    if (body.statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${body.statusCode} ${body.error.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} → ${body.statusCode} ${body.error.code}: ${body.error.message}`,
      );
    }

    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, request: Request): ErrorBody {
    const base = {
      success: false as const,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        return {
          ...base,
          statusCode: status,
          error: { code: codeFor(status), message: res },
        };
      }

      const obj = res as Record<string, unknown>;
      const raw = obj.message;
      // ValidationPipe massiv qaytaradi — birinchisini xabar, hammasini details qilamiz.
      const message = Array.isArray(raw)
        ? stableString(raw[0]) || 'Ma’lumotlar noto‘g‘ri'
        : stableString(raw) || exception.message;

      return {
        ...base,
        statusCode: status,
        error: {
          code: typeof obj.code === 'string' ? obj.code : codeFor(status),
          message,
          details:
            Array.isArray(raw) && raw.length > 1
              ? raw
              : (obj.details ?? undefined),
        },
      };
    }

    if (exception instanceof QueryFailedError) {
      const pgCode =
        (exception as QueryFailedError & { code?: string }).code ?? '';
      const mapped = PG_MESSAGES[pgCode];
      if (mapped) {
        return {
          ...base,
          statusCode: mapped.status,
          error: { code: mapped.code, message: mapped.message },
        };
      }
      return {
        ...base,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Ma’lumotlar bazasida xatolik yuz berdi',
        },
      };
    }

    return {
      ...base,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Serverda kutilmagan xatolik yuz berdi',
      },
    };
  }
}

/**
 * HTTP holati → mijoz uchun barqaror xato kodi.
 *
 * ⚠️ `switch` o‘rniga jadval: `switch (status)` da `status` `number`
 * bo‘lgani uchun `case HttpStatus.X` enum bilan mos kelmaydi
 * (`no-unsafe-enum-comparison`). Jadval ham o‘qishga qulayroq.
 */
const ERROR_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

function codeFor(status: number): string {
  return ERROR_CODES[status] ?? 'ERROR';
}
