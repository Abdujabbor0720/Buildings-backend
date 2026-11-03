import { MilestoneStatus } from '../common/constants/enums';

/** `planProgress` ga kerak bo‘lgan yagona uchta maydon. */
export interface PlanRow {
  weight: number | string;
  progressPercent: number | string;
  status: MilestoneStatus;
}

/**
 * ISH REJASIDAN HISOBLANGAN BAJARILISH.
 *
 * `Σ(ulush × bosqich foizi) / Σ(ulush)`.
 *
 * ⚠️ BEKOR QILINGAN bosqich maxrajdan ham CHIQARILADI, nolga
 * tenglashtirilmaydi: 20% ulushli bosqich bekor qilinsa, obyekt
 * bajarilishi o‘z-o‘zidan 20 foiz bandga tushib ketardi — holbuki
 * maydonda hech narsa o‘zgarmagan.
 *
 * ⚠️ Reja YO‘Q bo‘lsa `null` qaytadi, NOL emas. Nol «hech narsa
 * qilinmagan» degan ma’noni berardi va qo‘lda kiritilgan foizni
 * jimgina o‘chirib tashlardi.
 *
 * ⚠️ Bu funksiya SERVISDA emas, shu yerda yashaydi: u sof hisob va
 * uni NestJS konteynerisiz, to‘g‘ridan-to‘g‘ri test qilish mumkin
 * bo‘lishi kerak. Servis ichida bo‘lganda test butun modulni
 * yuklashga majbur bo‘lardi.
 */
export function planProgress(rows: PlanRow[]): number | null {
  const active = rows.filter((m) => m.status !== MilestoneStatus.CANCELLED);
  const totalWeight = active.reduce((sum, m) => sum + Number(m.weight), 0);
  if (totalWeight <= 0) return null;
  const weighted = active.reduce(
    (sum, m) => sum + Number(m.weight) * Number(m.progressPercent),
    0,
  );
  return Number((weighted / totalWeight).toFixed(2));
}
