import { AiAnalysisType, RiskLevel } from '../../common/constants/enums';
import {
  addDays,
  diffInDays,
  formatDateUz,
  toDateKey,
} from '../../helpers/date.helpers';

/**
 * AI TAHLIL DVIGATELI.
 *
 * ⚠️ Bu — SHAFFOF QOIDALAR to‘plami (`rule-engine-v1`), yashirin model emas.
 * Nazorat tizimida hokim ko‘rayotgan har bir raqamning qaerdan kelgani
 * tushuntirilishi kerak: «model shunday dedi» degan javob bu yerda
 * ishlamaydi. Shu sababli har bir xulosa `details` ichida o‘z kirish
 * ma’lumotlarini olib yuradi.
 *
 * Keyinchalik haqiqiy ML model ulansa, chaqiruv joyi o‘zgarmaydi —
 * faqat `model` nomi va shu fayl ichidagi hisob almashadi.
 */

export interface AnalysisInput {
  objectName: string;
  progressPercent: number;
  expectedProgress: number;
  plannedStartDate: string;
  plannedEndDate: string;
  delayDays: number;
  openDelayCount: number;
  totalCost: number;
  fundedAmount: number;
  paidAmount: number;
  /** Oxirgi 90 kundagi bajarilish yozuvlari (sana bo‘yicha o‘sish tartibida). */
  recentProgress: Array<{ date: string; percent: number }>;
  lastReportAt: Date | null;
}

export interface AnalysisOutput {
  type: AiAnalysisType;
  score: number;
  riskLevel: RiskLevel;
  summary: string;
  recommendations: string[];
  details: Record<string, unknown>;
}

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

const levelFor = (score: number): RiskLevel =>
  score >= 75
    ? RiskLevel.CRITICAL
    : score >= 50
      ? RiskLevel.HIGH
      : score >= 25
        ? RiskLevel.MEDIUM
        : RiskLevel.LOW;

/**
 * SUR'AT: oxirgi yozuvlardan kuniga necha foiz.
 * ⚠️ Kamida 2 ta yozuv kerak; bittasi bo‘lsa sur'at hisoblab bo‘lmaydi va
 * prognoz o‘rniga «ma’lumot yetarli emas» deyiladi — soxta aniqlik
 * ko‘rsatgandan ko‘ra bilmaslikni tan olgan yaxshi.
 */
export function velocityPerDay(
  recent: AnalysisInput['recentProgress'],
): number | null {
  if (recent.length < 2) return null;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const days = diffInDays(first.date, last.date);
  if (days === null || days <= 0) return null;
  const delta = last.percent - first.percent;
  if (delta <= 0) return 0;
  return Number((delta / days).toFixed(4));
}

/** 1) KECHIKISH PROGNOZI. */
export function forecastDelay(
  input: AnalysisInput,
  today: Date,
): AnalysisOutput {
  const remaining = Math.max(0, 100 - input.progressPercent);
  const velocity = velocityPerDay(input.recentProgress);
  const plannedDaysLeft =
    diffInDays(toDateKey(today), input.plannedEndDate) ?? 0;

  if (remaining === 0) {
    return {
      type: AiAnalysisType.DELAY_FORECAST,
      score: 0,
      riskLevel: RiskLevel.LOW,
      summary: 'Obyekt bajarilishi 100% — prognoz talab etilmaydi.',
      recommendations: ['Topshirish dalolatnomasini rasmiylashtiring.'],
      details: { remaining, velocity, plannedDaysLeft },
    };
  }

  if (velocity === null) {
    return {
      type: AiAnalysisType.DELAY_FORECAST,
      score: 40,
      riskLevel: RiskLevel.MEDIUM,
      summary:
        'Prognoz uchun ma’lumot yetarli emas: oxirgi 90 kunda kamida ikkita bajarilish yozuvi bo‘lishi kerak.',
      recommendations: [
        'Mas’uldan muntazam foto-hisobot talab qiling.',
        'Bajarilish foizini kamida ikki haftada bir yangilang.',
      ],
      details: {
        remaining,
        velocity: null,
        plannedDaysLeft,
        reason: 'insufficient_data',
      },
    };
  }

  if (velocity === 0) {
    return {
      type: AiAnalysisType.DELAY_FORECAST,
      score: 90,
      riskLevel: RiskLevel.CRITICAL,
      summary: `Oxirgi hisobotlarda bajarilish umuman o‘smagan. Joriy sur'atda obyekt hech qachon tugamaydi.`,
      recommendations: [
        'Ishning to‘xtash sababini aniqlang va kechikish yozuvi oching.',
        'Pudratchi bilan yig‘ilish o‘tkazing.',
      ],
      details: { remaining, velocity, plannedDaysLeft, stalled: true },
    };
  }

  const daysNeeded = Math.ceil(remaining / velocity);
  const forecastDate = addDays(today, daysNeeded);
  const overrunDays = Math.max(
    0,
    diffInDays(input.plannedEndDate, toDateKey(forecastDate)) ?? 0,
  );

  // Ball: har 30 kun kechikish uchun ~22 ball.
  const score = clamp(
    Math.round((overrunDays / 30) * 22 + input.openDelayCount * 5),
    0,
    100,
  );

  const recommendations: string[] = [];
  if (overrunDays > 0) {
    const needed = plannedDaysLeft > 0 ? remaining / plannedDaysLeft : Infinity;
    recommendations.push(
      Number.isFinite(needed)
        ? `Muddatga ulgurish uchun sur'at kuniga ${needed.toFixed(2)}% bo‘lishi kerak (hozir ${velocity.toFixed(2)}%).`
        : 'Reja muddati allaqachon o‘tgan — yangi muddat tasdiqlanishi kerak.',
    );
    recommendations.push(
      'Ishchi kuchi va texnikani ko‘paytirish masalasini ko‘rib chiqing.',
    );
  } else {
    recommendations.push(
      "Joriy sur'at muddatga ulgurish uchun yetarli — nazoratni saqlang.",
    );
  }

  return {
    type: AiAnalysisType.DELAY_FORECAST,
    score,
    riskLevel: levelFor(score),
    summary:
      overrunDays > 0
        ? `Joriy sur'atda obyekt ${formatDateUz(forecastDate, { utc: true })} da tugaydi — rejadan ${overrunDays} kun kech.`
        : `Joriy sur'atda obyekt ${formatDateUz(forecastDate, { utc: true })} da, ya'ni muddatidan oldin tugaydi.`,
    recommendations,
    details: {
      remaining,
      velocityPerDay: velocity,
      daysNeeded,
      forecastDate: toDateKey(forecastDate),
      plannedEndDate: input.plannedEndDate,
      overrunDays,
    },
  };
}

/** 2) UMUMIY RISK BAHOSI. */
export function scoreRisk(input: AnalysisInput): AnalysisOutput {
  const gap = Math.max(0, input.expectedProgress - input.progressPercent);
  const staleDays = input.lastReportAt
    ? Math.round((Date.now() - input.lastReportAt.getTime()) / 86_400_000)
    : 999;

  const factors = {
    delay: clamp(input.delayDays * 0.8, 0, 30),
    gap: clamp(gap * 1.2, 0, 25),
    openIssues: clamp(input.openDelayCount * 7, 0, 20),
    reporting: clamp((staleDays / 30) * 15, 0, 15),
    funding:
      input.totalCost > 0
        ? clamp((1 - input.fundedAmount / input.totalCost) * 10, 0, 10)
        : 0,
  };

  const score = clamp(
    Math.round(Object.values(factors).reduce((a, b) => a + b, 0)),
    0,
    100,
  );

  const recommendations: string[] = [];
  if (factors.delay > 10)
    recommendations.push(
      'Kechikish sabablarini qayta ko‘rib chiqing va bartaraf etish rejasini yangilang.',
    );
  if (factors.gap > 10)
    recommendations.push(
      'Bajarilish rejadan sezilarli ortda — ish grafigini qayta ko‘rib chiqish zarur.',
    );
  if (factors.reporting > 7)
    recommendations.push(
      `Oxirgi hisobotdan ${staleDays} kun o‘tdi — mas’uldan hisobot talab qiling.`,
    );
  if (factors.funding > 5)
    recommendations.push(
      'Moliyalashtirish to‘liq ajratilmagan — byudjet masalasini ko‘taring.',
    );
  if (recommendations.length === 0)
    recommendations.push(
      'Jiddiy risk aniqlanmadi — joriy nazorat rejimini saqlang.',
    );

  return {
    type: AiAnalysisType.RISK_SCORE,
    score,
    riskLevel: levelFor(score),
    summary: `Umumiy risk bahosi: ${score}/100 (${
      { low: 'past', medium: 'o‘rta', high: 'yuqori', critical: 'kritik' }[
        levelFor(score)
      ]
    }).`,
    recommendations,
    details: { factors, gap, staleDays },
  };
}

/**
 * 3) BYUDJET OG‘ISHI.
 * To‘langan ulush bajarilgan ulushdan sezilarli oldinda bo‘lsa — pul ishdan
 * oldinda ketyapti: bu avans yoki haddan tashqari to‘lov belgisi.
 */
export function budgetDeviation(input: AnalysisInput): AnalysisOutput {
  if (input.totalCost <= 0) {
    return {
      type: AiAnalysisType.BUDGET_DEVIATION,
      score: 0,
      riskLevel: RiskLevel.LOW,
      summary: 'Loyiha qiymati kiritilmagan — byudjet tahlili imkonsiz.',
      recommendations: ['Obyekt kartasida loyiha qiymatini to‘ldiring.'],
      details: { reason: 'no_total_cost' },
    };
  }

  const paidPercent = Number(
    ((input.paidAmount / input.totalCost) * 100).toFixed(1),
  );
  const fundedPercent = Number(
    ((input.fundedAmount / input.totalCost) * 100).toFixed(1),
  );
  const deviation = Number((paidPercent - input.progressPercent).toFixed(1));

  const score = clamp(Math.round(Math.abs(deviation) * 1.5), 0, 100);

  const recommendations: string[] = [];
  let summary: string;

  if (deviation > 15) {
    summary = `To‘lov bajarilishdan ${deviation}% oldinda: ${paidPercent}% to‘langan, ${input.progressPercent}% bajarilgan.`;
    recommendations.push(
      'Bajarilgan ishlar dalolatnomasini to‘lov hajmi bilan solishtiring.',
    );
    recommendations.push(
      'Keyingi to‘lovni haqiqiy bajarilishgacha to‘xtatib turish masalasini ko‘ring.',
    );
  } else if (deviation < -20) {
    summary = `Bajarilish to‘lovdan ${Math.abs(deviation)}% oldinda: pudratchi o‘z mablag‘i hisobidan ishlayapti.`;
    recommendations.push(
      'To‘lovni tezlashtiring — aks holda ish to‘xtash xavfi bor.',
    );
  } else {
    summary = `To‘lov va bajarilish muvozanatda (og‘ish ${deviation}%).`;
    recommendations.push('Joriy to‘lov grafigini saqlang.');
  }

  if (fundedPercent < 50) {
    recommendations.push(
      `Loyiha qiymatining atigi ${fundedPercent}% i ajratilgan — qolgan mablag‘ni rejalashtiring.`,
    );
  }

  return {
    type: AiAnalysisType.BUDGET_DEVIATION,
    score,
    riskLevel: levelFor(score),
    summary,
    recommendations,
    details: {
      paidPercent,
      fundedPercent,
      progressPercent: input.progressPercent,
      deviation,
    },
  };
}

export function analyzeAll(
  input: AnalysisInput,
  today: Date,
): AnalysisOutput[] {
  return [
    forecastDelay(input, today),
    scoreRisk(input),
    budgetDeviation(input),
  ];
}
