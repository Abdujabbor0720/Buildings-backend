import { ObjectHealth, ObjectStatus } from '../../common/constants/enums';
import { evaluateObjectHealth } from '../../helpers/object-health.helpers';
import { addDays, diffInDays, toDateKey } from '../../helpers/date.helpers';
import { Rng } from './rng';

/* ───────────────────────── Kirish ma’lumotlari ───────────────────────── */

export interface DistributionData {
  activeObjects: number;
  completedObjects: number;
  cancelledObjects: number;
  byDistrict: Record<string, number>;
  byType: Record<string, number>;
  byDeadline: { currentYear: number; nextYear: number; beyond: number };
  byHealth: Record<string, number>;
  delayRecordsByReason: Record<string, number>;
  totalCostTargetSom: number;
  fundingSourceWeights: Record<string, number>;
}

export interface TypeTemplate {
  capacityUnit: string;
  capacityRange: [number, number];
  costRangeSom: [number, number];
  areaRange: [number, number];
  floorsRange: [number, number];
  names: string[];
}

export interface FeaturedObject {
  key: string;
  name: string;
  districtCode: string;
  typeCode: string;
  plannedEndDate: string;
  progressPercent: number;
  targetSlipDays: number;
  totalCost: string;
  capacity: number;
  delayReasons: string[];
  address: string;
}

export interface DistrictRef {
  code: string;
  shortName: string;
  centerLat: number;
  centerLng: number;
  /**
   * Tumandagi mahalla markazlari — NAMOYISH ma'lumotini joylashtirish uchun.
   *
   * ⚠️ Bo'sh bo'lishi ODDIY HOL: mahalla chegaralari hamma tumanda ham
   * yo'q (manba — OpenStreetMap, qoplama to'liq emas). Bunday tumanda
   * obyekt avvalgidek tuman markazi atrofiga sochiladi.
   */
  mahallaCenters?: Array<{ lat: number; lng: number }>;
}

/* ───────────────────────── Chiqish ───────────────────────── */

export interface ObjectSpec {
  key: string | null;
  name: string;
  districtCode: string;
  typeCode: string;
  address: string;
  lat: number;
  lng: number;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate: string | null;
  actualEndDate: string | null;
  progressPercent: number;
  status: ObjectStatus;
  totalCost: string;
  capacity: number;
  capacityUnit: string;
  areaM2: number | null;
  floors: number | null;
  fundingSourceCode: string;
  /** Ochiq kechikish yozuvlari uchun sabab kodlari. */
  delayReasonCodes: string[];
  /** Generator mo‘ljallagan holat — seed oxirida tekshiriladi. */
  targetHealth: ObjectHealth;
}

type DeadlineBucket = 'currentYear' | 'nextYear' | 'beyond';

/** Har bir holat uchun «reja egri chizig‘idan ortda qolish» oralig‘i (kun). */
const SLIP_RANGES: Record<string, [number, number]> = {
  on_schedule: [0, 5],
  delayed: [8, 28],
  at_risk: [32, 95],
};

/**
 * «Kechikayotgan» obyekt muddati o‘tgan bo‘lsa, bajarilishining quyi chegarasi.
 * Pastroq qiymatda holat formulasi uni «xavfli» ga ko‘taradi
 * (`AT_RISK_PROGRESS_PERCENT`).
 */
const HEALTH_FLOOR_FOR_OVERDUE_DELAYED = 55;

/** Muddat guruhiga qarab loyiha davomiyligi (kun). */
const DURATION_RANGES: Record<DeadlineBucket, [number, number]> = {
  currentYear: [320, 900],
  nextYear: [450, 1150],
  beyond: [620, 1500],
};

/**
 * OBYEKTLAR GENERATORI.
 *
 * ⚠️ Asosiy nozik joy: `progressPercent` TASODIFIY TANLANMAYDI, balki
 * mo‘ljallangan ortda qolishdan TESKARI hisoblanadi. Sabab: obyektning
 * holati (`healthStatus`) sanalar va bajarilishdan KELIB CHIQADI, demak
 * «38 ta kechikayotgan» degan raqamni olish uchun progressni tasodifiy
 * qo‘yib, keyin holatni «majburan» yozib qo‘yish mumkin emas — u keyingi
 * tungi passda o‘z-o‘zidan boshqa qiymatga o‘zgarib ketardi.
 *
 * Formula (`object-health.helpers.ts` dagi bilan AYNI):
 *   slip = D × (1 − P/100) − R      →      P = 100 × (1 − (slip + R) / D)
 * bu yerda D — loyiha davomiyligi, R — bugundan muddatgacha qolgan kunlar.
 */
export class ObjectGenerator {
  constructor(
    private readonly rng: Rng,
    private readonly today: Date,
    private readonly templates: Record<string, TypeTemplate>,
    private readonly districts: Map<string, DistrictRef>,
  ) {}

  generate(dist: DistributionData, featured: FeaturedObject[]): ObjectSpec[] {
    const specs: ObjectSpec[] = [];

    // 1) Maketdagi aniq qatorlar — ular hisoblagichlardan ayiriladi.
    const districtLeft = { ...dist.byDistrict };
    const typeLeft = { ...dist.byType };
    const healthLeft = { ...dist.byHealth };
    const deadlineLeft = { ...dist.byDeadline };

    for (const f of featured) {
      specs.push(this.fromFeatured(f));
      districtLeft[f.districtCode] -= 1;
      typeLeft[f.typeCode] -= 1;
      const health = healthForSlip(f.targetSlipDays);
      healthLeft[health] -= 1;
      deadlineLeft[this.bucketOf(f.plannedEndDate)] -= 1;
    }

    // 2) Qolgan slotlar: har bir o‘lcham bo‘yicha ro‘yxat tuziladi va
    //    mustaqil aralashtiriladi, so‘ng indeks bo‘yicha birlashtiriladi.
    const remaining = dist.activeObjects - featured.length;
    const districtSlots = this.rng.shuffle(expand(districtLeft));
    const typeSlots = this.rng.shuffle(expand(typeLeft));
    const healthSlots = this.rng.shuffle(expand(healthLeft)) as ObjectHealth[];
    const deadlineSlots = this.rng.shuffle(
      expand(deadlineLeft),
    ) as DeadlineBucket[];

    assertLength('tuman', districtSlots, remaining);
    assertLength('tur', typeSlots, remaining);
    assertLength('holat', healthSlots, remaining);
    assertLength('muddat', deadlineSlots, remaining);

    // ⚠️ «Boshlanmagan» obyekt JORIY YILDA tugay olmaydi: u hali
    // boshlanmagan, demak muddati ham uzoqroqda. Mos kelmagan juftlik
    // boshqa indeks bilan almashtiriladi.
    fixNotStartedBuckets(healthSlots, deadlineSlots);

    for (let i = 0; i < remaining; i += 1) {
      specs.push(
        this.buildActive(
          districtSlots[i],
          typeSlots[i],
          healthSlots[i],
          deadlineSlots[i],
          i,
        ),
      );
    }

    // 3) Topshirilgan va bekor qilinganlar — dashboard sukut bo‘yicha
    //    ularni sanamaydi, lekin hisobot va tarix uchun kerak.
    for (let i = 0; i < dist.completedObjects; i += 1) {
      specs.push(this.buildCompleted(i));
    }
    for (let i = 0; i < dist.cancelledObjects; i += 1) {
      specs.push(this.buildCancelled(i));
    }

    this.alignHealthWithFormula(specs);
    this.scaleCostsToTarget(specs, dist);
    this.assignFundingSources(specs, dist);
    return specs;
  }

  /* ───────────────────────── Yordamchilar ───────────────────────── */

  private fromFeatured(f: FeaturedObject): ObjectSpec {
    const district = this.districtOrThrow(f.districtCode);
    const template = this.templateOrThrow(f.typeCode);
    const remainingDays =
      diffInDays(toDateKey(this.today), f.plannedEndDate) ?? 0;

    // Davomiylik mo‘ljallangan ortda qolish va bajarilishdan TESKARI chiqadi.
    const duration = Math.max(
      150,
      Math.round(
        (f.targetSlipDays + remainingDays) / (1 - f.progressPercent / 100),
      ),
    );
    const start = addDays(parseDate(f.plannedEndDate), -duration);

    return {
      key: f.key,
      name: f.name,
      districtCode: f.districtCode,
      typeCode: f.typeCode,
      address: f.address,
      ...this.scatter(district),
      plannedStartDate: toDateKey(start)!,
      plannedEndDate: f.plannedEndDate,
      actualStartDate: toDateKey(addDays(start, this.rng.int(0, 14)))!,
      actualEndDate: null,
      progressPercent: f.progressPercent,
      status: ObjectStatus.IN_PROGRESS,
      totalCost: f.totalCost,
      capacity: f.capacity,
      capacityUnit: template.capacityUnit,
      areaM2: this.areaFor(template),
      floors: this.floorsFor(template),
      fundingSourceCode: 'state_budget',
      delayReasonCodes: f.delayReasons,
      targetHealth: healthForSlip(f.targetSlipDays),
    };
  }

  private buildActive(
    districtCode: string,
    typeCode: string,
    health: ObjectHealth,
    bucket: DeadlineBucket,
    index: number,
  ): ObjectSpec {
    const district = this.districtOrThrow(districtCode);
    const template = this.templateOrThrow(typeCode);

    if (health === ObjectHealth.NOT_STARTED) {
      return this.buildNotStarted(district, template, typeCode, bucket, index);
    }

    const plannedEnd = this.pickEndDate(bucket, health);
    const remainingDays = diffInDays(toDateKey(this.today), plannedEnd) ?? 0;
    const slip = this.rng.int(...SLIP_RANGES[health]);

    const [minD, maxD] = DURATION_RANGES[bucket];
    let duration = this.rng.int(minD, maxD);
    let progress = 100 * (1 - (slip + remainingDays) / duration);

    // Hisob mantiqsiz chiqsa (manfiy yoki 99% dan yuqori) — davomiylikni
    // qiymat mos keladigan darajada kengaytiramiz.
    let guard = 0;
    while ((progress < 3 || progress > 97) && guard < 12) {
      duration = Math.round(duration * (progress < 3 ? 1.35 : 0.78));
      duration = Math.max(150, Math.min(2200, duration));
      progress = 100 * (1 - (slip + remainingDays) / duration);
      guard += 1;
    }
    progress = Number(Math.max(3, Math.min(97, progress)).toFixed(2));

    // ⚠️ Muddati o‘tgan va bajarilishi 50% dan past obyekt holat formulasi
    // bo‘yicha AVTOMAT «xavfli» bo‘ladi. «Kechikayotgan» deb mo‘ljallangan
    // obyektni shu tuzoqdan olib chiqamiz: muddati o‘tgan bo‘lsa, bajarilish
    // 55% dan past bo‘lmaydi (`delayDays` baribir `overdueDays` dan olinadi).
    if (
      health === ObjectHealth.DELAYED &&
      remainingDays < 0 &&
      progress < HEALTH_FLOOR_FOR_OVERDUE_DELAYED
    ) {
      progress = this.rng.float(HEALTH_FLOOR_FOR_OVERDUE_DELAYED, 78, 2);
    }

    const start = addDays(parseDate(plannedEnd), -duration);

    return {
      key: null,
      name: this.nameFor(template, district, index),
      districtCode,
      typeCode,
      address: this.addressFor(district, index),
      ...this.scatter(district),
      plannedStartDate: toDateKey(start)!,
      plannedEndDate: plannedEnd,
      actualStartDate: toDateKey(addDays(start, this.rng.int(0, 21)))!,
      actualEndDate: null,
      progressPercent: progress,
      status: ObjectStatus.IN_PROGRESS,
      totalCost: this.costFor(template),
      capacity: this.rng.int(...template.capacityRange),
      capacityUnit: template.capacityUnit,
      areaM2: this.areaFor(template),
      floors: this.floorsFor(template),
      fundingSourceCode: 'state_budget',
      delayReasonCodes: [],
      targetHealth: health,
    };
  }

  private buildNotStarted(
    district: DistrictRef,
    template: TypeTemplate,
    typeCode: string,
    bucket: DeadlineBucket,
    index: number,
  ): ObjectSpec {
    // ⚠️ Tugash sanasi O‘ZIGA BERILGAN muddat guruhida qolishi SHART:
    // aks holda «Muddatlar bo‘yicha» diagrammasi taqsimotga mos kelmaydi.
    // Boshlanish sanasi esa kelajakda — obyekt hali boshlanmagan.
    let end = parseDate(this.pickEndDate(bucket, ObjectHealth.NOT_STARTED));
    const earliestEnd = addDays(this.today, 220);
    if (end < earliestEnd) end = earliestEnd;

    const latestStart = addDays(end, -180);
    const earliestStart = addDays(this.today, 15);
    const start =
      latestStart > earliestStart
        ? this.randomBetween(earliestStart, latestStart)
        : earliestStart;

    return {
      key: null,
      name: this.nameFor(template, district, index),
      districtCode: district.code,
      typeCode,
      address: this.addressFor(district, index),
      ...this.scatter(district),
      plannedStartDate: toDateKey(start)!,
      plannedEndDate: toDateKey(end)!,
      actualStartDate: null,
      actualEndDate: null,
      progressPercent: 0,
      status: ObjectStatus.NOT_STARTED,
      totalCost: this.costFor(template),
      capacity: this.rng.int(...template.capacityRange),
      capacityUnit: template.capacityUnit,
      areaM2: this.areaFor(template),
      floors: this.floorsFor(template),
      fundingSourceCode: 'state_budget',
      delayReasonCodes: [],
      targetHealth: ObjectHealth.NOT_STARTED,
    };
  }

  private buildCompleted(index: number): ObjectSpec {
    const districtCode = this.rng.pick([...this.districts.keys()]);
    const district = this.districtOrThrow(districtCode);
    const typeCode = this.rng.pick(Object.keys(this.templates));
    const template = this.templateOrThrow(typeCode);

    const end = addDays(this.today, -this.rng.int(20, 540));
    const duration = this.rng.int(300, 900);
    const start = addDays(end, -duration);
    // Yarmi muddatida, yarmi bir oz kech topshirilgan — hisobotda
    // «muddatida topshirildi» ko‘rsatkichi ma’noga ega bo‘lishi uchun.
    const actualEnd = addDays(
      end,
      this.rng.bool(0.55) ? -this.rng.int(0, 20) : this.rng.int(3, 70),
    );

    return {
      key: null,
      name: this.nameFor(template, district, 500 + index),
      districtCode,
      typeCode,
      address: this.addressFor(district, 500 + index),
      ...this.scatter(district),
      plannedStartDate: toDateKey(start)!,
      plannedEndDate: toDateKey(end)!,
      actualStartDate: toDateKey(addDays(start, this.rng.int(0, 15)))!,
      actualEndDate: toDateKey(actualEnd)!,
      progressPercent: 100,
      status: ObjectStatus.COMPLETED,
      totalCost: this.costFor(template),
      capacity: this.rng.int(...template.capacityRange),
      capacityUnit: template.capacityUnit,
      areaM2: this.areaFor(template),
      floors: this.floorsFor(template),
      fundingSourceCode: 'state_budget',
      delayReasonCodes: [],
      targetHealth: ObjectHealth.COMPLETED,
    };
  }

  private buildCancelled(index: number): ObjectSpec {
    const base = this.buildCompleted(900 + index);
    return {
      ...base,
      status: ObjectStatus.CANCELLED,
      progressPercent: this.rng.int(5, 45),
      actualEndDate: null,
      targetHealth: ObjectHealth.AT_RISK,
    };
  }

  /** Muddat guruhiga mos tugash sanasi. */
  private pickEndDate(bucket: DeadlineBucket, health: ObjectHealth): string {
    const year = this.today.getUTCFullYear();

    if (bucket === 'currentYear') {
      // ⚠️ Muddat holatga MOS bo‘lishi kerak, aks holda `delayDays` boshqa
      // guruhga olib o‘tadi:
      //   • «reja asosida» — muddati o‘tgan bo‘la olmaydi (ta’rifi bo‘yicha);
      //   • «kechikayotgan» — muddati ko‘pi bilan 20 kun oldin o‘tgan
      //     bo‘lishi mumkin, aks holda `overdueDays` 30 dan oshib, obyekt
      //     o‘z-o‘zidan «xavfli» bo‘lib qolardi;
      //   • «xavfli» — istalgancha o‘tgan bo‘lishi mumkin.
      let from: Date;
      if (health === ObjectHealth.ON_SCHEDULE) from = addDays(this.today, 5);
      else if (health === ObjectHealth.DELAYED) from = addDays(this.today, -20);
      else from = new Date(Date.UTC(year, 7, 1));

      const to = new Date(Date.UTC(year, 11, 31));
      return toDateKey(this.randomBetween(from, to))!;
    }

    if (bucket === 'nextYear') {
      return toDateKey(
        this.randomBetween(
          new Date(Date.UTC(year + 1, 0, 10)),
          new Date(Date.UTC(year + 1, 11, 31)),
        ),
      )!;
    }

    // «2028+» guruhi: asosan keyingi-keyingi yil, kichik qismi undan keyin.
    const to = this.rng.bool(0.75)
      ? new Date(Date.UTC(year + 2, 11, 28))
      : new Date(Date.UTC(year + 3, 11, 20));
    return toDateKey(
      this.randomBetween(new Date(Date.UTC(year + 2, 0, 10)), to),
    )!;
  }

  private randomBetween(from: Date, to: Date): Date {
    const span = Math.max(
      1,
      Math.round((to.getTime() - from.getTime()) / 86_400_000),
    );
    return addDays(from, this.rng.int(0, span));
  }

  private bucketOf(dateKey: string): DeadlineBucket {
    const year = Number(dateKey.slice(0, 4));
    const current = this.today.getUTCFullYear();
    if (year <= current) return 'currentYear';
    if (year === current + 1) return 'nextYear';
    return 'beyond';
  }

  /**
   * Obyekt nuqtasi.
   *
   * ⚠️ Tumanda MAHALLA chegaralari bo'lsa, nuqta tuman markazi emas,
   * MAHALLA markazi atrofiga qo'yiladi va siljish kichik (~200 m).
   * Sabab namoyishga oid: tuman markazi atrofiga keng sochilgan
   * nuqtalarning deyarli hammasi mahalla chegaralaridan tashqarida
   * qolar va «mahallalar kesimida» xaritasi bo'sh ko'rinardi —
   * holbuki mexanizmning o'zi ishlaydi.
   *
   * ⚠️ Bu FAQAT namunaviy ma'lumotga tegishli. Haqiqiy obyektning
   * koordinatasi xaritadan tanlanadi va mahallasi o'sha nuqtadan
   * aniqlanadi (`mahalla-assign.ts`).
   */
  private scatter(district: DistrictRef): { lat: number; lng: number } {
    const centers = district.mahallaCenters;
    if (centers && centers.length > 0) {
      const base = centers[this.rng.int(0, centers.length - 1)];
      return {
        lat: Number((base.lat + this.rng.float(-0.002, 0.002, 6)).toFixed(6)),
        lng: Number((base.lng + this.rng.float(-0.002, 0.002, 6)).toFixed(6)),
      };
    }
    return {
      lat: Number(
        (district.centerLat + this.rng.float(-0.035, 0.035, 5)).toFixed(6),
      ),
      lng: Number(
        (district.centerLng + this.rng.float(-0.045, 0.045, 5)).toFixed(6),
      ),
    };
  }

  private nameFor(
    template: TypeTemplate,
    district: DistrictRef,
    index: number,
  ): string {
    const pattern = template.names[index % template.names.length];
    return pattern
      .replace(/\{district\}/g, district.shortName)
      .replace(/\{n\}/g, String(this.rng.int(1, 48)))
      .replace(/\s+/g, ' ')
      .trim();
  }

  private addressFor(district: DistrictRef, index: number): string {
    const streets = [
      'Navoiy',
      'Bobur',
      'Amir Temur',
      'Mustaqillik',
      'Cho‘lpon',
      'Fitrat',
      'Istiqlol',
      'Do‘stlik',
    ];
    return `${district.shortName}, ${streets[index % streets.length]} ko‘chasi ${this.rng.int(1, 120)}-uy`;
  }

  private costFor(template: TypeTemplate): string {
    const [min, max] = template.costRangeSom;
    // 100 mln so‘mgacha yaxlitlanadi — byudjet hujjatlarida summalar
    // shunday ko‘rinadi, tiyingacha aniqlik bu yerda soxta aniqlik bo‘lardi.
    const raw = this.rng.int(min, max);
    return (Math.round(raw / 100_000_000) * 100_000_000).toFixed(2);
  }

  private areaFor(template: TypeTemplate): number | null {
    const [min, max] = template.areaRange;
    return max === 0 ? null : this.rng.float(min, max, 1);
  }

  private floorsFor(template: TypeTemplate): number | null {
    const [min, max] = template.floorsRange;
    return max === 0 ? null : this.rng.int(min, max);
  }

  private districtOrThrow(code: string): DistrictRef {
    const district = this.districts.get(code);
    if (!district) throw new Error(`Seed: «${code}» tumani topilmadi`);
    return district;
  }

  private templateOrThrow(code: string): TypeTemplate {
    const template = this.templates[code];
    if (!template) throw new Error(`Seed: «${code}» turi uchun shablon yo‘q`);
    return template;
  }

  /**
   * UMUMIY QIYMATNI MO‘LJALGA KELTIRISH.
   * Faol obyektlar yig‘indisi maketdagi «7.4 trln so‘m» ga teng bo‘lishi
   * kerak, shuning uchun hamma summa bitta koeffitsiyentga ko‘paytiriladi —
   * nisbatlar saqlanadi, yig‘indi esa mo‘ljalga tushadi.
   */
  private scaleCostsToTarget(
    specs: ObjectSpec[],
    dist: DistributionData,
  ): void {
    const active = specs.filter(
      (s) =>
        s.status !== ObjectStatus.COMPLETED &&
        s.status !== ObjectStatus.CANCELLED,
    );
    const current = active.reduce((sum, s) => sum + Number(s.totalCost), 0);
    if (current <= 0) return;

    const factor = dist.totalCostTargetSom / current;
    let running = 0;

    active.forEach((spec, index) => {
      if (index === active.length - 1) {
        // Oxirgisi — qoldiqni yopadi, yig‘indi ANIQ mo‘ljalga teng bo‘ladi.
        spec.totalCost = Math.max(
          1_000_000_000,
          dist.totalCostTargetSom - running,
        ).toFixed(2);
        return;
      }
      const scaled =
        Math.round((Number(spec.totalCost) * factor) / 100_000_000) *
        100_000_000;
      const value = Math.max(1_000_000_000, scaled);
      running += value;
      spec.totalCost = value.toFixed(2);
    });
  }

  private assignFundingSources(
    specs: ObjectSpec[],
    dist: DistributionData,
  ): void {
    for (const spec of specs) {
      spec.fundingSourceCode = this.rng.weighted(dist.fundingSourceWeights);
    }
  }

  /**
   * HOLATNI FORMULA BILAN TENGLASHTIRISH — oxirgi tekshiruv.
   *
   * ⚠️ Generator progressni mo‘ljaldan teskari hisoblaydi, lekin davomiylik
   * chegaralarga urilganda (`150…2200` kun) natija bir-ikki kunga siljishi
   * mumkin va obyekt qo‘shni guruhga o‘tib ketadi. Bu yerda HAQIQIY
   * formuladan (`evaluateObjectHealth`) foydalanib, bajarilish foizi
   * bisektsiya bilan to‘g‘rilanadi.
   *
   * Monotonlik: bajarilish qancha yuqori bo‘lsa, holat shuncha yaxshi —
   * shuning uchun ikkiga bo‘lish usuli ishonchli ishlaydi.
   */
  private alignHealthWithFormula(specs: ObjectSpec[]): void {
    const order: ObjectHealth[] = [
      ObjectHealth.AT_RISK,
      ObjectHealth.DELAYED,
      ObjectHealth.ON_SCHEDULE,
    ];

    for (const spec of specs) {
      if (!order.includes(spec.targetHealth)) continue;
      if (this.healthOf(spec, spec.progressPercent) === spec.targetHealth)
        continue;

      const targetRank = order.indexOf(spec.targetHealth);
      let low = 1;
      let high = 99;
      let best: number | null = null;

      for (let i = 0; i < 24 && low <= high; i += 1) {
        const mid = Number(((low + high) / 2).toFixed(2));
        const rank = order.indexOf(this.healthOf(spec, mid));

        if (rank === targetRank) {
          best = mid;
          break;
        }
        // Rank kichikroq = holat og‘irroq → bajarilishni oshiramiz.
        if (rank < targetRank) low = mid + 0.01;
        else high = mid - 0.01;
      }

      if (best !== null) spec.progressPercent = best;
    }
  }

  private healthOf(spec: ObjectSpec, progressPercent: number): ObjectHealth {
    return evaluateObjectHealth(
      {
        status: spec.status,
        progressPercent,
        plannedStartDate: spec.plannedStartDate,
        plannedEndDate: spec.plannedEndDate,
        actualStartDate: spec.actualStartDate,
        actualEndDate: spec.actualEndDate,
        // ⚠️ Kechikish yozuvlari hali yaratilmagan; seed `delayed` obyektga
        // 2 tadan ortiq ochiq yozuv bermaydi, demak eskalatsiya bo‘lmaydi.
        openDelayCount: 0,
      },
      this.today,
    ).health;
  }
}

/* ───────────────────────── Sof funksiyalar ───────────────────────── */

function healthForSlip(slip: number): ObjectHealth {
  if (slip >= 30) return ObjectHealth.AT_RISK;
  if (slip >= 7) return ObjectHealth.DELAYED;
  return ObjectHealth.ON_SCHEDULE;
}

/** `{ a: 2, b: 1 }` → `['a', 'a', 'b']` */
function expand(counts: Record<string, number>): string[] {
  const out: string[] = [];
  for (const [key, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i += 1) out.push(key);
  }
  return out;
}

function assertLength(label: string, items: unknown[], expected: number): void {
  if (items.length !== expected) {
    throw new Error(
      `Seed taqsimoti mos kelmadi: ${label} bo‘yicha ${items.length} ta slot, kutilgani ${expected} ta. ` +
        '`distribution.json` va `featured-objects.json` ni tekshiring.',
    );
  }
}

/** «Boshlanmagan» ni joriy yil muddatidan boshqa guruhga ko‘chiradi. */
function fixNotStartedBuckets(
  health: ObjectHealth[],
  deadline: DeadlineBucket[],
): void {
  for (let i = 0; i < health.length; i += 1) {
    if (health[i] !== ObjectHealth.NOT_STARTED || deadline[i] !== 'currentYear')
      continue;

    const swapIndex = deadline.findIndex(
      (b, j) => b !== 'currentYear' && health[j] !== ObjectHealth.NOT_STARTED,
    );
    if (swapIndex === -1) continue;
    [deadline[i], deadline[swapIndex]] = [deadline[swapIndex], deadline[i]];
  }
}

function parseDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}
