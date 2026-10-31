import {
  ObjectHealth,
  ObjectStatus,
  RiskLevel,
} from '../common/constants/enums';
import {
  evaluateObjectHealth,
  expectedProgressFor,
  HEALTH_THRESHOLDS,
} from './object-health.helpers';

/**
 * Obyekt holati — butun tizimning markaziy formulasi: dashboard kartalari,
 * xarita ranglari, TOP-5 ro‘yxati va bildirishnomalar shundan chiqadi.
 * Shu sababli u testlar bilan mustahkamlangan.
 */
describe('evaluateObjectHealth', () => {
  const TODAY = new Date('2026-10-30T08:00:00+05:00');

  const base = {
    status: ObjectStatus.IN_PROGRESS,
    progressPercent: 50,
    plannedStartDate: '2026-01-01',
    plannedEndDate: '2026-12-31',
    actualStartDate: '2026-01-05',
    actualEndDate: null as string | null,
  };

  describe('reja egri chizig‘i', () => {
    it('davr o‘rtasida kutilgan bajarilish ~50% bo‘ladi', () => {
      const value = expectedProgressFor(
        '2026-01-01',
        '2026-12-31',
        new Date('2026-07-02T00:00:00Z'),
      );
      expect(value).toBeGreaterThan(48);
      expect(value).toBeLessThan(52);
    });

    it('davr boshlanmagan bo‘lsa 0, tugagan bo‘lsa 100', () => {
      expect(
        expectedProgressFor(
          '2027-01-01',
          '2027-12-31',
          new Date('2026-10-30T00:00:00Z'),
        ),
      ).toBe(0);
      expect(
        expectedProgressFor(
          '2024-01-01',
          '2024-12-31',
          new Date('2026-10-30T00:00:00Z'),
        ),
      ).toBe(100);
    });
  });

  describe('holat guruhlari', () => {
    it('rejaga mos ketayotgan obyekt — ON_SCHEDULE', () => {
      // 2026-01-01…2026-12-31, bugun 30-oktabr → kutilgani ~83%.
      const result = evaluateObjectHealth(
        { ...base, progressPercent: 82 },
        TODAY,
      );
      expect(result.health).toBe(ObjectHealth.ON_SCHEDULE);
      expect(result.delayDays).toBeLessThan(HEALTH_THRESHOLDS.DELAYED_MIN_DAYS);
    });

    it('bir necha kunlik og‘ish KECHIKISH hisoblanmaydi (shovqin chegarasi)', () => {
      const result = evaluateObjectHealth(
        { ...base, progressPercent: 81.5 },
        TODAY,
      );
      expect(result.health).toBe(ObjectHealth.ON_SCHEDULE);
    });

    it('rejadan sezilarli ortda qolgan obyekt — DELAYED (muddati kelmagan bo‘lsa ham)', () => {
      const result = evaluateObjectHealth(
        { ...base, progressPercent: 76 },
        TODAY,
      );
      expect(result.health).toBe(ObjectHealth.DELAYED);
      expect(result.overdueDays).toBe(0);
      expect(result.scheduleSlipDays).toBeGreaterThanOrEqual(
        HEALTH_THRESHOLDS.DELAYED_MIN_DAYS,
      );
    });

    it('30 kundan ko‘p ortda qolgan obyekt — AT_RISK', () => {
      const result = evaluateObjectHealth(
        { ...base, progressPercent: 65 },
        TODAY,
      );
      expect(result.health).toBe(ObjectHealth.AT_RISK);
      expect(result.delayDays).toBeGreaterThanOrEqual(
        HEALTH_THRESHOLDS.AT_RISK_DELAY_DAYS,
      );
    });

    it('muddati o‘tgan va bajarilishi 50% dan past — AT_RISK', () => {
      const result = evaluateObjectHealth(
        { ...base, plannedEndDate: '2026-10-20', progressPercent: 40 },
        TODAY,
      );
      expect(result.health).toBe(ObjectHealth.AT_RISK);
      expect(result.overdueDays).toBe(10);
    });

    it('muddati kelmagan va boshlanmagan obyekt — NOT_STARTED, kechikishsiz', () => {
      const result = evaluateObjectHealth(
        {
          ...base,
          plannedStartDate: '2026-12-01',
          plannedEndDate: '2027-12-01',
          actualStartDate: null,
          progressPercent: 0,
        },
        TODAY,
      );
      expect(result.health).toBe(ObjectHealth.NOT_STARTED);
      expect(result.delayDays).toBe(0);
    });

    it('boshlanishi kechikkan obyekt kechikayotgan hisoblanadi', () => {
      const result = evaluateObjectHealth(
        {
          ...base,
          plannedStartDate: '2026-10-15',
          plannedEndDate: '2027-10-15',
          actualStartDate: null,
          progressPercent: 0,
        },
        TODAY,
      );
      expect(result.health).toBe(ObjectHealth.DELAYED);
      expect(result.delayDays).toBe(15);
    });
  });

  describe('maxsus holatlar', () => {
    it('topshirilgan obyekt COMPLETED bo‘ladi, kechikish fakti saqlanadi', () => {
      const result = evaluateObjectHealth(
        {
          ...base,
          status: ObjectStatus.COMPLETED,
          progressPercent: 100,
          plannedEndDate: '2026-08-01',
          actualEndDate: '2026-09-10',
        },
        TODAY,
      );
      expect(result.health).toBe(ObjectHealth.COMPLETED);
      expect(result.delayDays).toBe(40);
      expect(result.riskLevel).toBe(RiskLevel.LOW);
    });

    it('to‘xtatilgan obyekt avtomatik AT_RISK bo‘ladi', () => {
      const result = evaluateObjectHealth(
        { ...base, status: ObjectStatus.SUSPENDED, progressPercent: 90 },
        TODAY,
      );
      expect(result.health).toBe(ObjectHealth.AT_RISK);
      expect(result.riskLevel).toBe(RiskLevel.CRITICAL);
    });

    it('uchta ochiq muammo holatni bir pog‘ona og‘irlashtiradi', () => {
      const clean = evaluateObjectHealth(
        { ...base, progressPercent: 82 },
        TODAY,
      );
      const escalated = evaluateObjectHealth(
        { ...base, progressPercent: 82, openDelayCount: 3 },
        TODAY,
      );
      expect(clean.health).toBe(ObjectHealth.ON_SCHEDULE);
      expect(escalated.health).toBe(ObjectHealth.AT_RISK);
    });

    it('«xavfli» holatdagi obyektning risk darajasi hech qachon past bo‘lmaydi', () => {
      const result = evaluateObjectHealth(
        { ...base, progressPercent: 65 },
        TODAY,
      );
      expect(result.health).toBe(ObjectHealth.AT_RISK);
      expect([RiskLevel.HIGH, RiskLevel.CRITICAL]).toContain(result.riskLevel);
    });
  });

  describe('guruhlar o‘zaro inkor', () => {
    it('har qanday kirishda aniq bitta holat qaytadi', () => {
      const all = new Set<ObjectHealth>();
      for (let progress = 0; progress <= 100; progress += 5) {
        for (const end of ['2026-06-01', '2026-11-30', '2027-06-01']) {
          const result = evaluateObjectHealth(
            { ...base, progressPercent: progress, plannedEndDate: end },
            TODAY,
          );
          all.add(result.health);
          expect(Object.values(ObjectHealth)).toContain(result.health);
        }
      }
      // Sinov to‘plami kamida uchta turli holatni qamrab olishi kerak,
      // aks holda test hech narsani tekshirmayotgan bo‘lardi.
      expect(all.size).toBeGreaterThanOrEqual(3);
    });
  });
});
