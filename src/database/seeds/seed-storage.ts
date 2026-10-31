import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import {
  createSpacesConnection,
  type SpacesConnection,
} from '../../modules/storage/spaces.client';

/** Seed suratlari shu prefiks ostida — faqat shular tozalanadi. */
export const SEED_PREFIX = 'seed';

/**
 * SEED SURATLARINI OBYEKT XOTIRASIGA YUKLASH.
 *
 * ⚠️ Seed Nest ilovasidan TASHQARIDA ishlaydi (`ts-node`), shuning uchun
 * `StorageService` emas, umumiy ulanish (`createSpacesConnection`)
 * ishlatiladi — endpoint va imzo uslubi bitta joyda.
 */
export class SeedStorage {
  private readonly connection: SpacesConnection;

  constructor() {
    this.connection = createSpacesConnection();
  }

  /**
   * Avvalgi seed suratlarini o‘chiradi.
   *
   * ⚠️ Bazadagi yozuvlar `TRUNCATE` bilan ketadi, bucket'dagi fayllar esa
   * qolaveradi: seed har ishga tushganda yuzlab «yetim» obyekt to‘planib,
   * oylik hisobni oshirib borardi.
   */
  async clearSeedObjects(): Promise<number> {
    let removed = 0;
    let token: string | undefined;

    do {
      const page = await this.connection.client.send(
        new ListObjectsV2Command({
          Bucket: this.connection.bucket,
          Prefix: `${SEED_PREFIX}/`,
          ContinuationToken: token,
        }),
      );

      const keys = (page.Contents ?? [])
        .map((item) => item.Key)
        .filter((key): key is string => Boolean(key));

      if (keys.length > 0) {
        // DeleteObjects bir so‘rovda 1000 tagacha qabul qiladi —
        // `ListObjectsV2` ham shuncha qaytaradi, mos keladi.
        await this.connection.client.send(
          new DeleteObjectsCommand({
            Bucket: this.connection.bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        removed += keys.length;
      }

      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);

    return removed;
  }

  /** Bitta obyektni yuklaydi va kalit + ommaviy havolani qaytaradi. */
  async put(
    body: Buffer,
    contentType: string,
    ext: string,
  ): Promise<{ key: string; url: string; size: number }> {
    const key = `${SEED_PREFIX}/${randomUUID()}${ext}`;

    await this.connection.client.send(
      new PutObjectCommand({
        Bucket: this.connection.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentDisposition: 'inline',
        CacheControl: 'public, max-age=31536000, immutable',
        ...(this.connection.publicBaseUrl
          ? { ACL: 'public-read' as const }
          : {}),
      }),
    );

    return {
      key,
      url: this.connection.publicBaseUrl
        ? `${this.connection.publicBaseUrl}/${key}`
        : '',
      size: body.length,
    };
  }

  /**
   * Ko‘p obyektni cheklangan parallellik bilan yuklaydi.
   *
   * ⚠️ `Promise.all` bilan 800 ta so‘rovni birdan yuborib bo‘lmaydi:
   * Spaces ularni cheklaydi (`SlowDown`) va ulanishlar soni tugaydi.
   */
  async putMany<T>(
    items: T[],
    build: (
      item: T,
      index: number,
    ) => { body: Buffer; contentType: string; ext: string },
    concurrency = 12,
    onProgress?: (done: number, total: number) => void,
  ): Promise<Array<{ key: string; url: string; size: number }>> {
    const results = new Array<{ key: string; url: string; size: number }>(
      items.length,
    );
    let cursor = 0;
    let done = 0;

    const worker = async (): Promise<void> => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        const spec = build(items[index], index);
        results[index] = await this.put(spec.body, spec.contentType, spec.ext);
        done += 1;
        if (onProgress && done % 50 === 0) onProgress(done, items.length);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, worker),
    );
    onProgress?.(items.length, items.length);
    return results;
  }
}
