import { AiVerdict } from '../../common/constants/enums';

/**
 * FOTO-HISOBOT AVTOMATIK TEKSHIRUVI.
 *
 * ⚠️ Bu — QOIDALARGA ASOSLANGAN tekshiruv (heuristika), neyron tarmoq EMAS.
 * Nomi ataylab `rule-engine-v1`: interfeysda «AI tasdiqladi» deb ko‘rinadi,
 * lekin kodda nima qilayotgani aniq yozilgan. Keyinchalik haqiqiy model
 * ulansa, `model` maydoni o‘zgaradi, chaqiruv joyi esa o‘zgarmaydi.
 *
 * Nimani tekshiradi:
 *   1. Surat QACHON olingan — eski suratni bugun yuklash eng ko‘p uchraydigan hiyla.
 *   2. QAYERDA olingan — obyekt koordinatasidan uzoqlik.
 *   3. Bajarilish MANTIQIYmi — oldingi hisobotdan keskin sakrash.
 *
 * Natija — `confidence` (0–1) va `verdict`. Yakuniy qarorni ODAM qabul
 * qiladi (`photos.moderate`): tizim faqat shubhani KO‘RSATADI.
 */

export interface VerificationInput {
  capturedAt: Date;
  uploadedAt: Date;
  photoLat: number | null;
  photoLng: number | null;
  objectLat: number | null;
  objectLng: number | null;
  reportedProgress: number;
  previousProgress: number;
  /** Oldingi hisobotdan beri o‘tgan kunlar (birinchi hisobotda `null`). */
  daysSincePrevious: number | null;
}

export interface VerificationResult {
  verdict: AiVerdict;
  confidence: number;
  comment: string;
  details: {
    captureDelayDays: number;
    distanceMeters: number | null;
    progressJump: number;
    flags: string[];
  };
}

export const VERIFICATION_RULES = {
  /** Suratni yuklash kechikishi shu kundan oshsa — shubhali. */
  MAX_CAPTURE_DELAY_DAYS: 3,
  /** Obyektdan shu masofadan uzoqda olingan surat — shubhali. */
  MAX_DISTANCE_METERS: 500,
  /** Bir kunda shu foizdan ko‘p o‘sish — shubhali. */
  MAX_DAILY_PROGRESS: 3,
  /** Shubhalar soni shundan oshsa — rad etishga tavsiya. */
  REJECT_THRESHOLD: 0.35,
  /** Ishonch shundan yuqori bo‘lsa — avtomatik tasdiq. */
  CONFIRM_THRESHOLD: 0.75,
} as const;

const EARTH_RADIUS_M = 6_371_000;

/** Ikki koordinata orasidagi masofa, metrda (Haversine). */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(
    EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
  );
}

export function verifyPhotoReport(
  input: VerificationInput,
): VerificationResult {
  const flags: string[] = [];
  let confidence = 1;

  /* 1. Surat qachon olingan */
  const captureDelayDays = Math.max(
    0,
    Math.round(
      (input.uploadedAt.getTime() - input.capturedAt.getTime()) / 86_400_000,
    ),
  );
  if (captureDelayDays > VERIFICATION_RULES.MAX_CAPTURE_DELAY_DAYS) {
    const penalty = Math.min(0.4, (captureDelayDays / 30) * 0.4);
    confidence -= penalty;
    flags.push(`Surat ${captureDelayDays} kun oldin olingan`);
  }
  if (input.capturedAt.getTime() > input.uploadedAt.getTime() + 3_600_000) {
    // Suratning sanasi kelajakda — qurilmada vaqt noto‘g‘ri yoki EXIF o‘zgartirilgan.
    confidence -= 0.5;
    flags.push('Surat sanasi kelajakda — qurilma vaqti noto‘g‘ri');
  }

  /* 2. Qayerda olingan */
  let distance: number | null = null;
  if (
    input.photoLat !== null &&
    input.photoLng !== null &&
    input.objectLat !== null &&
    input.objectLng !== null
  ) {
    distance = distanceMeters(
      input.photoLat,
      input.photoLng,
      input.objectLat,
      input.objectLng,
    );
    if (distance > VERIFICATION_RULES.MAX_DISTANCE_METERS) {
      const penalty = Math.min(0.45, (distance / 5000) * 0.45);
      confidence -= penalty;
      flags.push(`Obyektdan ${distance} m uzoqlikda olingan`);
    }
  } else {
    // Koordinata yo‘qligi — xato emas, lekin tekshiruvni zaiflashtiradi.
    confidence -= 0.1;
    flags.push('Joylashuv ma’lumoti yo‘q');
  }

  /* 3. Bajarilish mantiqiymi */
  const progressJump = Number(
    (input.reportedProgress - input.previousProgress).toFixed(2),
  );
  if (progressJump < 0) {
    confidence -= 0.2;
    flags.push(`Bajarilish ${Math.abs(progressJump)}% ga kamaygan`);
  } else if (input.daysSincePrevious !== null && input.daysSincePrevious > 0) {
    const perDay = progressJump / input.daysSincePrevious;
    if (perDay > VERIFICATION_RULES.MAX_DAILY_PROGRESS) {
      confidence -= 0.3;
      flags.push(`Kunlik o‘sish juda tez: ${perDay.toFixed(1)}%/kun`);
    }
  }

  confidence = Number(Math.min(1, Math.max(0, confidence)).toFixed(3));

  const verdict =
    confidence >= VERIFICATION_RULES.CONFIRM_THRESHOLD
      ? AiVerdict.CONFIRMED
      : confidence <= VERIFICATION_RULES.REJECT_THRESHOLD
        ? AiVerdict.REJECTED
        : AiVerdict.SUSPICIOUS;

  const comment =
    flags.length === 0
      ? 'Surat vaqti, joylashuvi va bajarilish dinamikasi mos — e’tiroz yo‘q.'
      : flags.join('; ');

  return {
    verdict,
    confidence,
    comment,
    details: {
      captureDelayDays,
      distanceMeters: distance,
      progressJump,
      flags,
    },
  };
}
