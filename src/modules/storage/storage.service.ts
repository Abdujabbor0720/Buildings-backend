import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { DetectedType } from './file-type.helpers';
import { createSpacesConnection } from './spaces.client';

export interface PutResult {
  key: string;
  size: number;
  /** Tashqariga beriladigan manzil: ochiq bucket'da — to‘g‘ridan-to‘g‘ri CDN. */
  url: string;
}

/**
 * OBYEKT XOTIRASI — DigitalOcean Spaces (S3 bilan mos).
 *
 * ⚠️ Lokal `uploads/` papkasi YO‘Q va qaytarilmaydi. Sabablari:
 *   • bir nechta server nusxasi ishlaganda fayl faqat bittasida bo‘ladi;
 *   • konteyner qayta yaratilganda disk tozalanadi;
 *   • zaxira nusxa (backup) ilova diskiga bog‘lanib qolardi.
 *
 * ⚠️ Fayl KATTA bo‘lishi mumkin (100 MB gacha video). Shuning uchun u
 * xotiraga TO‘LIQ yig‘ilmaydi: `lib-storage` oqimni bo‘laklab (multipart)
 * yuboradi. Aks holda bir nechta parallel yuklov serverni yiqitardi.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private readonly signedTtl: number;

  constructor(private readonly config: ConfigService) {
    const connection = createSpacesConnection();
    this.client = connection.client;
    this.bucket = connection.bucket;
    this.publicBaseUrl = connection.publicBaseUrl;
    this.signedTtl = this.config.get<number>('storage.signedUrlTtlSec') ?? 900;
  }

  /** Ochiq bucket'mi — havola turini shu hal qiladi. */
  get isPublic(): boolean {
    return this.publicBaseUrl.length > 0;
  }

  /**
   * Ishga tushganda ulanish TEKSHIRILADI.
   * ⚠️ Birinchi yuklovni kutib o‘tirmaymiz: noto‘g‘ri kalit bilan ishga
   * tushgan server soatlab «sog‘lom» ko‘rinib turib, birinchi suratda
   * yiqilardi.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(
        `Spaces ulandi: ${this.bucket} (${this.isPublic ? 'ochiq havola' : 'imzolangan havola'})`,
      );
    } catch (error) {
      // Ishga tushishni TO‘XTATMAYMIZ: fayl yuklash ishlamaydi, lekin
      // qolgan modullar (hisobot, moliya) ishlayveradi.
      this.logger.error(
        `Spaces bucket'iga ulanib bo‘lmadi (${this.bucket}). ` +
          `Fayl yuklash ISHLAMAYDI. Sabab: ${describe(error)}`,
      );
    }
  }

  /** `obyektlar/2026/10/<uuid>.jpg` ko‘rinishidagi kalit. */
  buildKey(subdir: string, ext: string): string {
    const now = new Date();
    const safe =
      subdir.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'general';
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${safe}/${yyyy}/${mm}/${randomUUID()}${ext}`;
  }

  /**
   * Oqimni bo‘laklab yuklaydi.
   *
   * ⚠️ `ContentType` va `ContentDisposition` AYNAN shu yerda belgilanadi:
   * ular obyekt bilan birga saqlanadi va keyin CDN shu sarlavhalar bilan
   * beradi. Mijoz aytgan tur emas, ANIQLANGAN tur yoziladi.
   */
  async putStream(
    body: Readable,
    key: string,
    type: DetectedType,
    originalName: string,
  ): Promise<PutResult> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: type.mime,
        ContentDisposition: contentDisposition(type, originalName),
        CacheControl: 'public, max-age=31536000, immutable',
        ...(this.isPublic ? { ACL: 'public-read' as const } : {}),
      },
      // 100 MB fayl ≈ 13 ta bo‘lak; 4 tasi parallel ketadi.
      partSize: 8 * 1024 * 1024,
      queueSize: 4,
      leavePartsOnError: false,
    });

    await upload.done();

    const head = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    return {
      key,
      size: Number(head.ContentLength ?? 0),
      url: this.publicUrl(key),
    };
  }

  async putBuffer(
    buffer: Buffer,
    key: string,
    type: DetectedType,
    originalName: string,
  ): Promise<PutResult> {
    const { Readable: NodeReadable } = await import('node:stream');
    return this.putStream(NodeReadable.from(buffer), key, type, originalName);
  }

  /**
   * Tashqariga beriladigan manzil.
   * Ochiq bucket'da — to‘g‘ridan-to‘g‘ri CDN (serverimiz orqali o‘tmaydi,
   * shuning uchun yuzlab surat bir vaqtda ochilsa ham yuk tushmaydi).
   */
  publicUrl(key: string): string {
    if (!this.isPublic) return '';
    return `${this.publicBaseUrl}/${encodeKey(key)}`;
  }

  /** Yopiq bucket uchun — vaqtinchalik imzolangan havola. */
  signedUrl(key: string, ttlSec = this.signedTtl): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: ttlSec },
    );
  }

  /** Ochiq bo‘lsa doimiy, aks holda imzolangan havola. */
  async resolveUrl(key: string): Promise<string> {
    return this.isPublic ? this.publicUrl(key) : this.signedUrl(key);
  }

  /** Server ichida o‘qish (masalan, AI tahlili uchun). */
  async getStream(key: string): Promise<Readable> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!result.Body) {
      throw new InternalServerErrorException('Fayl mazmuni bo‘sh qaytdi');
    }
    return result.Body as Readable;
  }

  async getBuffer(key: string): Promise<Buffer> {
    const stream = await this.getStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBufferLike),
      );
    }
    return Buffer.concat(chunks);
  }

  /**
   * ⚠️ O‘chirish XATO BERMAYDI. Bu doim boshqa amalning (baza yozuvini
   * o‘chirish, yiqilgan yuklovni tozalash) oxirgi qadami bo‘ladi va
   * uning muvaffaqiyatini bekor qilmasligi kerak.
   */
  async remove(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Obyektni o‘chirib bo‘lmadi: ${key} — ${describe(error)}`,
      );
      return false;
    }
  }
}

/**
 * ⚠️ Faqat rasm, video va PDF `inline`. Qolgani — `attachment`.
 * Hujjat brauzerda ochilsa, u bizning domenimizda sahifa sifatida
 * ko‘rinadi; `attachment` buni butunlay yopadi.
 */
function contentDisposition(type: DetectedType, originalName: string): string {
  const mode = type.inline ? 'inline' : 'attachment';
  const safe =
    originalName.replace(/[\r\n"\\]/g, '').slice(0, 200) || `fayl${type.ext}`;
  return `${mode}; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

/** Kalitdagi har bir bo‘lak alohida kodlanadi — `/` ajratgich bo‘lib qoladi. */
function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
