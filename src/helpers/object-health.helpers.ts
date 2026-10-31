import {
  ObjectHealth,
  ObjectStatus,
  RiskLevel,
} from '../common/constants/enums';
import { diffInDays, tashkentToday } from './date.helpers';

/**
 * OBYEKT SOG‘LOMLIGI — formula BITTA joyda.
 *
 * Buni kecha-kunduz hisoblaydigan cron ham, obyekt yaratish/yangilash servisi
 * ham, seed ham AYNAN shu funksiyani chaqiradi. Ikkita nusxa bo‘lsa dashboard
 * bir raqamni, obyekt kartasi boshqa raqamni ko‘rsatardi — monitoring tizimida
 * esa bu butun mahsulotning mohiyatini yo‘qqa chiqaradi.
 *
 * ⚠️ `ObjectStatus` (qaror: boshlandi / to‘xtatildi / topshirildi) va
 * `ObjectHealth` (o‘lchov: muddatga ulgurayaptimi) — BOSHQA-BOSHQA narsa.
 *
 * Dashboard KPI kartalari bilan bog‘lanishi:
 *   «Reja asosida»   = ON_SCHEDULE + NOT_STARTED
 *   «Kechikayotgan»  = DELAYED
 *   «Xavfli holatda» = AT_RISK
 * Shu sababli to‘rt holat O‘ZARO INKAR: jami = 4 tasining yig‘indisi.
 */

/** Chegaralar bitta joyda — biznes qaror o‘zgarsa shu yerda o‘zgaradi. */
export const HEALTH_THRESHOLDS = {
  /** Shunchadan ko‘p kun ortda qolgan obyekt «xavfli» deb belgilanadi. */
  AT_RISK_DELAY_DAYS: 30,
  /** Muddati o‘tgan va bajarilishi shundan past bo‘lsa — «xavfli». */
  AT_RISK_PROGRESS_PERCENT: 50,
  /**
   * Shundan kam ortda qolish — SHOVQIN, kechikish emas.
   * ⚠️ Busiz har bir obyekt bir-ikki kunlik tabiiy og‘ish uchun
   * «kechikayotgan» bo‘lib, registr ma’nosini yo‘qotardi.
   */
  DELAYED_MIN_DAYS: 7,
  /** Ochiq muammolar soni shundan oshsa — holat bir pog‘ona og‘irlashadi. */
  OPEN_DELAY_ESCALATION: 3,
} as const;

export interface HealthInput {
  status: ObjectStatus;
  progressPercent: number;
  plannedStartDate: Date | string | null;
  plannedEndDate: Date | string | null;
  actualStartDate?: Date | string | null;
  actualEndDate?: Date | string | null;
  /** Ochiq (hal qilinmagan) kechikish yozuvlari soni — risk bahosini oshiradi. */
  openDelayCount?: number;
}

export interface HealthResult {
  health: ObjectHealth;
  /**
   * ORTDA QOLISH, KUNLARDA.
   *
   * ⚠️ Bu «muddatdan necha kun o‘tdi» degani EMAS. U ikkitasining KATTASI:
   *   • `overdueDays`      — reja muddati o‘tgan bo‘lsa, o‘tgan kunlar;
   *   • `scheduleSlipDays` — reja egri chizig‘idan necha kun ortda qolingani.
   *
   * Sabab: muddati hali kelmagan, lekin bajarilishi rejadan ancha ortda
   * qolgan obyekt ham KECHIKAYOTGAN hisoblanishi kerak. Faqat «muddat o‘tdimi»
   * deb qaralsa, tizim muammoni muddat o‘tgandan KEYIN ko‘rsatardi — holbuki
   * monitoringning butun mohiyati uni OLDIN ko‘rsatishda.
   */
  delayDays: number;
  /** Reja muddati o‘tgan kunlar (muddat kelmagan bo‘lsa 0). */
  overdueDays: number;
  /** Reja egri chizig‘idan ortda qolish, kunlarda. */
  scheduleSlipDays: number;
  /** Bugungi kunda reja bo‘yicha bo‘lishi kerak bo‘lgan bajarilish, %. */
  expectedProgress: number;
  /** `expectedProgress − progressPercent`. Musbat = ortda qolgan. */
  progressGap: number;
  riskLevel: RiskLevel;
  /** 0–100. Reytinglar va «TOP xavfli» ro‘yxati uchun. */
  riskScore: number;
}

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

/**
 * Reja bo‘yicha bugungi kunda qancha bajarilgan bo‘lishi kerak edi.
 * Chiziqli model — ataylab: bosqichlar (`milestones`) bo‘lmagan obyektda ham
 * ishlaydi va «nega shuncha» degan savolga javob bitta jumlada bo‘ladi.
 */
export function expectedProgressFor(
  plannedStartDate: Date | string | null,
  plannedEndDate: Date | string | null,
  today: Date,
): number {
  const total = diffInDays(plannedStartDate, plannedEndDate);
  if (total === null || total <= 0)
    return plannedEndDate && today >= new Date(plannedEndDate) ? 100 : 0;
  const elapsed = diffInDays(plannedStartDate, today);
  if (elapsed === null) return 0;
  return Number(clamp((elapsed / total) * 100, 0, 100).toFixed(2));
}

export function evaluateObjectHealth(
  input: HealthInput,
  now: Date = new Date(),
): HealthResult {
  const today = tashkentToday(now);
  const progress = clamp(Number(input.progressPercent) || 0, 0, 100);
  const expectedProgress = expectedProgressFor(
    input.plannedStartDate,
    input.plannedEndDate,
    today,
  );
  const progressGap = Number((expectedProgress - progress).toFixed(2));
  const openDelays = input.openDelayCount ?? 0;

  const plannedDurationDays = Math.max(
    1,
    diffInDays(input.plannedStartDate, input.plannedEndDate) ?? 1,
  );
  const overdueDays = Math.max(0, diffInDays(input.plannedEndDate, today) ?? 0);

  /**
   * Reja egri chizig‘idan necha KUN ortda qolingani.
   * Rejada har bir kun ≈ `100 / davomiylik` foizga to‘g‘ri keladi, demak
   * G foiz ortda qolish ≈ `G × davomiylik / 100` kunga teng.
   */
  const scheduleSlipDays =
    progressGap > 0 ? Math.round((progressGap * plannedDurationDays) / 100) : 0;

  const baseResult = {
    expectedProgress,
    progressGap,
    overdueDays,
    scheduleSlipDays,
  };

  // 1) Topshirilgan — kechikish fakti SAQLANADI («muddatida topshirildimi»
  //    degan savolga hisobotda javob kerak), lekin holat COMPLETED.
  if (input.status === ObjectStatus.COMPLETED) {
    const over =
      diffInDays(input.plannedEndDate, input.actualEndDate ?? today) ?? 0;
    return {
      ...baseResult,
      health: ObjectHealth.COMPLETED,
      delayDays: Math.max(0, over),
      overdueDays: Math.max(0, over),
      scheduleSlipDays: 0,
      expectedProgress: 100,
      progressGap: 0,
      riskLevel: RiskLevel.LOW,
      riskScore: 0,
    };
  }

  // 2) To‘xtatilgan / bekor qilingan — avtomatik xavfli: pul sarflangan,
  //    ish yurmayapti. «Reja asosida» ro‘yxatida turishi mumkin emas.
  if (
    input.status === ObjectStatus.SUSPENDED ||
    input.status === ObjectStatus.CANCELLED
  ) {
    return {
      ...baseResult,
      health: ObjectHealth.AT_RISK,
      delayDays: Math.max(overdueDays, scheduleSlipDays),
      riskLevel: RiskLevel.CRITICAL,
      riskScore: 95,
    };
  }

  // 3) Hali boshlanmagan.
  if (!input.actualStartDate && progress === 0) {
    const startOverdue = Math.max(
      0,
      diffInDays(input.plannedStartDate, today) ?? 0,
    );

    if (startOverdue === 0) {
      // Reja muddati hali kelmagan — bu kechikish EMAS.
      return {
        ...baseResult,
        health: ObjectHealth.NOT_STARTED,
        delayDays: 0,
        scheduleSlipDays: 0,
        progressGap: 0,
        expectedProgress: 0,
        riskLevel: RiskLevel.LOW,
        riskScore: 5,
      };
    }

    const health =
      startOverdue >= HEALTH_THRESHOLDS.AT_RISK_DELAY_DAYS
        ? ObjectHealth.AT_RISK
        : ObjectHealth.DELAYED;

    return {
      ...baseResult,
      health,
      delayDays: startOverdue,
      riskLevel:
        health === ObjectHealth.AT_RISK ? RiskLevel.HIGH : RiskLevel.MEDIUM,
      riskScore: clamp(40 + startOverdue, 0, 100),
    };
  }

  // 4) Qurilish ketmoqda.
  const delayDays = Math.max(overdueDays, scheduleSlipDays);

  let health: ObjectHealth;
  if (
    delayDays >= HEALTH_THRESHOLDS.AT_RISK_DELAY_DAYS ||
    (overdueDays > 0 &&
      progress < HEALTH_THRESHOLDS.AT_RISK_PROGRESS_PERCENT) ||
    openDelays >= HEALTH_THRESHOLDS.OPEN_DELAY_ESCALATION
  ) {
    health = ObjectHealth.AT_RISK;
  } else if (delayDays >= HEALTH_THRESHOLDS.DELAYED_MIN_DAYS) {
    health = ObjectHealth.DELAYED;
  } else {
    health = ObjectHealth.ON_SCHEDULE;
  }

  const riskScore = clamp(
    Math.round(
      delayDays * 1.1 +
        Math.max(0, progressGap) * 1.2 +
        openDelays * 6 +
        (100 - progress) * 0.12,
    ),
    0,
    100,
  );

  const riskLevel =
    health === ObjectHealth.AT_RISK && riskScore < 50
      ? // Holat «xavfli» bo‘lsa, risk darajasi ham kamida «yuqori» bo‘lishi
        // kerak: ikki ustun bir-biriga zid raqam ko‘rsatmasligi shart.
        RiskLevel.HIGH
      : riskScore >= 75
        ? RiskLevel.CRITICAL
        : riskScore >= 50
          ? RiskLevel.HIGH
          : riskScore >= 25
            ? RiskLevel.MEDIUM
            : RiskLevel.LOW;

  return { ...baseResult, health, delayDays, riskLevel, riskScore };
}

/** Holat → o‘zbekcha yorliq. UI ham, Excel eksporti ham shu yerdan oladi. */
export const HEALTH_LABELS_UZ: Record<ObjectHealth, string> = {
  [ObjectHealth.NOT_STARTED]: 'Boshlanmagan',
  [ObjectHealth.ON_SCHEDULE]: 'Reja asosida',
  [ObjectHealth.DELAYED]: 'Kechikayotgan',
  [ObjectHealth.AT_RISK]: 'Xavfli holatda',
  [ObjectHealth.COMPLETED]: 'Topshirilgan',
};

export const STATUS_LABELS_UZ: Record<ObjectStatus, string> = {
  [ObjectStatus.NOT_STARTED]: 'Boshlanmagan',
  [ObjectStatus.IN_PROGRESS]: 'Jarayonda',
  [ObjectStatus.COMPLETED]: 'Topshirilgan',
  [ObjectStatus.SUSPENDED]: 'To‘xtatilgan',
  [ObjectStatus.CANCELLED]: 'Bekor qilingan',
};

export const RISK_LABELS_UZ: Record<RiskLevel, string> = {
  [RiskLevel.LOW]: 'Past',
  [RiskLevel.MEDIUM]: 'O‘rta',
  [RiskLevel.HIGH]: 'Yuqori',
  [RiskLevel.CRITICAL]: 'Kritik',
};
