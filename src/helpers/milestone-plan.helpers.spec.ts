import { MilestoneStatus, RiskLevel } from '../common/constants/enums';
import {
  analyzeMilestone,
  milestoneExpectedPercent,
  type MilestoneAnalysisInput,
} from '../modules/ai/ai-engine.helpers';
import { planProgress } from './milestone-plan.helpers';

type PlanRow = Parameters<typeof planProgress>[0][number];

const row = (
  weight: number,
  progressPercent: number,
  status: MilestoneStatus = MilestoneStatus.PLANNED,
): PlanRow => ({ weight, progressPercent, status });

describe('planProgress — ish rejasidan bajarilish', () => {
  it('reja yo‘q bo‘lsa null qaytaradi (qo‘lda kiritilgan foiz saqlanadi)', () => {
    expect(planProgress([])).toBeNull();
  });

  it('ulushlar bo‘yicha o‘rtacha hisoblaydi', () => {
    // 30% ulush × 100% + 70% ulush × 0% = 30%
    expect(planProgress([row(30, 100), row(70, 0)])).toBe(30);
  });

  it('bosqichlarning hammasi bajarilsa 100% beradi', () => {
    expect(planProgress([row(15, 100), row(35, 100), row(50, 100)])).toBe(100);
  });

  it('BEKOR QILINGAN bosqich maxrajdan ham chiqadi', () => {
    // 20% ulushli bosqich bekor qilindi. Qolgan 80 dan 40 i bajarilgan →
    // 50%. Agar u nolga tenglashtirilganda 40% chiqib, obyekt o‘z-o‘zidan
    // 10 foiz bandga «orqaga ketgan» bo‘lardi.
    const rows = [
      row(40, 100),
      row(40, 0),
      row(20, 0, MilestoneStatus.CANCELLED),
    ];
    expect(planProgress(rows)).toBe(50);
  });

  it('ulushlar yig‘indisi 100 bo‘lmasa ham normallashtiriladi', () => {
    // Reja to‘liq emas (60%), lekin mavjudining yarmi bajarilgan.
    expect(planProgress([row(30, 100), row(30, 0)])).toBe(50);
  });

  it('hammasi bekor qilingan bo‘lsa null — nol EMAS', () => {
    expect(
      planProgress([
        row(50, 80, MilestoneStatus.CANCELLED),
        row(50, 60, MilestoneStatus.CANCELLED),
      ]),
    ).toBeNull();
  });
});

describe('milestoneExpectedPercent — bosqichning bugungi reja foizi', () => {
  it('muddat o‘rtasida 50% kutiladi', () => {
    expect(
      milestoneExpectedPercent(
        '2026-01-01',
        '2026-01-11',
        new Date('2026-01-06T00:00:00Z'),
      ),
    ).toBe(50);
  });

  it('boshlanishidan oldin 0%', () => {
    expect(
      milestoneExpectedPercent(
        '2026-05-01',
        '2026-06-01',
        new Date('2026-04-01T00:00:00Z'),
      ),
    ).toBe(0);
  });

  it('muddatdan keyin 100% — oshib ketmaydi', () => {
    expect(
      milestoneExpectedPercent(
        '2026-01-01',
        '2026-02-01',
        new Date('2026-09-01T00:00:00Z'),
      ),
    ).toBe(100);
  });

  it('bir kunlik bosqich: muddat kelgan bo‘lsa 100%', () => {
    expect(
      milestoneExpectedPercent(
        '2026-03-10',
        '2026-03-10',
        new Date('2026-03-10T00:00:00Z'),
      ),
    ).toBe(100);
  });
});

const baseInput = (
  over: Partial<MilestoneAnalysisInput> = {},
): MilestoneAnalysisInput => ({
  milestoneName: 'Poydevor ishlari',
  objectName: 'Baliqchi tumani 7-son maktab',
  weight: 20,
  milestonePercent: 50,
  plannedStart: '2026-01-01',
  plannedEnd: '2026-03-01',
  actualEnd: null,
  cancelled: false,
  workerCount: 12,
  reportCount: 2,
  aiEstimatedProgress: null,
  objectProgress: 35,
  objectExpectedProgress: 40,
  totalMilestones: 5,
  doneMilestones: 1,
  ...over,
});

describe('analyzeMilestone — bosqich tahlili', () => {
  const today = new Date('2026-02-01T00:00:00Z');

  it('score — risk bali emas, BAJARILISH foizi', () => {
    const out = analyzeMilestone(baseInput({ milestonePercent: 72.5 }), today);
    expect(out.score).toBe(72.5);
  });

  it('umumiy natijaga qo‘shgan ulushini hisoblaydi', () => {
    const out = analyzeMilestone(
      baseInput({ weight: 20, milestonePercent: 50 }),
      today,
    );
    expect(out.details.contribution).toBe(10);
  });

  it('bajarilgan bosqich past riskda bo‘ladi', () => {
    const out = analyzeMilestone(
      baseInput({ milestonePercent: 100, actualEnd: '2026-02-20' }),
      today,
    );
    expect(out.riskLevel).toBe(RiskLevel.LOW);
    expect(out.summary).toContain('100% bajarildi');
  });

  it('muddati o‘tgan va tugallanmagan bosqich — yuqori risk', () => {
    const out = analyzeMilestone(
      baseInput({
        plannedStart: '2025-01-01',
        plannedEnd: '2025-06-01',
        milestonePercent: 40,
      }),
      today,
    );
    expect([RiskLevel.HIGH, RiskLevel.CRITICAL]).toContain(out.riskLevel);
    expect(out.details.overdueDays).toBeGreaterThan(0);
  });

  it('hisobotdagi foiz suratdan baholangandan KESKIN farq qilsa ogohlantiradi', () => {
    const out = analyzeMilestone(
      baseInput({ milestonePercent: 90, aiEstimatedProgress: 55 }),
      today,
    );
    expect(out.details.estimateGap).toBe(35);
    expect(out.recommendations.join(' ')).toContain('joyida tekshiring');
    // ⚠️ Bu ISHONCHLILIK muammosi — past riskda qolib ketmasligi kerak.
    expect(out.riskLevel).not.toBe(RiskLevel.LOW);
  });

  it('kichik farq ogohlantirish bermaydi — shovqin bo‘lardi', () => {
    const out = analyzeMilestone(
      baseInput({ milestonePercent: 60, aiEstimatedProgress: 52 }),
      today,
    );
    expect(out.recommendations.join(' ')).not.toContain('joyida tekshiring');
  });

  it('bekor qilingan bosqich umumiy hisobga kirmasligini aytadi', () => {
    const out = analyzeMilestone(baseInput({ cancelled: true }), today);
    expect(out.summary).toContain('bekor qilingan');
    expect(out.riskLevel).toBe(RiskLevel.LOW);
  });

  it('foto-hisobotsiz bosqich uchun surat talab qiladi', () => {
    const out = analyzeMilestone(baseInput({ reportCount: 0 }), today);
    expect(out.recommendations.join(' ')).toContain('foto-hisobot');
  });
});
