import { AiVerdict } from '../../../common/constants/enums';
import type { PhotoVisionAnalysis } from '../../../common/contracts/photo-vision.contract';
import { combineVerdict, VISION_RULES } from './vision-verdict.helpers';

/** Sinov uchun to‘liq tahlil — kerakli maydonlar ustiga yoziladi. */
function analysis(
  patch: Partial<PhotoVisionAnalysis> = {},
): PhotoVisionAnalysis {
  return {
    stage: 'Karkas qurilishi',
    estimatedProgressPercent: 40,
    rangeMin: 35,
    rangeMax: 45,
    confidence: 0.85,
    completedWorks: ['Poydevor quyilgan'],
    remainingWorks: ['Tom yopilmagan'],
    matchesReported: false,
    discrepancyNote: '',
    imageQuality: 'good',
    summary: 'Karkas ko‘tarilgan, tom yo‘q.',
    ...patch,
  };
}

const baseInput = {
  reportedProgress: 40,
  ruleConfidence: 0.95,
  ruleVerdict: AiVerdict.CONFIRMED,
  ruleComment:
    'Surat vaqti, joylashuvi va bajarilish dinamikasi mos — e’tiroz yo‘q.',
  vision: analysis(),
};

describe('combineVerdict', () => {
  it('tahlil bo‘lmasa qoidalar dvigateli natijasini o‘zgartirmaydi', () => {
    const result = combineVerdict({ ...baseInput, vision: null });

    expect(result.verdict).toBe(AiVerdict.CONFIRMED);
    expect(result.confidence).toBe(0.95);
    expect(result.comment).toBe(baseInput.ruleComment);
    expect(result.deviation).toBeNull();
    expect(result.withinRange).toBeNull();
  });

  it('hisobotdagi foiz model oralig‘iga tushsa — jarima yo‘q', () => {
    const result = combineVerdict({ ...baseInput, reportedProgress: 44 });

    expect(result.withinRange).toBe(true);
    expect(result.deviation).toBe(0);
    expect(result.confidence).toBe(0.95);
    expect(result.verdict).toBe(AiVerdict.CONFIRMED);
  });

  it('farq ORALIQ CHEGARASIDAN o‘lchanadi, o‘rtacha qiymatdan emas', () => {
    // Oraliq 35–45. Hisobotda 48% → chegaradan 3% chetda (o‘rtachadan 8%).
    const result = combineVerdict({ ...baseInput, reportedProgress: 48 });

    expect(result.deviation).toBe(3);
    // 3% < 5% bardosh — ishonch pasaymaydi.
    expect(result.confidence).toBe(0.95);
  });

  it('jiddiy oshirib yozish ishonchni pasaytiradi va shubhali qiladi', () => {
    const result = combineVerdict({ ...baseInput, reportedProgress: 85 });

    expect(result.deviation).toBe(40);
    expect(result.confidence).toBeLessThan(VISION_RULES.CONFIRM_THRESHOLD);
    expect(result.verdict).toBe(AiVerdict.SUSPICIOUS);
    expect(result.comment).toContain('oshirib yozilgan');
  });

  it('kam ko‘rsatish oshirib yozishdan ANCHA yumshoq jazolanadi', () => {
    const over = combineVerdict({ ...baseInput, reportedProgress: 80 });
    const under = combineVerdict({ ...baseInput, reportedProgress: 0 });

    // Ikkala holatda ham farq katta, lekin kam ko‘rsatish firibgarlik emas.
    expect(under.confidence).toBeGreaterThan(over.confidence);
    expect(under.comment).toContain('kam ko‘rsatilgan');
  });

  it('sifatsiz surat qarorga TA’SIR QILMAYDI', () => {
    const result = combineVerdict({
      ...baseInput,
      reportedProgress: 95,
      vision: analysis({ imageQuality: 'poor', confidence: 0.4 }),
    });

    // Farq 50% bo‘lsa ham, loyqa suratga tayanib hisobot ayblanmaydi.
    expect(result.confidence).toBe(0.95);
    expect(result.verdict).toBe(AiVerdict.CONFIRMED);
    expect(result.comment).toContain('yetarli emas');
  });

  it('modelning o‘z ishonchi past bo‘lsa jarima ham kichik bo‘ladi', () => {
    const sure = combineVerdict({ ...baseInput, reportedProgress: 85 });
    const unsure = combineVerdict({
      ...baseInput,
      reportedProgress: 85,
      vision: analysis({ confidence: 0.5 }),
    });

    expect(unsure.confidence).toBeGreaterThan(sure.confidence);
  });

  it('metama’lumot shubhasi tahlil mos kelganda ham saqlanadi', () => {
    const result = combineVerdict({
      ...baseInput,
      reportedProgress: 40,
      ruleConfidence: 0.5,
      ruleVerdict: AiVerdict.SUSPICIOUS,
      ruleComment: 'Obyektdan 3200 m uzoqlikda olingan',
    });

    // Surat mazmuni to‘g‘ri, lekin u boshqa joyda olingan — e’tiroz qoladi.
    expect(result.verdict).toBe(AiVerdict.SUSPICIOUS);
    expect(result.comment).toContain('3200 m');
  });

  it('teskari berilgan oraliqni to‘g‘rilaydi', () => {
    const result = combineVerdict({
      ...baseInput,
      reportedProgress: 40,
      vision: analysis({ rangeMin: 45, rangeMax: 35 }),
    });

    expect(result.withinRange).toBe(true);
  });

  it('oraliq berilmasa nuqtaviy bahodan ±5% yasaydi', () => {
    const inside = combineVerdict({
      ...baseInput,
      reportedProgress: 63,
      vision: analysis({
        estimatedProgressPercent: 60,
        rangeMin: 60,
        rangeMax: 60,
      }),
    });
    const outside = combineVerdict({
      ...baseInput,
      reportedProgress: 90,
      vision: analysis({
        estimatedProgressPercent: 60,
        rangeMin: 60,
        rangeMax: 60,
      }),
    });

    expect(inside.withinRange).toBe(true);
    expect(outside.withinRange).toBe(false);
    expect(outside.deviation).toBe(25);
  });

  it('chegaradan tashqari qiymatlarni 0–100 ichiga qisadi', () => {
    const result = combineVerdict({
      ...baseInput,
      reportedProgress: 100,
      vision: analysis({ rangeMin: -20, rangeMax: 180 }),
    });

    expect(result.withinRange).toBe(true);
  });

  it('ishonch juda past bo‘lsa rad etishga tavsiya beradi', () => {
    const result = combineVerdict({
      ...baseInput,
      reportedProgress: 95,
      ruleConfidence: 0.6,
      ruleVerdict: AiVerdict.SUSPICIOUS,
      ruleComment: 'Surat 40 kun oldin olingan',
    });

    expect(result.confidence).toBeLessThanOrEqual(
      VISION_RULES.REJECT_THRESHOLD,
    );
    expect(result.verdict).toBe(AiVerdict.REJECTED);
  });
});
