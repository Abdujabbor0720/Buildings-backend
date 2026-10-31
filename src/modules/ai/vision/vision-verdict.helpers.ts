import type { PhotoVisionAnalysis } from '../../../common/contracts/photo-vision.contract';
import { AiVerdict } from '../../../common/constants/enums';

/**
 * IKKI DVIGATEL NATIJASINI BIRLASHTIRISH.
 *
 * Tizimda foto-hisobotni ikki mustaqil tekshiruv baholaydi:
 *
 *   1. QOIDALAR (`photo-verification.helpers`) — METAMA’LUMOT:
 *      surat qachon olingan, qayerda olingan, foiz qanchaga sakragan.
 *      U suratning ICHIGA qaramaydi.
 *
 *   2. MODEL (`photo-vision.service`) — SURATNING O‘ZI:
 *      qurilishning necha foizi haqiqatan ko‘rinib turibdi.
 *
 * ⚠️ Ular BIR-BIRINI ALMASHTIRMAYDI. Eski surat haqiqiy 60% ni ko‘rsatishi
 * mumkin; toza, yangi surat esa 20% ishni 80% deb yozilgan hisobot bilan
 * kelishi mumkin. Shuning uchun yakuniy qaror ikkalasidan quriladi.
 *
 * ⚠️ MODEL YAKUNIY QAROR QABUL QILMAYDI. U faqat ishonchni pasaytiradi va
 * «odam ko‘rsin» deb belgilaydi. Hisobotni tasdiqlash yoki rad etish —
 * `photos.moderate` ruxsatiga ega ODAMNING ishi.
 */

export const VISION_RULES = {
  /** Shu foizgacha farq — o‘lchov xatosi, e’tiborga olinmaydi. */
  TOLERANCE_PERCENT: 5,
  /** Shundan katta farq — jiddiy nomuvofiqlik. */
  MAJOR_GAP_PERCENT: 15,
  /** Ishonchi shundan past baho qarorga TA’SIR QILMAYDI. */
  MIN_USABLE_CONFIDENCE: 0.35,
  /** Nomuvofiqlik uchun maksimal jarima. */
  MAX_PENALTY: 0.45,
  /** Yakuniy ishonch shundan past bo‘lsa — rad etishga tavsiya. */
  REJECT_THRESHOLD: 0.35,
  /** Yakuniy ishonch shundan yuqori bo‘lsa — tasdiqlashga tavsiya. */
  CONFIRM_THRESHOLD: 0.75,
} as const;

/** Surat sifati bahoning og‘irligini belgilaydi. */
const QUALITY_WEIGHT: Record<PhotoVisionAnalysis['imageQuality'], number> = {
  good: 1,
  partial: 0.6,
  poor: 0.25,
};

export interface CombineInput {
  /** Hisobotda qayd etilgan bajarilish, %. */
  reportedProgress: number;
  /** Qoidalar dvigatelidan: metama’lumotga ishonch, 0–1. */
  ruleConfidence: number;
  ruleVerdict: AiVerdict;
  ruleComment: string;
  /** Model tahlili. `null` — tahlil bo‘lmagan (kalit yo‘q, format mos emas). */
  vision: PhotoVisionAnalysis | null;
}

export interface CombinedVerdict {
  verdict: AiVerdict;
  confidence: number;
  comment: string;
  /** Hisobotdagi foiz bilan model bahosi orasidagi farq (musbat = oshirib yozilgan). */
  deviation: number | null;
  /** Hisobotdagi foiz model oralig‘iga tushadimi. */
  withinRange: boolean | null;
}

export function combineVerdict(input: CombineInput): CombinedVerdict {
  const { vision } = input;

  // Model tahlili yo‘q — qoidalar dvigateli yakuniy so‘zni aytadi.
  if (!vision) {
    return {
      verdict: input.ruleVerdict,
      confidence: round3(input.ruleConfidence),
      comment: input.ruleComment,
      deviation: null,
      withinRange: null,
    };
  }

  const [low, high] = normalizeRange(vision);
  const reported = input.reportedProgress;
  const withinRange = reported >= low && reported <= high;

  // Farq ORALIQNING ENG YAQIN CHEGARASIDAN o‘lchanadi, o‘rtacha qiymatdan
  // emas: model «52–64%» desa, 64% hisobot to‘liq to‘g‘ri — uni o‘rtacha
  // 58% dan 6% chetlashgan deb jazolash noto‘g‘ri bo‘lardi.
  const deviation = withinRange
    ? 0
    : reported > high
      ? reported - high
      : reported - low;
  const absDeviation = Math.abs(deviation);

  /*
   * Jarima uchta narsaga bog‘liq:
   *   • farq kattaligi,
   *   • modelning o‘z ishonchi,
   *   • surat sifati.
   * Loyqa suratga tayanib hisobotni rad etish — eng yomoni: mas’ul odam
   * haqiqiy ishni qilgan bo‘lsa ham ayblanib qolardi.
   */
  const weight =
    vision.confidence * QUALITY_WEIGHT[vision.imageQuality] >=
    VISION_RULES.MIN_USABLE_CONFIDENCE
      ? vision.confidence * QUALITY_WEIGHT[vision.imageQuality]
      : 0;

  let penalty = 0;
  if (absDeviation > VISION_RULES.TOLERANCE_PERCENT) {
    const over = absDeviation - VISION_RULES.TOLERANCE_PERCENT;
    const span =
      VISION_RULES.MAJOR_GAP_PERCENT - VISION_RULES.TOLERANCE_PERCENT;
    const severity = Math.min(1, over / span);
    penalty = VISION_RULES.MAX_PENALTY * severity * weight;
  }

  // ⚠️ Faqat OSHIRIB yozish jazolanadi. Kam ko‘rsatish (reported < model)
  // firibgarlik emas — ehtiyotkorlik; u ishonchni pasaytirmasligi kerak.
  if (deviation < 0) penalty *= 0.4;

  const confidence = round3(
    Math.max(0, Math.min(1, input.ruleConfidence - penalty)),
  );

  const verdict =
    confidence >= VISION_RULES.CONFIRM_THRESHOLD
      ? AiVerdict.CONFIRMED
      : confidence <= VISION_RULES.REJECT_THRESHOLD
        ? AiVerdict.REJECTED
        : AiVerdict.SUSPICIOUS;

  return {
    verdict,
    confidence,
    comment: buildComment(input, vision, {
      low,
      high,
      deviation,
      withinRange,
      weight,
    }),
    deviation: round1(deviation),
    withinRange,
  };
}

function buildComment(
  input: CombineInput,
  vision: PhotoVisionAnalysis,
  ctx: {
    low: number;
    high: number;
    deviation: number;
    withinRange: boolean;
    weight: number;
  },
): string {
  const parts: string[] = [];

  if (ctx.weight === 0) {
    parts.push(
      `Surat sifati baholash uchun yetarli emas (${qualityUz(vision.imageQuality)}) — ` +
        'model bahosi qarorga ta’sir qilmadi',
    );
  } else if (ctx.withinRange) {
    parts.push(
      `Suratdan baholangan bajarilish ${ctx.low}–${ctx.high}% — ` +
        `hisobotdagi ${input.reportedProgress}% shu oraliqqa to‘g‘ri keladi`,
    );
  } else if (ctx.deviation > 0) {
    parts.push(
      `Hisobotda ${input.reportedProgress}% ko‘rsatilgan, suratdan esa ` +
        `${ctx.low}–${ctx.high}% ko‘rinadi — ${round1(ctx.deviation)}% ga oshirib yozilgan`,
    );
  } else {
    parts.push(
      `Hisobotda ${input.reportedProgress}% ko‘rsatilgan, suratdan esa ` +
        `${ctx.low}–${ctx.high}% ko‘rinadi — kam ko‘rsatilgan`,
    );
  }

  if (vision.summary) parts.push(vision.summary);

  // Qoidalar dvigateli e’tirozi bo‘lsa — u ham qoladi: ikkalasi boshqa
  // narsani tekshiradi va biri ikkinchisini bekor qilmaydi.
  if (input.ruleComment && !input.ruleComment.startsWith('Surat vaqti')) {
    parts.push(input.ruleComment);
  }

  return parts.join('. ').replace(/\.\./g, '.');
}

/** Model oraliqni teskari yoki chegaradan tashqari berishi mumkin. */
function normalizeRange(vision: PhotoVisionAnalysis): [number, number] {
  const a = clampPercent(vision.rangeMin);
  const b = clampPercent(vision.rangeMax);
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  // Oraliq umuman berilmagan bo‘lsa — nuqtaviy bahodan ±5% yasaymiz.
  if (high - low < 0.01) {
    const point = clampPercent(vision.estimatedProgressPercent);
    return [clampPercent(point - 5), clampPercent(point + 5)];
  }
  return [low, high];
}

function qualityUz(quality: PhotoVisionAnalysis['imageQuality']): string {
  if (quality === 'good') return 'yaxshi';
  if (quality === 'partial') return 'qisman';
  return 'sifatsiz';
}

const clampPercent = (value: number): number =>
  Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
const round1 = (value: number): number => Math.round(value * 10) / 10;
const round3 = (value: number): number => Math.round(value * 1000) / 1000;
