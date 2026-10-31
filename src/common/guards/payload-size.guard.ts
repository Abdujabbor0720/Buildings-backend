import {
  CanActivate,
  ExecutionContext,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * HAJMNI OLDINDAN TEKSHIRISH.
 *
 * ⚠️ Multer cheklovi faqat BAYTLAR KELGANDA ishlaydi: 500 MB lik faylni
 * rad etish uchun uning 100 MB ini qabul qilib bo‘lish kerak edi. Sekin
 * mobil internetda bu bir necha daqiqa kutish va bekorga sarflangan
 * trafik degani.
 *
 * `Content-Length` sarlavhasi so‘rov boshida keladi — shu yerda
 * tekshirilsa, mijoz darhol 413 oladi va yuklash umuman boshlanmaydi.
 *
 * ⚠️ Bu multer cheklovini ALMASHTIRMAYDI, faqat qo‘shimcha: `Content-Length`
 * yolg‘on bo‘lishi yoki `chunked` uzatishda umuman bo‘lmasligi mumkin.
 */
@Injectable()
export class PayloadSizeGuard implements CanActivate {
  /** multipart qobig‘i (chegaralar, sarlavhalar) uchun zaxira. */
  private static readonly OVERHEAD_BYTES = 1024 * 1024;

  private readonly maxBytes: number;

  constructor(config: ConfigService) {
    this.maxBytes =
      (config.get<number>('upload.maxFileSizeMb') ?? 100) * 1024 * 1024;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['content-length'];
    if (!header) return true;

    const declared = Number(header);
    if (!Number.isFinite(declared)) return true;

    if (declared > this.maxBytes + PayloadSizeGuard.OVERHEAD_BYTES) {
      const limitMb = Math.round(this.maxBytes / 1024 / 1024);
      const gotMb = Math.round(declared / 1024 / 1024);
      throw new PayloadTooLargeException(
        `Fayl hajmi ${limitMb} MB dan oshmasligi kerak (yuborilmoqda: ${gotMb} MB)`,
      );
    }

    return true;
  }
}
