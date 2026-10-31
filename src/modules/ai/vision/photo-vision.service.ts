import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { PhotoVisionAnalysis } from '../../../common/contracts/photo-vision.contract';
import { StorageService } from '../../storage/storage.service';
import {
  buildUserPrompt,
  VISION_JSON_SCHEMA,
  VISION_SYSTEM_PROMPT,
  type PromptContext,
} from './photo-vision.prompt';

/** Tahlilga yaroqli rasm turlari — model boshqasini qabul qilmaydi. */
const SUPPORTED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export interface VisionImage {
  /** Bucket ichidagi kalit — ommaviy havola bo‘lmasa shundan o‘qiladi. */
  key: string;
  mimeType: string;
  /** To‘g‘ridan-to‘g‘ri havola (ochiq bucket). */
  url: string;
}

export type VisionOutcome =
  | { ok: true; analysis: PhotoVisionAnalysis; model: string }
  | { ok: false; reason: string; retryable: boolean };

/**
 * SURATDAN BAJARILISHNI BAHOLASH (OpenAI vision).
 *
 * ⚠️ Bu xizmat HECH QACHON istisno otmaydi. U foto-hisobot yaratish
 * oqimidan chaqiriladi va u yerda yiqilsa, mas’ul odam suratni umuman
 * yuklay olmay qolardi. Barcha nosozlik `{ ok: false }` bo‘lib qaytadi.
 *
 * ⚠️ `retryable` farqlanadi: tarmoq uzilishi va cheklov (429) keyin qayta
 * uriniladi, «kalit yaroqsiz» yoki «format mos emas» esa QAYTA
 * URINILMAYDI — aks holda tizim har 10 daqiqada bir xil xatoni takrorlab,
 * log'ni to‘ldirib turardi.
 */
@Injectable()
export class PhotoVisionService {
  private readonly logger = new Logger(PhotoVisionService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;
  private readonly maxImages: number;
  private readonly timeoutMs: number;

  constructor(
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {
    const apiKey = this.config.get<string>('ai.apiKey') ?? '';
    const enabled = this.config.get<boolean>('ai.enabled') ?? false;

    this.model = this.config.get<string>('ai.visionModel') ?? 'gpt-5.4-mini';
    this.maxImages = this.config.get<number>('ai.maxImagesPerReport') ?? 4;
    this.timeoutMs = this.config.get<number>('ai.timeoutMs') ?? 90_000;

    this.client =
      enabled && apiKey
        ? new OpenAI({ apiKey, timeout: this.timeoutMs, maxRetries: 2 })
        : null;

    if (!this.client) {
      this.logger.warn(
        'Suratni AI tahlil qilish O‘CHIQ (OPENAI_API_KEY yo‘q yoki AI_VISION_ENABLED=false). ' +
          'Foto-hisobotlar faqat qoidalar dvigateli bilan tekshiriladi.',
      );
    }
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async analyze(
    context: PromptContext,
    images: VisionImage[],
  ): Promise<VisionOutcome> {
    if (!this.client) {
      return { ok: false, reason: 'AI tahlili o‘chirilgan', retryable: false };
    }

    const usable = images.filter((image) =>
      SUPPORTED_IMAGE_MIME.has(image.mimeType),
    );
    if (usable.length === 0) {
      return {
        ok: false,
        // Demo ma’lumotdagi SVG suratlar aynan shu yo‘lga tushadi.
        reason:
          'Hisobotda tahlil qilinadigan rasm yo‘q (JPG, PNG, WEBP yoki GIF kerak)',
        retryable: false,
      };
    }

    const selected = usable.slice(0, this.maxImages);
    const startedAt = Date.now();

    try {
      const content = await this.buildImageContent(selected);

      const response = await this.client.responses.create(
        {
          model: this.model,
          instructions: VISION_SYSTEM_PROMPT,
          input: [
            {
              role: 'user',
              content: [
                { type: 'input_text', text: buildUserPrompt(context) },
                ...content,
              ],
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'qurilish_bajarilishi',
              strict: true,
              schema: VISION_JSON_SCHEMA as unknown as Record<string, unknown>,
            },
          },
        },
        { timeout: this.timeoutMs },
      );

      const raw = response.output_text;
      if (!raw) {
        return {
          ok: false,
          reason: 'Model bo‘sh javob qaytardi',
          retryable: true,
        };
      }

      const parsed = JSON.parse(raw) as Partial<PhotoVisionAnalysis>;

      return {
        ok: true,
        model: this.model,
        analysis: sanitize(parsed, {
          imagesAnalyzed: selected.length,
          tokensUsed: response.usage?.total_tokens,
          durationMs: Date.now() - startedAt,
        }),
      };
    } catch (error) {
      return { ok: false, ...classify(error) };
    }
  }

  /**
   * Suratni modelga uzatish shakli.
   *
   * ⚠️ Ochiq bucket'da HAVOLA yuboriladi, base64 EMAS: 4 ta 3 MB lik surat
   * base64 da ~16 MB so‘rov bo‘lardi va har tahlilda shuncha trafik
   * serverimizdan o‘tardi. Yopiq bucket'da iloji yo‘q — o‘shanda o‘qib,
   * base64 qilinadi.
   */
  private async buildImageContent(
    images: VisionImage[],
  ): Promise<
    Array<{ type: 'input_image'; image_url: string; detail: 'auto' }>
  > {
    return Promise.all(
      images.map(async (image) => {
        const url = image.url
          ? image.url
          : `data:${image.mimeType};base64,${(await this.storage.getBuffer(image.key)).toString('base64')}`;
        return {
          type: 'input_image' as const,
          image_url: url,
          detail: 'auto' as const,
        };
      }),
    );
  }
}

/**
 * Model javobini ISHONCHSIZ ma’lumot sifatida tozalaydi.
 * ⚠️ `strict` sxema maydonlar BORLIGINI kafolatlaydi, lekin qiymat
 * mantiqiyligini emas: model 150% yoki manfiy oraliq qaytarishi mumkin.
 */
function sanitize(
  raw: Partial<PhotoVisionAnalysis>,
  meta: { imagesAnalyzed: number; tokensUsed?: number; durationMs: number },
): PhotoVisionAnalysis {
  const point = clampPercent(raw.estimatedProgressPercent);
  const a = clampPercent(raw.rangeMin ?? point);
  const b = clampPercent(raw.rangeMax ?? point);

  return {
    stage: text(raw.stage, 120) || 'Aniqlanmadi',
    estimatedProgressPercent: point,
    rangeMin: Math.min(a, b),
    rangeMax: Math.max(a, b),
    confidence: clamp01(raw.confidence),
    completedWorks: list(raw.completedWorks),
    remainingWorks: list(raw.remainingWorks),
    matchesReported: false, // taqqoslash KODDA bajariladi, modelda emas
    discrepancyNote: '',
    imageQuality:
      raw.imageQuality === 'good' || raw.imageQuality === 'partial'
        ? raw.imageQuality
        : 'poor',
    summary: text(raw.summary, 600),
    imagesAnalyzed: meta.imagesAnalyzed,
    tokensUsed: meta.tokensUsed,
    durationMs: meta.durationMs,
  };
}

/** Xatoni «qayta urinsa bo‘ladimi» bo‘yicha ajratadi. */
function classify(error: unknown): { reason: string; retryable: boolean } {
  if (error instanceof OpenAI.APIError) {
    /*
     * ⚠️ SDK bu maydonlarni `any` sifatida beradi. Ularni to‘g‘ridan-to‘g‘ri
     * ishlatish — xato turini TAXMIN QILISH: `status` kutilmaganda satr
     * bo‘lsa, `status >= 500` jimgina `false` bo‘lib, server xatosi
     * «qayta urinib bo‘lmaydigan» deb belgilanardi.
     */
    const rawStatus: unknown = error.status;
    const rawCode: unknown = error.code;
    const status = typeof rawStatus === 'number' ? rawStatus : 0;
    const code = typeof rawCode === 'string' ? rawCode : '';

    if (status === 401 || status === 403) {
      return {
        reason: 'OpenAI kaliti yaroqsiz yoki ruxsat yo‘q',
        retryable: false,
      };
    }
    if (code === 'insufficient_quota' || code === 'credit_balance_exhausted') {
      // ⚠️ Qayta urinilmaydi: kredit tugagan, 10 daqiqadan keyin ham
      // o‘zgarmaydi. Admin to‘lovni to‘ldirgach, qo‘lda qayta ishga tushiriladi.
      return { reason: 'OpenAI hisobida kredit qolmagan', retryable: false };
    }
    if (status === 429) {
      return {
        reason: 'OpenAI so‘rov chegarasi (429) — keyinroq urinamiz',
        retryable: true,
      };
    }
    if (status >= 500) {
      return { reason: `OpenAI serveri xatosi (${status})`, retryable: true };
    }
    return {
      reason: `OpenAI xatosi: ${error.message}`.slice(0, 300),
      retryable: false,
    };
  }

  if (error instanceof SyntaxError) {
    return {
      reason: 'Model javobini o‘qib bo‘lmadi (JSON buzuq)',
      retryable: true,
    };
  }

  return {
    reason:
      `Tahlil bajarilmadi: ${error instanceof Error ? error.message : String(error)}`.slice(
        0,
        300,
      ),
    retryable: true,
  };
}

const clampPercent = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value * 10) / 10))
    : 0;

const clamp01 = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, Math.round(value * 1000) / 1000))
    : 0;

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const list = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 12)
    : [];
