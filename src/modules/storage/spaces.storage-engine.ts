import {
  BadRequestException,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Readable } from 'node:stream';
import type { StorageEngine } from 'multer';
import {
  ALLOWED_SUMMARY_UZ,
  detectFileType,
  SNIFF_BYTES,
  type DetectedType,
} from './file-type.helpers';
import type { StorageService } from './storage.service';

/** `_handleFile` natijasi — `Express.Multer.File` ga qo‘shiladi. */
export interface SpacesFileInfo {
  key: string;
  size: number;
  url: string;
  mimetype: string;
  detected: DetectedType;
}

/**
 * MULTER DVIGATELI — to‘g‘ridan-to‘g‘ri DigitalOcean Spaces'ga OQIM bilan.
 *
 * ⚠️ Fayl diskka ham, xotiraga ham TO‘LIQ yig‘ilmaydi. 100 MB lik videoni
 * `memoryStorage` bilan qabul qilsak, bir vaqtda kelgan to‘rtta yuklov
 * 400 MB uyum (heap) talab qilardi va server o‘lardi.
 *
 * ⚠️ Tur faylning BIRINCHI BAYTLARIDAN aniqlanadi (`detectFileType`) va
 * aniqlanmasa yuklov O‘SHA ZAHOTI to‘xtaydi — qolgan 99 MB umuman
 * yuborilmaydi.
 *
 * ⚠️ Hajm IKKI joyda tekshiriladi: multer `limits.fileSize` (busboy
 * darajasida) va shu yerda bayt sanog‘i. Birinchisi yetarli emas, chunki
 * u xatoni oqim O‘RTASIDA beradi va yarim yozilgan obyekt qolib ketardi —
 * shuning uchun xatolikda obyekt o‘chiriladi.
 */
export class SpacesStorageEngine implements StorageEngine {
  private readonly logger = new Logger(SpacesStorageEngine.name);

  constructor(
    private readonly storage: StorageService,
    private readonly maxBytes: number,
    private readonly defaultSubdir: string,
  ) {}

  _handleFile(
    req: Request,
    file: Express.Multer.File,
    cb: (error?: unknown, info?: Partial<Express.Multer.File>) => void,
  ): void {
    this.handle(req, file).then(
      (info) => cb(null, info as Partial<Express.Multer.File>),
      (error: unknown) => cb(error),
    );
  }

  _removeFile(
    _req: Request,
    file: Express.Multer.File & { key?: string },
    cb: (error: Error | null) => void,
  ): void {
    // Multer so‘rov bekor bo‘lganda chaqiradi (masalan, boshqa maydon
    // cheklovdan oshsa). Yarim yozilgan obyekt bucket'da qolmasligi kerak.
    if (!file.key) return cb(null);
    void this.storage.remove(file.key).finally(() => cb(null));
  }

  private async handle(
    req: Request,
    file: Express.Multer.File,
  ): Promise<SpacesFileInfo> {
    const { head, body } = await readHead(file.stream, SNIFF_BYTES);

    const detected = detectFileType(head, file.mimetype);
    if (!detected) {
      body.destroy();
      file.stream.destroy();
      throw new BadRequestException(
        `Fayl turi aniqlanmadi yoki qabul qilinmaydi. Ruxsat etilgan: ${ALLOWED_SUMMARY_UZ}.`,
      );
    }

    const subdir = pickSubdir(req, this.defaultSubdir);
    const key = this.storage.buildKey(subdir, detected.ext);

    // Bayt sanog‘i: cheklovdan oshsa oqim xato bilan uziladi va
    // `lib-storage` boshlangan multipart'ni o‘zi bekor qiladi.
    const limited = withSizeLimit(body, this.maxBytes);

    try {
      const result = await this.storage.putStream(
        limited,
        key,
        detected,
        file.originalname,
      );
      return {
        key,
        size: result.size,
        url: result.url,
        mimetype: detected.mime,
        detected,
      };
    } catch (error) {
      // Yiqilgan yuklovdan qolgan obyektni tozalaymiz (multipart o‘zi
      // bekor bo‘ladi, lekin oddiy PUT yarim qolishi mumkin).
      await this.storage.remove(key);
      if (error instanceof PayloadTooLargeException) throw error;
      this.logger.error(`Spaces'ga yuklab bo‘lmadi (${key}): ${String(error)}`);
      throw error;
    }
  }
}

/** `?subdir=` — faqat oq ro‘yxatdagi qiymat, aks holda standart papka. */
const SUBDIRS = new Set(['photos', 'documents', 'avatars', 'general']);

function pickSubdir(req: Request, fallback: string): string {
  const raw = typeof req.query?.subdir === 'string' ? req.query.subdir : '';
  return SUBDIRS.has(raw) ? raw : fallback;
}

/**
 * Oqimning boshidan `n` bayt o‘qiydi va QOLGANI bilan birga yangi oqim
 * qaytaradi.
 *
 * ⚠️ `for await ... break` ISHLATILMAYDI: u manba oqimini YO‘Q QILADI
 * (Node'da `break` → `iterator.return()` → `destroy()`), natijada faylning
 * qolgan qismi yo‘qolardi. Shuning uchun `destroyOnReturn: false`.
 */
async function readHead(
  src: Readable,
  n: number,
): Promise<{ head: Buffer; body: Readable }> {
  const iterator = src.iterator({ destroyOnReturn: false });
  const chunks: Buffer[] = [];
  let length = 0;

  while (length < n) {
    const next = await iterator.next();
    if (next.done) break;
    const chunk = Buffer.isBuffer(next.value)
      ? next.value
      : Buffer.from(next.value as ArrayBufferLike);
    chunks.push(chunk);
    length += chunk.length;
  }

  const head = Buffer.concat(chunks);
  const body = Readable.from(
    (async function* () {
      if (head.length > 0) yield head;
      // Qolgani — O‘SHA iteratordan: manba oqimi yopilmagan.
      for (;;) {
        const next = await iterator.next();
        if (next.done) return;
        yield next.value;
      }
    })(),
  );

  return { head, body };
}

/** Berilgan hajmdan oshsa oqimni xato bilan uzadi. */
function withSizeLimit(src: Readable, maxBytes: number): Readable {
  let seen = 0;
  const mb = Math.round(maxBytes / 1024 / 1024);
  return Readable.from(
    (async function* () {
      for await (const chunk of src) {
        const buf = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk as ArrayBufferLike);
        seen += buf.length;
        if (seen > maxBytes) {
          throw new PayloadTooLargeException(
            `Fayl hajmi ${mb} MB dan oshmasligi kerak`,
          );
        }
        yield buf;
      }
    })(),
  );
}
