import { hash } from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DataSource, EntityManager } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { SeedStorage } from './seed-storage';
import {
  AiAnalysisType,
  AiVerdict,
  AiVisionStatus,
  ContractorStatus,
  DelayStatus,
  DocumentType,
  FundingTxType,
  MilestoneStatus,
  NotificationSeverity,
  NotificationType,
  ObjectHealth,
  ObjectStatus,
  PhotoReportStatus,
  ProgressSource,
  RiskLevel,
  UserRole,
} from '../../common/constants/enums';
import {
  addDays,
  diffInDays,
  tashkentToday,
  toDateKey,
} from '../../helpers/date.helpers';
import { evaluateObjectHealth } from '../../helpers/object-health.helpers';
import { analyzeAll } from '../../modules/ai/ai-engine.helpers';
import { verifyPhotoReport } from '../../modules/photo-reports/photo-verification.helpers';
import { AiAnalysis } from '../entities/ai-analysis.entity';
import { AppSetting } from '../entities/app-setting.entity';
import { ConstructionObject } from '../entities/construction-object.entity';
import { ConstructionType } from '../entities/construction-type.entity';
import { Contractor } from '../entities/contractor.entity';
import { Customer } from '../entities/customer.entity';
import { DelayReason } from '../entities/delay-reason.entity';
import { District } from '../entities/district.entity';
import { FundingAllocation } from '../entities/funding-allocation.entity';
import { FundingSource } from '../entities/funding-source.entity';
import { FundingTransaction } from '../entities/funding-transaction.entity';
import { Notification } from '../entities/notification.entity';
import { ObjectDelay } from '../entities/object-delay.entity';
import { ObjectDocument } from '../entities/object-document.entity';
import { ObjectMilestone } from '../entities/object-milestone.entity';
import { ObjectProgressUpdate } from '../entities/object-progress-update.entity';
import { PhotoReport } from '../entities/photo-report.entity';
import { PhotoReportImage } from '../entities/photo-report-image.entity';
import { Region } from '../entities/region.entity';
import { StoredFile } from '../entities/stored-file.entity';
import { User } from '../entities/user.entity';
import { SETTING_DEFAULTS } from '../../modules/settings/settings.service';
import { buildPlaceholderPng } from './placeholder-image';
import {
  ObjectGenerator,
  type DistributionData,
  type DistrictRef,
  type FeaturedObject,
  type ObjectSpec,
  type TypeTemplate,
} from './object-generator';
import { Rng } from './rng';

/* ───────────────────────── Ma’lumot fayllari ───────────────────────── */

const DATA_DIR = join(__dirname, 'data');
const readJson = <T>(file: string): T =>
  JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as T;

interface GeoFeature {
  properties: {
    code: string;
    name: string;
    shortName: string;
    soato: string | null;
    kind: 'district' | 'city';
    centerLat: number;
    centerLng: number;
  };
  geometry: Record<string, unknown>;
}

interface CatalogRow {
  code: string;
  name: string;
  color: string;
  icon?: string;
  sortOrder: number;
}

interface SeedUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  position?: string;
  phone?: string;
  role: UserRole;
  scope?: 'region' | 'district';
  districtCode?: string;
  contractorInn?: string;
}

/**
 * ⚠️ Jadvallar BOG‘LANISH TARTIBIDA tozalanadi.
 * `TRUNCATE ... CASCADE` bitta buyruqda bajariladi: alohida-alohida
 * o‘chirilsa, tashqi kalitlar tartibini qo‘lda kuzatib borish kerak
 * bo‘lardi va yangi jadval qo‘shilganda u esdan chiqardi.
 */
const TABLES = [
  'ai_analyses',
  'notifications',
  'audit_logs',
  'photo_report_images',
  'photo_reports',
  'object_documents',
  'funding_transactions',
  'funding_allocations',
  'object_delays',
  'object_progress_updates',
  'object_milestones',
  'construction_objects',
  'refresh_tokens',
  'files',
  'users',
  'contractors',
  'customers',
  'delay_reasons',
  'funding_sources',
  'construction_types',
  'districts',
  'regions',
  'app_settings',
];

async function main(): Promise<void> {
  const startedAt = Date.now();
  const dataSource: DataSource = await AppDataSource.initialize();
  const rng = new Rng(20261030);
  const today = tashkentToday();

  console.log('\n🌱 Seed boshlandi\n' + '─'.repeat(64));

  try {
    await dataSource.transaction(async (em) => {
      await truncateAll(em);

      const { region, districts } = await seedGeo(em);
      const catalogs = await seedCatalogs(em);
      const customers = await seedCustomers(em);
      const contractors = await seedContractors(em);
      const users = await seedUsers(em, region, districts, contractors);

      const specs = buildSpecs(rng, today, districts);
      const objects = await seedObjects(em, rng, today, specs, {
        region,
        districts,
        catalogs,
        customers,
        contractors,
        users,
      });

      await seedMilestones(em, rng, today, objects, specs);
      await seedProgressHistory(em, rng, today, objects, specs, users);
      await seedDelays(
        em,
        rng,
        today,
        objects,
        specs,
        catalogs.delayReasons,
        users,
      );
      await applyHealth(em, objects);
      await seedFunding(
        em,
        rng,
        today,
        objects,
        catalogs.fundingSources,
        specs,
        users,
      );
      await seedPhotoReports(em, rng, today, objects, specs, users);
      await seedDocuments(em, rng, today, objects, users);
      await seedAiAnalyses(em, today, objects);
      await seedNotifications(em, objects, users, today);
      await seedSettings(em);
      await recalculateContractorRatings(em);
    });

    await report(dataSource, startedAt);
  } finally {
    await dataSource.destroy();
  }
}

/* ───────────────────────── 0. Tozalash ───────────────────────── */

async function truncateAll(em: EntityManager): Promise<void> {
  await em.query(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
  console.log(`🧹 ${TABLES.length} ta jadval tozalandi`);
}

/* ───────────────────────── 1. Geografiya ───────────────────────── */

async function seedGeo(
  em: EntityManager,
): Promise<{ region: Region; districts: Map<string, District> }> {
  const geo = readJson<{ bbox: number[]; features: GeoFeature[] }>(
    'andijon-districts.geojson',
  );

  const region = await em.save(
    em.create(Region, {
      code: 'andijon',
      name: 'Andijon viloyati',
      soato: '1703',
      centerLat: 40.7821,
      centerLng: 72.3442,
      defaultZoom: 9,
      bbox: geo.bbox,
      isActive: true,
    }),
  );

  const rows = geo.features.map((f) =>
    em.create(District, {
      code: f.properties.code,
      name: f.properties.name,
      shortName: f.properties.shortName,
      soato: f.properties.soato,
      kind: f.properties.kind,
      centerLat: f.properties.centerLat,
      centerLng: f.properties.centerLng,
      geometry: f.geometry,
      regionId: region.id,
      isActive: true,
    }),
  );

  const saved = await em.save(rows);
  console.log(`🗺️  Viloyat va ${saved.length} ta tuman/shahar qo‘shildi`);
  return { region, districts: new Map(saved.map((d) => [d.code, d])) };
}

/* ───────────────────────── 2. Kataloglar ───────────────────────── */

interface Catalogs {
  types: Map<string, ConstructionType>;
  fundingSources: Map<string, FundingSource>;
  delayReasons: Map<string, DelayReason>;
}

async function seedCatalogs(em: EntityManager): Promise<Catalogs> {
  const types = await em.save(
    readJson<CatalogRow[]>('construction-types.json').map((r) =>
      em.create(ConstructionType, {
        ...r,
        icon: r.icon ?? null,
        isActive: true,
      }),
    ),
  );
  const sources = await em.save(
    readJson<CatalogRow[]>('funding-sources.json').map((r) =>
      em.create(FundingSource, { ...r, isActive: true }),
    ),
  );
  const reasons = await em.save(
    readJson<CatalogRow[]>('delay-reasons.json').map((r) =>
      em.create(DelayReason, { ...r, icon: r.icon ?? null, isActive: true }),
    ),
  );

  console.log(
    `📚 Kataloglar: ${types.length} tur, ${sources.length} manba, ${reasons.length} sabab`,
  );
  return {
    types: new Map(types.map((t) => [t.code, t])),
    fundingSources: new Map(sources.map((s) => [s.code, s])),
    delayReasons: new Map(reasons.map((r) => [r.code, r])),
  };
}

/* ───────────────────────── 3. Tashkilotlar ───────────────────────── */

async function seedCustomers(em: EntityManager): Promise<Customer[]> {
  const rows = readJson<Array<Partial<Customer>>>('customers.json');
  const saved = await em.save(
    rows.map((r) => em.create(Customer, { ...r, isActive: true })),
  );
  console.log(`🏛️  ${saved.length} ta buyurtmachi qo‘shildi`);
  return saved;
}

async function seedContractors(em: EntityManager): Promise<Contractor[]> {
  const rows = readJson<Array<Partial<Contractor>>>('contractors.json');
  const saved = await em.save(
    rows.map((r) =>
      em.create(Contractor, {
        ...r,
        status: ContractorStatus.ACTIVE,
        rating: 0,
      }),
    ),
  );
  console.log(`🏗️  ${saved.length} ta pudratchi qo‘shildi`);
  return saved;
}

/* ───────────────────────── 4. Foydalanuvchilar ───────────────────────── */

async function seedUsers(
  em: EntityManager,
  region: Region,
  districts: Map<string, District>,
  contractors: Contractor[],
): Promise<User[]> {
  const rows = readJson<SeedUser[]>('users.json');
  const byInn = new Map(contractors.map((c) => [c.inn, c]));

  const users = await Promise.all(
    rows.map(async (r) =>
      em.create(User, {
        email: r.email,
        passwordHash: await hash(r.password, 10),
        firstName: r.firstName,
        lastName: r.lastName,
        middleName: r.middleName ?? null,
        position: r.position ?? null,
        phone: r.phone ?? null,
        role: r.role,
        isActive: true,
        regionId:
          r.role === UserRole.SUPER_ADMIN || r.role === UserRole.CONTRACTOR
            ? null
            : region.id,
        districtId: r.districtCode
          ? (districts.get(r.districtCode)?.id ?? null)
          : null,
        contractorId: r.contractorInn
          ? (byInn.get(r.contractorInn)?.id ?? null)
          : null,
      }),
    ),
  );

  const saved = await em.save(users);
  console.log(
    `👥 ${saved.length} ta foydalanuvchi qo‘shildi (parollar bcrypt bilan xeshlangan)`,
  );
  return saved;
}

/* ───────────────────────── 5. Obyektlar ───────────────────────── */

function buildSpecs(
  rng: Rng,
  today: Date,
  districts: Map<string, District>,
): ObjectSpec[] {
  const distribution = readJson<DistributionData>('distribution.json');
  const templates = readJson<Record<string, TypeTemplate>>(
    'object-templates.json',
  );
  const featured = readJson<{ objects: FeaturedObject[] }>(
    'featured-objects.json',
  ).objects;

  const refs = new Map<string, DistrictRef>(
    [...districts.values()].map((d) => [
      d.code,
      {
        code: d.code,
        shortName: d.shortName,
        centerLat: d.centerLat,
        centerLng: d.centerLng,
      },
    ]),
  );

  const cleanTemplates = Object.fromEntries(
    Object.entries(templates).filter(([k]) => !k.startsWith('_')),
  ) as Record<string, TypeTemplate>;

  return new ObjectGenerator(rng, today, cleanTemplates, refs).generate(
    distribution,
    featured,
  );
}

interface SeedRefs {
  region: Region;
  districts: Map<string, District>;
  catalogs: Catalogs;
  customers: Customer[];
  contractors: Contractor[];
  users: User[];
}

async function seedObjects(
  em: EntityManager,
  rng: Rng,
  today: Date,
  specs: ObjectSpec[],
  refs: SeedRefs,
): Promise<ConstructionObject[]> {
  const supervisors = refs.users.filter((u) => u.role === UserRole.SUPERVISOR);
  const counters = new Map<string, number>();

  const rows = specs.map((spec) => {
    const district = refs.districts.get(spec.districtCode)!;
    const year = Number(spec.plannedStartDate.slice(0, 4));
    const prefix = `AND-${year}`;
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);

    return em.create(ConstructionObject, {
      code: `${prefix}-${String(next).padStart(4, '0')}`,
      name: spec.name,
      description: `${spec.name} — Andijon viloyati qurilish dasturi doirasida amalga oshirilmoqda.`,
      address: spec.address,
      lat: spec.lat,
      lng: spec.lng,
      districtId: district.id,
      regionId: refs.region.id,
      typeId: refs.catalogs.types.get(spec.typeCode)!.id,
      customerId: rng.pick(refs.customers).id,
      contractorId:
        spec.status === ObjectStatus.NOT_STARTED && rng.bool(0.3)
          ? null
          : rng.pick(refs.contractors).id,
      responsibleId: supervisors.length ? rng.pick(supervisors).id : null,
      fundingSourceId: refs.catalogs.fundingSources.get(spec.fundingSourceCode)!
        .id,
      totalCost: spec.totalCost,
      fundedAmount: '0',
      paidAmount: '0',
      capacity: spec.capacity,
      capacityUnit: spec.capacityUnit,
      areaM2: spec.areaM2,
      floors: spec.floors,
      plannedStartDate: spec.plannedStartDate,
      plannedEndDate: spec.plannedEndDate,
      actualStartDate: spec.actualStartDate,
      actualEndDate: spec.actualEndDate,
      status: spec.status,
      progressPercent: spec.progressPercent,
      healthStatus: ObjectHealth.NOT_STARTED,
      lastReportAt:
        spec.status === ObjectStatus.IN_PROGRESS
          ? addDays(today, -rng.int(1, 40))
          : null,
    });
  });

  const saved = await em.save(rows, { chunk: 100 });
  console.log(`🏢 ${saved.length} ta obyekt qo‘shildi`);
  return saved;
}

/* ───────────────────────── 6. Bosqichlar (ish rejasi) ───────────────────────── */

/** Bosqich shablonlari — ulushlar yig‘indisi ANIQ 100 bo‘lishi shart. */
const MILESTONE_TEMPLATE: Array<{ name: string; weight: number }> = [
  { name: 'Loyiha-smeta hujjatlari va ekspertiza', weight: 8 },
  { name: 'Hudud tayyorlash va poydevor ishlari', weight: 17 },
  { name: 'Karkas va devor ishlari', weight: 25 },
  { name: 'Tom yopish va fasad ishlari', weight: 18 },
  { name: 'Muhandislik tarmoqlari', weight: 15 },
  { name: 'Ichki pardozlash ishlari', weight: 12 },
  { name: 'Obodonlashtirish va topshirish', weight: 5 },
];

async function seedMilestones(
  em: EntityManager,
  rng: Rng,
  today: Date,
  objects: ConstructionObject[],
  specs: ObjectSpec[],
): Promise<void> {
  const rows: ObjectMilestone[] = [];

  objects.forEach((object, index) => {
    const spec = specs[index];
    const start = new Date(`${spec.plannedStartDate}T00:00:00Z`);
    const totalDays = Math.max(
      30,
      diffInDays(spec.plannedStartDate, spec.plannedEndDate) ?? 365,
    );

    let cursorWeight = 0;
    MILESTONE_TEMPLATE.forEach((template, order) => {
      const from = Math.round((cursorWeight / 100) * totalDays);
      cursorWeight += template.weight;
      const to = Math.round((cursorWeight / 100) * totalDays);

      const plannedStart = addDays(start, from);
      const plannedEnd = addDays(start, Math.max(from + 5, to));

      // Bosqich bajarilishi obyektning umumiy foizidan KELIB CHIQADI:
      // ulushlar bo‘yicha to‘plangan foiz obyekt foizidan oshsa, bosqich
      // qisman bajarilgan bo‘ladi. Shu tufayli ikkala raqam mos keladi.
      const completedBefore = cursorWeight - template.weight;
      const progress = clampPercent(
        ((spec.progressPercent - completedBefore) / template.weight) * 100,
      );

      const status = resolveMilestoneStatus(progress, plannedEnd, today);
      rows.push(
        em.create(ObjectMilestone, {
          objectId: object.id,
          name: template.name,
          plannedStart: toDateKey(plannedStart)!,
          plannedEnd: toDateKey(plannedEnd)!,
          actualStart:
            progress > 0
              ? toDateKey(addDays(plannedStart, rng.int(-3, 12)))!
              : null,
          actualEnd:
            progress >= 100
              ? toDateKey(addDays(plannedEnd, rng.int(-6, 14)))!
              : null,
          progressPercent: progress,
          weight: template.weight,
          status,
          sortOrder: order,
        }),
      );
    });
  });

  await em.save(rows, { chunk: 500 });
  console.log(`📅 ${rows.length} ta bosqich (ish rejasi) qo‘shildi`);
}

function clampPercent(value: number): number {
  return Number(Math.max(0, Math.min(100, value)).toFixed(2));
}

function resolveMilestoneStatus(
  progress: number,
  plannedEnd: Date,
  today: Date,
): MilestoneStatus {
  if (progress >= 100) return MilestoneStatus.DONE;
  if (plannedEnd < today) return MilestoneStatus.DELAYED;
  if (progress > 0) return MilestoneStatus.IN_PROGRESS;
  return MilestoneStatus.PLANNED;
}

/* ───────────────────────── 7. Bajarilish tarixi ───────────────────────── */

async function seedProgressHistory(
  em: EntityManager,
  rng: Rng,
  today: Date,
  objects: ConstructionObject[],
  specs: ObjectSpec[],
  users: User[],
): Promise<void> {
  const supervisors = users.filter((u) => u.role === UserRole.SUPERVISOR);
  const rows: ObjectProgressUpdate[] = [];

  objects.forEach((object, index) => {
    const spec = specs[index];
    if (spec.progressPercent <= 0) return;

    // Oxirgi 10 oy, oyiga bitta yozuv. ⚠️ Oxirgi yozuv AYNAN obyektdagi
    // foizga teng bo‘lishi shart: aks holda grafikdagi oxirgi nuqta
    // kartadagi raqamdan farq qilib qolardi.
    const points = rng.int(5, 10);
    let previous = 0;

    for (let i = points; i >= 1; i -= 1) {
      const reportDate = addDays(today, -(i * 28 + rng.int(0, 6)));
      if (reportDate < new Date(`${spec.plannedStartDate}T00:00:00Z`)) continue;

      const ratio = (points - i + 1) / points;
      // Qurilish S-egri chizig‘i: boshida va oxirida sekin, o‘rtada tez.
      const eased = ratio * ratio * (3 - 2 * ratio);
      const value =
        i === 1
          ? spec.progressPercent
          : clampPercent(spec.progressPercent * eased + rng.float(-1.5, 1.5));

      if (value < previous) continue;

      rows.push(
        em.create(ObjectProgressUpdate, {
          objectId: object.id,
          reportDate: toDateKey(reportDate)!,
          progressPercent: value,
          previousPercent: previous,
          note: i === 1 ? 'Joriy holat bo‘yicha oxirgi yangilanish.' : null,
          source: rng.bool(0.35)
            ? ProgressSource.PHOTO_REPORT
            : ProgressSource.MANUAL,
          authorId: supervisors.length ? rng.pick(supervisors).id : null,
        }),
      );
      previous = value;
    }
  });

  await em.save(rows, { chunk: 500 });
  console.log(`📈 ${rows.length} ta bajarilish yozuvi qo‘shildi`);
}

/* ───────────────────────── 8. Kechikishlar ───────────────────────── */

/**
 * ⚠️ Kechikish yozuvlari FAQAT kechikayotgan va xavfli obyektlarga beriladi,
 * «reja asosida» ketayotganiga esa berilmaydi: aks holda dashboard'dagi
 * «asosiy sabablar» diagrammasi holat kartalariga zid chiqardi.
 *
 * Yana bir cheklov: `delayed` obyektda ochiq yozuv 2 tadan oshmaydi —
 * uchtadan boshlab holat formulasi uni `at_risk` ga ko‘taradi (eskalatsiya).
 */
async function seedDelays(
  em: EntityManager,
  rng: Rng,
  today: Date,
  objects: ConstructionObject[],
  specs: ObjectSpec[],
  reasons: Map<string, DelayReason>,
  users: User[],
): Promise<void> {
  const distribution = readJson<DistributionData>('distribution.json');
  const supervisors = users.filter((u) => u.role === UserRole.SUPERVISOR);

  // 1) Sabablar hovuzi: har bir sabab kerakli sondagi «chipta» beradi.
  const pool: string[] = [];
  for (const [code, count] of Object.entries(
    distribution.delayRecordsByReason,
  )) {
    for (let i = 0; i < count; i += 1) pool.push(code);
  }

  const rows: ObjectDelay[] = [];
  const used = new Map<string, Set<string>>();

  const take = (objectId: string): string | null => {
    const taken = used.get(objectId) ?? new Set<string>();
    // Bitta obyektda bitta sabab IKKI MARTA ochiq bo‘lmaydi —
    // servis ham aynan shu cheklovni qo‘yadi.
    const at = pool.findIndex((code) => !taken.has(code));
    if (at === -1) return null;
    const [code] = pool.splice(at, 1);
    taken.add(code);
    used.set(objectId, taken);
    return code;
  };

  const push = (
    object: ConstructionObject,
    spec: ObjectSpec,
    code: string,
  ): void => {
    const reason = reasons.get(code);
    if (!reason) return;
    const detected = addDays(today, -rng.int(10, 180));
    rows.push(
      em.create(ObjectDelay, {
        objectId: object.id,
        reasonId: reason.id,
        delayDays: rng.int(
          8,
          Math.max(12, Math.round(spec.progressPercent / 2)),
        ),
        severity:
          spec.targetHealth === ObjectHealth.AT_RISK
            ? RiskLevel.HIGH
            : RiskLevel.MEDIUM,
        status: rng.bool(0.25) ? DelayStatus.MITIGATING : DelayStatus.OPEN,
        description:
          DELAY_DESCRIPTIONS[code] ?? 'Qurilish jarayonida muammo aniqlandi.',
        mitigationPlan: rng.bool(0.6) ? (MITIGATION_PLANS[code] ?? null) : null,
        detectedAt: toDateKey(detected)!,
        resolvedAt: null,
        responsibleId: supervisors.length ? rng.pick(supervisors).id : null,
      }),
    );
  };

  // 2) Maketdagi aniq sabablar — birinchi navbatda.
  objects.forEach((object, index) => {
    const spec = specs[index];
    for (const code of spec.delayReasonCodes) {
      const at = pool.indexOf(code);
      if (at !== -1) pool.splice(at, 1);
      const taken = used.get(object.id) ?? new Set<string>();
      taken.add(code);
      used.set(object.id, taken);
      push(object, spec, code);
    }
  });

  // 3) Qolganlari: avval `delayed` (2 tagacha), keyin `at_risk` (5 tagacha).
  const byHealth = (
    health: ObjectHealth,
  ): Array<[ConstructionObject, ObjectSpec]> =>
    objects
      .map((o, i) => [o, specs[i]] as [ConstructionObject, ObjectSpec])
      .filter(([, s]) => s.targetHealth === health);

  for (const limit of [1, 2, 3, 4, 5]) {
    for (const health of [ObjectHealth.DELAYED, ObjectHealth.AT_RISK]) {
      const cap = health === ObjectHealth.DELAYED ? 2 : 5;
      if (limit > cap) continue;

      for (const [object, spec] of byHealth(health)) {
        if (pool.length === 0) break;
        if ((used.get(object.id)?.size ?? 0) >= limit) continue;
        const code = take(object.id);
        if (code) push(object, spec, code);
      }
    }
  }

  // 4) Hal qilingan yozuvlar — tarix uchun (ochiq hisoblagichga KIRMAYDI).
  const completed = objects.filter((o) => o.status === ObjectStatus.COMPLETED);
  for (const object of completed.slice(0, 14)) {
    const code = rng.pick([...reasons.keys()]);
    const detected = addDays(today, -rng.int(200, 600));
    rows.push(
      em.create(ObjectDelay, {
        objectId: object.id,
        reasonId: reasons.get(code)!.id,
        delayDays: rng.int(5, 40),
        severity: RiskLevel.MEDIUM,
        status: DelayStatus.RESOLVED,
        description:
          DELAY_DESCRIPTIONS[code] ?? 'Qurilish jarayonida muammo aniqlandi.',
        mitigationPlan:
          'Hal qilindi: muammo bartaraf etilib, ish davom ettirildi.',
        detectedAt: toDateKey(detected)!,
        resolvedAt: toDateKey(addDays(detected, rng.int(10, 90)))!,
        responsibleId: supervisors.length ? rng.pick(supervisors).id : null,
      }),
    );
  }

  await em.save(rows, { chunk: 300 });
  const open = rows.filter((r) => r.status !== DelayStatus.RESOLVED).length;
  console.log(
    `⚠️  ${rows.length} ta kechikish yozuvi (${open} tasi ochiq) qo‘shildi`,
  );
  if (pool.length > 0) {
    console.warn(
      `   ⚠️  ${pool.length} ta sabab taqsimlanmadi — obyektlar sig‘imi yetmadi`,
    );
  }
}

const DELAY_DESCRIPTIONS: Record<string, string> = {
  funding:
    'Ajratilgan mablag‘ o‘z vaqtida kelib tushmadi, ish hajmi kamaytirildi.',
  materials: 'Metall konstruksiya va sement yetkazib berish kechikmoqda.',
  contractor:
    'Pudratchining texnika va ishchi kuchi hajmi reja talabidan past.',
  weather:
    'Uzoq davom etgan yog‘ingarchilik tufayli ochiq maydondagi ishlar to‘xtatildi.',
  documents:
    'Loyihaga o‘zgartirish kiritildi, qayta ekspertizadan o‘tkazilmoqda.',
  other: 'Yer uchastkasi masalasi hal qilinmagani sababli ish sekinlashdi.',
};

const MITIGATION_PLANS: Record<string, string> = {
  funding:
    'Viloyat moliya boshqarmasiga murojaat yuborildi, mablag‘ keyingi chorakda rejalashtirildi.',
  materials: 'Muqobil yetkazib beruvchi bilan shartnoma tayyorlanmoqda.',
  contractor: 'Qo‘shimcha ishchi brigada va texnika jalb qilinmoqda.',
  weather:
    'Ish grafigi qayta ko‘rib chiqildi, ichki ishlarga ustuvorlik berildi.',
  documents:
    'Ekspertiza natijasi kutilmoqda, hujjatlar shoshilinch tartibda ko‘rib chiqilmoqda.',
  other: 'Tuman hokimligi bilan birgalikda masala hal qilinmoqda.',
};

/* ───────────────────────── 9. Holatni hisoblash ───────────────────────── */

/**
 * ⚠️ Holat QO‘LDA YOZILMAYDI — u `evaluateObjectHealth()` dan keladi,
 * ya’ni ilovaning o‘zi ishlatadigan AYNI formuladan. Seed boshqa formula
 * ishlatganda, birinchi tungi passdayoq hamma raqam o‘zgarib ketardi.
 */
async function applyHealth(
  em: EntityManager,
  objects: ConstructionObject[],
): Promise<void> {
  const delayCounts = await em
    .getRepository(ObjectDelay)
    .createQueryBuilder('d')
    .select('d.object_id', 'objectId')
    .addSelect('COUNT(*)', 'openCount')
    .addSelect(
      `(ARRAY_AGG(d.reason_id ORDER BY d.delay_days DESC, d.detected_at ASC))[1]`,
      'primaryReasonId',
    )
    .where('d.status != :resolved', { resolved: DelayStatus.RESOLVED })
    .groupBy('d.object_id')
    .getRawMany<{
      objectId: string;
      openCount: string;
      primaryReasonId: string;
    }>();

  const byObject = new Map(delayCounts.map((r) => [r.objectId, r]));

  for (const object of objects) {
    const stats = byObject.get(object.id);
    const openDelayCount = Number(stats?.openCount ?? 0);
    const result = evaluateObjectHealth({
      status: object.status,
      progressPercent: object.progressPercent,
      plannedStartDate: object.plannedStartDate,
      plannedEndDate: object.plannedEndDate,
      actualStartDate: object.actualStartDate,
      actualEndDate: object.actualEndDate,
      openDelayCount,
    });

    await em.update(
      ConstructionObject,
      { id: object.id },
      {
        healthStatus: result.health,
        delayDays: result.delayDays,
        expectedProgress: result.expectedProgress,
        progressGap: result.progressGap,
        riskLevel: result.riskLevel,
        riskScore: result.riskScore,
        openDelayCount,
        primaryDelayReasonId: stats?.primaryReasonId ?? null,
        healthCalculatedAt: new Date(),
      },
    );

    object.healthStatus = result.health;
    object.delayDays = result.delayDays;
    object.expectedProgress = result.expectedProgress;
    object.riskLevel = result.riskLevel;
    object.riskScore = result.riskScore;
    object.openDelayCount = openDelayCount;
  }

  console.log(`🧮 ${objects.length} ta obyekt holati hisoblandi`);
}

/* ───────────────────────── 10. Moliyalashtirish ───────────────────────── */

/**
 * Avval DAFTAR (`funding_transactions`) yoziladi, keyin yillik rejalar va
 * obyekt yig‘indilari AYNAN shu daftardan qayta hisoblanadi — ilovadagi
 * `FundingService.recomputeFromLedger()` bilan bir xil SQL.
 * Shu tufayli seed'dan keyin invariant («yig‘indi = daftar») buzilmaydi.
 */
async function seedFunding(
  em: EntityManager,
  rng: Rng,
  today: Date,
  objects: ConstructionObject[],
  sources: Map<string, FundingSource>,
  specs: ObjectSpec[],
  users: User[],
): Promise<void> {
  const financeUsers = users.filter((u) => u.role === UserRole.REGION_ADMIN);
  const allocations: FundingAllocation[] = [];
  const transactions: FundingTransaction[] = [];

  objects.forEach((object, index) => {
    const spec = specs[index];
    const source = sources.get(spec.fundingSourceCode)!;
    const totalCost = Number(object.totalCost);

    const startYear = Number(object.plannedStartDate.slice(0, 4));
    const endYear = Number(object.plannedEndDate.slice(0, 4));
    const years = Array.from(
      { length: endYear - startYear + 1 },
      (_, i) => startYear + i,
    );

    // Reja yillar bo‘yicha teng emas: o‘rtadagi yillarga ko‘proq tushadi.
    const weights = years.map((_, i) =>
      i === 0 || i === years.length - 1 ? 1 : 1.6,
    );
    const weightSum = weights.reduce((a, b) => a + b, 0);

    years.forEach((year, i) => {
      const planned =
        Math.round((totalCost * weights[i]) / weightSum / 1_000_000) *
        1_000_000;
      const allocation = em.create(FundingAllocation, {
        objectId: object.id,
        sourceId: source.id,
        year,
        plannedAmount: planned.toFixed(2),
        allocatedAmount: '0',
        paidAmount: '0',
        note: null,
      });
      allocations.push(allocation);
    });
  });

  const savedAllocations = await em.save(allocations, { chunk: 300 });

  // Daftar qatorlari: o‘tgan va joriy yil uchun — bajarilishga mutanosib.
  const byObjectYear = new Map<string, FundingAllocation>();
  for (const a of savedAllocations)
    byObjectYear.set(`${a.objectId}:${a.year}`, a);
  const currentYear = today.getUTCFullYear();

  objects.forEach((object, index) => {
    const spec = specs[index];
    const progressRatio = spec.progressPercent / 100;
    const startYear = Number(object.plannedStartDate.slice(0, 4));

    for (let year = startYear; year <= currentYear; year += 1) {
      const allocation = byObjectYear.get(`${object.id}:${year}`);
      if (!allocation) continue;

      const planned = Number(allocation.plannedAmount);
      // Ajratish rejaning 70–100% i, to‘lov esa ajratilganning 60–100% i.
      const allocated =
        Math.round((planned * rng.float(0.7, 1, 3)) / 1_000_000) * 1_000_000;
      if (allocated <= 0) continue;

      transactions.push(
        em.create(FundingTransaction, {
          objectId: object.id,
          allocationId: allocation.id,
          type: FundingTxType.ALLOCATION,
          amount: allocated.toFixed(2),
          occurredAt: toDateKey(
            new Date(Date.UTC(year, rng.int(0, 5), rng.int(1, 28))),
          )!,
          documentNumber: `№ ${rng.int(100, 999)}-${year}`,
          note: `${year}-yil uchun mablag‘ ajratildi`,
          createdById: financeUsers.length ? rng.pick(financeUsers).id : null,
        }),
      );

      const paid =
        Math.round(
          (allocated * Math.min(1, progressRatio + rng.float(-0.1, 0.12, 3))) /
            1_000_000,
        ) * 1_000_000;
      if (paid > 0) {
        transactions.push(
          em.create(FundingTransaction, {
            objectId: object.id,
            allocationId: allocation.id,
            type: FundingTxType.PAYMENT,
            amount: paid.toFixed(2),
            occurredAt: toDateKey(
              new Date(Date.UTC(year, rng.int(6, 11), rng.int(1, 28))),
            )!,
            documentNumber: `№ ${rng.int(100, 999)}-T`,
            note: 'Bajarilgan ishlar uchun to‘lov',
            createdById: financeUsers.length ? rng.pick(financeUsers).id : null,
          }),
        );
      }
    }
  });

  await em.save(transactions, { chunk: 400 });

  // ⚠️ Yig‘indilar ilovadagi AYNI SQL bilan qayta hisoblanadi.
  await em.query(
    `UPDATE funding_allocations a
        SET allocated_amount = COALESCE(t.allocated, 0), paid_amount = COALESCE(t.paid, 0)
       FROM (
            SELECT allocation_id,
                   SUM(amount) FILTER (WHERE type IN ('allocation','adjustment')) AS allocated,
                   SUM(amount) FILTER (WHERE type = 'payment')                    AS paid
              FROM funding_transactions
             WHERE allocation_id IS NOT NULL AND deleted_at IS NULL
             GROUP BY allocation_id
       ) t
      WHERE a.id = t.allocation_id`,
  );
  await em.query(
    `UPDATE construction_objects o
        SET funded_amount = COALESCE(t.allocated, 0), paid_amount = COALESCE(t.paid, 0)
       FROM (
            SELECT object_id,
                   SUM(amount) FILTER (WHERE type IN ('allocation','adjustment')) AS allocated,
                   SUM(amount) FILTER (WHERE type = 'payment')                    AS paid
              FROM funding_transactions
             WHERE deleted_at IS NULL
             GROUP BY object_id
       ) t
      WHERE o.id = t.object_id`,
  );

  console.log(
    `💰 ${savedAllocations.length} ta yillik reja, ${transactions.length} ta moliyaviy harakat qo‘shildi`,
  );
}

/* ───────────────────────── 11. Foto-hisobotlar ───────────────────────── */

async function seedPhotoReports(
  em: EntityManager,
  rng: Rng,
  today: Date,
  objects: ConstructionObject[],
  specs: ObjectSpec[],
  users: User[],
): Promise<void> {
  const featured = readJson<{
    photoReports: Array<{
      objectKey: string;
      capturedAt: string;
      progressPercent: number;
      note: string;
    }>;
  }>('featured-objects.json').photoReports;

  // ⚠️ Suratlar DISKKA emas, obyekt xotirasiga (DigitalOcean Spaces)
  // yoziladi — ilovada lokal `uploads/` papkasi umuman yo‘q.
  const seedStorage = new SeedStorage();
  const removed = await seedStorage.clearSeedObjects();
  if (removed > 0) {
    console.log(`  🧹 Avvalgi seed suratlari o‘chirildi: ${removed} ta`);
  }

  const authors = users.filter(
    (u) => u.role === UserRole.SUPERVISOR || u.role === UserRole.DISTRICT_ADMIN,
  );
  const moderators = users.filter((u) => u.role === UserRole.REGION_ADMIN);
  const byKey = new Map<string, ConstructionObject>();
  specs.forEach((spec, i) => {
    if (spec.key) byKey.set(spec.key, objects[i]);
  });

  const pendingUploads: Array<{
    png: Buffer;
    originalName: string;
    authorId: string | null;
  }> = [];
  const reports: PhotoReport[] = [];
  const images: Array<{
    reportIndex: number;
    fileIndex: number;
    order: number;
  }> = [];

  const addReport = (
    object: ConstructionObject,
    capturedAt: Date,
    progress: number,
    note: string,
    shotCount: number,
  ): void => {
    const reportIndex = reports.length;
    const author = authors.length ? rng.pick(authors) : null;

    // ⚠️ Avtomatik tekshiruv natijasi SOXTA QO‘YILMAYDI — demo ma’lumot ham
    // haqiqiy qoidalardan o‘tishi kerak, aks holda «AI tasdiqladi» yozuvi
    // hech narsani anglatmasdi. Shuning uchun koordinata obyektnikiga
    // yaqin, sana esa yaqin o‘tmishda beriladi.
    reports.push(
      em.create(PhotoReport, {
        objectId: object.id,
        capturedAt,
        lat: Number(
          ((object.lat ?? 0) + rng.float(-0.0008, 0.0008, 6)).toFixed(6),
        ),
        lng: Number(
          ((object.lng ?? 0) + rng.float(-0.0008, 0.0008, 6)).toFixed(6),
        ),
        progressPercent: progress,
        note,
        status: PhotoReportStatus.PENDING,
        aiVerdict: AiVerdict.PENDING,
        authorId: author?.id ?? null,
      }),
    );

    for (let shot = 0; shot < shotCount; shot += 1) {
      // ⚠️ Shu yerda YUKLANMAYDI: har surat uchun alohida so‘rov yuborilsa,
      // 800 ta ketma-ket so‘rov seedni daqiqalarga cho‘zardi. Buferlar
      // yig‘iladi va oxirida cheklangan parallellik bilan yuboriladi.
      pendingUploads.push({
        png: buildPlaceholderPng({
          title: object.name,
          subtitle: `${toDateKey(capturedAt)} · ${object.code}`,
          progressPercent: progress,
          variant: reportIndex + shot,
        }),
        originalName: `${object.code}-${shot + 1}.png`,
        authorId: author?.id ?? null,
      });
      images.push({
        reportIndex,
        fileIndex: pendingUploads.length - 1,
        order: shot,
      });
    }
  };

  // 1) Maketdagi aniq foto-hisobotlar.
  for (const f of featured) {
    const object = byKey.get(f.objectKey);
    if (!object) continue;
    addReport(object, new Date(f.capturedAt), f.progressPercent, f.note, 2);
  }

  // 2) Qolgan faol obyektlar uchun tarix.
  const active = objects.filter((o) => o.status === ObjectStatus.IN_PROGRESS);
  for (const object of active) {
    if (
      byKey.size &&
      [...byKey.values()].some((o) => o.id === object.id) &&
      rng.bool(0.5)
    )
      continue;
    const count = rng.int(1, 3);
    for (let i = 0; i < count; i += 1) {
      // ⚠️ Kamida 5 kun oldin: maketdagi uchta nomli hisobot (29/28/27-oktabr)
      // «So‘nggi foto-hisobotlar» ro‘yxatining boshida turishi kerak.
      // Vaqt ham qo‘shiladi — yarim tun soxta ko‘rinadi, surat ish vaqtida olinadi.
      const daysAgo = 5 + i * rng.int(16, 38) + rng.int(0, 9);
      const capturedAt = addDays(today, -daysAgo);
      capturedAt.setUTCHours(rng.int(4, 13), rng.int(0, 59), 0, 0);
      const progress = clampPercent(
        object.progressPercent - i * rng.float(2, 7),
      );
      addReport(
        object,
        capturedAt,
        progress,
        PHOTO_NOTES[rng.int(0, PHOTO_NOTES.length - 1)],
        rng.int(1, 3),
      );
    }
  }

  console.log(
    `  ☁️  Spaces'ga yuklanmoqda: ${pendingUploads.length} ta surat…`,
  );
  const uploaded = await seedStorage.putMany(
    pendingUploads,
    (item) => ({ body: item.png, contentType: 'image/png', ext: '.png' }),
    12,
    (done, total) => {
      if (done < total) process.stdout.write(`\r     ${done}/${total}`);
      else process.stdout.write(`\r     ${total}/${total} ✓\n`);
    },
  );

  const files: StoredFile[] = pendingUploads.map((item, index) =>
    em.create(StoredFile, {
      originalName: item.originalName,
      storedName: uploaded[index].key.split('/').pop()!,
      mimeType: 'image/png',
      size: String(uploaded[index].size),
      path: uploaded[index].key,
      url: uploaded[index].url,
      uploadedById: item.authorId,
    }),
  );

  const savedFiles = await em.save(files, { chunk: 300 });
  const savedReports = await em.save(reports, { chunk: 300 });

  await em.save(
    images.map((img) =>
      em.create(PhotoReportImage, {
        reportId: savedReports[img.reportIndex].id,
        fileId: savedFiles[img.fileIndex].id,
        url: savedFiles[img.fileIndex].url,
        sortOrder: img.order,
      }),
    ),
    { chunk: 500 },
  );

  // 3) Tekshiruv va moderatsiya — haqiqiy dvigatel orqali.
  for (const report of savedReports) {
    const object = objects.find((o) => o.id === report.objectId)!;
    const verification = verifyPhotoReport({
      capturedAt: report.capturedAt,
      uploadedAt: addDays(report.capturedAt, rng.int(0, 2)),
      photoLat: report.lat,
      photoLng: report.lng,
      objectLat: object.lat,
      objectLng: object.lng,
      reportedProgress: report.progressPercent,
      previousProgress: Math.max(0, report.progressPercent - rng.float(2, 8)),
      daysSincePrevious: rng.int(20, 45),
    });

    const approved =
      verification.verdict !== AiVerdict.REJECTED && rng.bool(0.85);
    await em.update(
      PhotoReport,
      { id: report.id },
      {
        aiVerdict: verification.verdict,
        aiConfidence: verification.confidence,
        aiComment: verification.comment,
        aiCheckedAt: addDays(report.capturedAt, 1),
        /*
         * ⚠️ Demo hisobotlar AI NAVBATIGA QO‘YILMAYDI.
         *
         * Ustunning sukut qiymati `pending` va zaxira cron har 10 daqiqada
         * navbatni ko‘radi — seed'dan keyin u 385 ta hisobotni modelga
         * yuborib, kutilmagan hisob yozardi. Demo ma’lumot buning uchun
         * arzimaydi.
         *
         * Istalgan hisobotni ko‘rish uchun kartadagi «Qayta tahlil»
         * tugmasi bor: u sanoqni nolga tushirib, modelga yuboradi.
         */
        aiVisionStatus: AiVisionStatus.UNAVAILABLE,
        aiAnalysis: {
          stage: '',
          estimatedProgressPercent: 0,
          rangeMin: 0,
          rangeMax: 0,
          confidence: 0,
          completedWorks: [],
          remainingWorks: [],
          matchesReported: false,
          discrepancyNote: '',
          imageQuality: 'poor' as const,
          summary: '',
          unavailableReason:
            'Demo ma’lumot — AI tahlili «Qayta tahlil» tugmasi bilan ishga tushiriladi',
        },
        status: approved
          ? PhotoReportStatus.APPROVED
          : PhotoReportStatus.PENDING,
        reviewedById:
          approved && moderators.length ? rng.pick(moderators).id : null,
        reviewedAt: approved ? addDays(report.capturedAt, 1) : null,
      },
    );
  }

  console.log(
    `📷 ${savedReports.length} ta foto-hisobot, ${savedFiles.length} ta surat yaratildi`,
  );
}

const PHOTO_NOTES = [
  'Poydevor ishlari yakunlandi, karkas montaji boshlandi.',
  'Devor ishlari davom etmoqda, g‘isht yetkazib berildi.',
  'Tom yopish ishlari 80% bajarildi.',
  'Muhandislik tarmoqlari o‘tkazilmoqda.',
  'Ichki pardozlash ishlari boshlandi.',
  'Fasad qoplamasi o‘rnatilmoqda.',
  'Hududni obodonlashtirish ishlari olib borilmoqda.',
  'Elektr montaj ishlari yakunlanish arafasida.',
];

/* ───────────────────────── 12. Hujjatlar ───────────────────────── */

async function seedDocuments(
  em: EntityManager,
  rng: Rng,
  today: Date,
  objects: ConstructionObject[],
  users: User[],
): Promise<void> {
  const uploaders = users.filter(
    (u) =>
      u.role === UserRole.DISTRICT_ADMIN || u.role === UserRole.REGION_ADMIN,
  );
  const rows: ObjectDocument[] = [];

  const templates: Array<{
    type: DocumentType;
    title: string;
    hasExpiry: boolean;
  }> = [
    {
      type: DocumentType.PROJECT,
      title: 'Loyiha-smeta hujjatlari',
      hasExpiry: false,
    },
    {
      type: DocumentType.EXPERTISE,
      title: 'Davlat ekspertizasi xulosasi',
      hasExpiry: false,
    },
    {
      type: DocumentType.PERMIT,
      title: 'Qurilish-montaj ishlariga ruxsatnoma',
      hasExpiry: true,
    },
    {
      type: DocumentType.CONTRACT,
      title: 'Pudrat shartnomasi',
      hasExpiry: true,
    },
    {
      type: DocumentType.ESTIMATE,
      title: 'Tasdiqlangan smeta',
      hasExpiry: false,
    },
    {
      type: DocumentType.ACT,
      title: 'Bajarilgan ishlar dalolatnomasi',
      hasExpiry: false,
    },
  ];

  for (const object of objects) {
    const count =
      object.status === ObjectStatus.NOT_STARTED ? 2 : rng.int(3, 6);
    for (let i = 0; i < count; i += 1) {
      const template = templates[i % templates.length];
      const issued = addDays(
        new Date(`${object.plannedStartDate}T00:00:00Z`),
        rng.int(-120, 30),
      );

      rows.push(
        em.create(ObjectDocument, {
          objectId: object.id,
          type: template.type,
          title: template.title,
          number: `№ ${rng.int(10, 999)}/${issued.getUTCFullYear()}`,
          issuedDate: toDateKey(issued)!,
          // ⚠️ Bir qismi ataylab YAQIN kunlarda tugaydi — «muddati
          // tugayotgan hujjatlar» ogohlantirishi bo‘sh ko‘rinmasligi kerak.
          expiryDate: template.hasExpiry
            ? toDateKey(
                addDays(
                  today,
                  rng.bool(0.18) ? rng.int(3, 28) : rng.int(120, 900),
                ),
              )!
            : null,
          uploadedById: uploaders.length ? rng.pick(uploaders).id : null,
          note: null,
        }),
      );
    }
  }

  await em.save(rows, { chunk: 500 });
  console.log(`📄 ${rows.length} ta hujjat qo‘shildi`);
}

/* ───────────────────────── 13. AI tahlil ───────────────────────── */

async function seedAiAnalyses(
  em: EntityManager,
  today: Date,
  objects: ConstructionObject[],
): Promise<void> {
  const rows: AiAnalysis[] = [];
  const active = objects.filter(
    (o) =>
      o.status === ObjectStatus.IN_PROGRESS ||
      o.status === ObjectStatus.NOT_STARTED,
  );

  for (const object of active) {
    const history = await em
      .getRepository(ObjectProgressUpdate)
      .createQueryBuilder('p')
      .select('p.report_date', 'date')
      .addSelect('p.progress_percent', 'percent')
      .where('p.object_id = :objectId', { objectId: object.id })
      .andWhere("p.report_date >= CURRENT_DATE - INTERVAL '90 days'")
      .orderBy('p.report_date', 'ASC')
      .getRawMany<{ date: string | Date; percent: string }>();

    // ⚠️ Natija ilovadagi AYNI dvigateldan — demo ma’lumot ham haqiqiy
    // qoidalardan o‘tadi, shuning uchun u ekranda izchil ko‘rinadi.
    const results = analyzeAll(
      {
        objectName: object.name,
        progressPercent: object.progressPercent,
        expectedProgress: object.expectedProgress,
        plannedStartDate: object.plannedStartDate,
        plannedEndDate: object.plannedEndDate,
        delayDays: object.delayDays,
        openDelayCount: object.openDelayCount,
        totalCost: Number(object.totalCost),
        fundedAmount: Number(object.fundedAmount),
        paidAmount: Number(object.paidAmount),
        recentProgress: history.map((h) => ({
          date: toDateKey(h.date)!,
          percent: Number(h.percent),
        })),
        lastReportAt: object.lastReportAt,
      },
      today,
    );

    for (const result of results) {
      rows.push(
        em.create(AiAnalysis, {
          objectId: object.id,
          type: result.type,
          score: result.score,
          riskLevel: result.riskLevel,
          summary: result.summary,
          recommendations: result.recommendations,
          details: result.details,
          model: 'rule-engine-v1',
        }),
      );
    }
  }

  await em.save(rows, { chunk: 400 });
  console.log(
    `🤖 ${rows.length} ta AI tahlil natijasi qo‘shildi (${AiAnalysisType.RISK_SCORE} va boshqalar)`,
  );
}

/* ───────────────────────── 14. Bildirishnomalar ───────────────────────── */

async function seedNotifications(
  em: EntityManager,
  objects: ConstructionObject[],
  users: User[],
  today: Date,
): Promise<void> {
  const recipients = users.filter(
    (u) => u.role === UserRole.GOVERNOR || u.role === UserRole.REGION_ADMIN,
  );
  if (recipients.length === 0) return;

  const rows: Notification[] = [];
  const atRisk = objects
    .filter((o) => o.healthStatus === ObjectHealth.AT_RISK)
    .slice(0, 6);
  const dueSoon = objects
    .filter(
      (o) =>
        o.status === ObjectStatus.IN_PROGRESS &&
        (diffInDays(toDateKey(today), o.plannedEndDate) ?? 999) <= 30 &&
        o.progressPercent < 95,
    )
    .slice(0, 6);

  for (const user of recipients) {
    for (const object of atRisk) {
      rows.push(
        em.create(Notification, {
          userId: user.id,
          type: NotificationType.RISK_DETECTED,
          severity: NotificationSeverity.CRITICAL,
          title: 'Obyekt xavfli holatda',
          body: `«${object.name}» ${object.delayDays} kun ortda qolmoqda (bajarilish ${object.progressPercent}%). Zudlik bilan chora ko‘rish talab etiladi.`,
          objectId: object.id,
          isRead: false,
        }),
      );
    }
    for (const object of dueSoon) {
      rows.push(
        em.create(Notification, {
          userId: user.id,
          type: NotificationType.DEADLINE_APPROACHING,
          severity: NotificationSeverity.WARNING,
          title: 'Topshirish muddati yaqinlashmoqda',
          body: `«${object.name}» yaqin kunlarda topshirilishi kerak, bajarilish ${object.progressPercent}%.`,
          objectId: object.id,
          isRead: false,
        }),
      );
    }
  }

  await em.save(rows, { chunk: 300 });
  console.log(`🔔 ${rows.length} ta bildirishnoma qo‘shildi`);
}

/* ───────────────────────── 15. Sozlamalar ───────────────────────── */

async function seedSettings(em: EntityManager): Promise<void> {
  const rows = SETTING_DEFAULTS.map((d) =>
    em.create(AppSetting, {
      key: d.key,
      value: d.value as object,
      description: d.description,
      category: d.category,
    }),
  );
  await em.save(rows);
  console.log(`⚙️  ${rows.length} ta sozlama qo‘shildi`);
}

/* ───────────────────────── 16. Pudratchi reytingi ───────────────────────── */

/** Formula `ContractorsService.recalculateRating()` bilan AYNI. */
async function recalculateContractorRatings(em: EntityManager): Promise<void> {
  const rows = await em.query<
    Array<{
      id: string;
      completed: string;
      on_time: string;
      at_risk: string;
      avg_delay: string;
      total: string;
    }>
  >(
    `SELECT c.id,
            COUNT(o.id) FILTER (WHERE o.status = 'completed')                        AS completed,
            COUNT(o.id) FILTER (WHERE o.status = 'completed' AND o.delay_days = 0)   AS on_time,
            COUNT(o.id) FILTER (WHERE o.health_status = 'at_risk')                   AS at_risk,
            COALESCE(ROUND(AVG(o.delay_days), 1), 0)                                 AS avg_delay,
            COUNT(o.id)                                                              AS total
       FROM contractors c
       LEFT JOIN construction_objects o ON o.contractor_id = c.id AND o.deleted_at IS NULL
      GROUP BY c.id`,
  );

  for (const row of rows) {
    const completed = Number(row.completed);
    const total = Number(row.total);
    if (completed === 0 && total === 0) {
      await em.query(`UPDATE contractors SET rating = 0 WHERE id = $1`, [
        row.id,
      ]);
      continue;
    }

    const onTimeRatio = completed > 0 ? Number(row.on_time) / completed : 0.5;
    const delayPenalty = Math.min(2, (Number(row.avg_delay) / 30) * 0.5);
    const riskPenalty = Math.min(1.5, Number(row.at_risk) * 0.2);
    const rating = Math.min(
      5,
      Math.max(0, 3 + onTimeRatio * 2 - delayPenalty - riskPenalty),
    );

    await em.query(`UPDATE contractors SET rating = $1 WHERE id = $2`, [
      rating.toFixed(2),
      row.id,
    ]);
  }

  console.log(`⭐ ${rows.length} ta pudratchi reytingi hisoblandi`);
}

/* ───────────────────────── 17. Yakuniy tekshiruv ───────────────────────── */

/**
 * ⚠️ Seed O‘ZINI TEKSHIRADI. Generator mo‘ljaldan chetga chiqsa (masalan
 * shablon o‘zgargani uchun), buni seed paytida bilgan — dashboard'da
 * noto‘g‘ri raqam ko‘rgandan ancha yaxshi.
 */
async function report(
  dataSource: DataSource,
  startedAt: number,
): Promise<void> {
  const expected = readJson<DistributionData>('distribution.json');

  const [row] = await dataSource.query<Array<Record<string, string>>>(
    `SELECT COUNT(*)                                                          AS total,
            COUNT(*) FILTER (WHERE health_status = 'on_schedule')             AS on_schedule,
            COUNT(*) FILTER (WHERE health_status = 'not_started')             AS not_started,
            COUNT(*) FILTER (WHERE health_status = 'delayed')                 AS delayed,
            COUNT(*) FILTER (WHERE health_status = 'at_risk')                 AS at_risk,
            COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM planned_end_date) = EXTRACT(YEAR FROM CURRENT_DATE))     AS this_year,
            COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM planned_end_date) = EXTRACT(YEAR FROM CURRENT_DATE) + 1) AS next_year,
            COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM planned_end_date) >= EXTRACT(YEAR FROM CURRENT_DATE) + 2) AS beyond,
            COALESCE(SUM(total_cost), 0)                                      AS total_cost
       FROM construction_objects
      WHERE deleted_at IS NULL AND status NOT IN ('completed', 'cancelled')`,
  );

  const onPlan = Number(row.on_schedule) + Number(row.not_started);
  const total = Number(row.total);
  const pct = (n: number) =>
    total > 0 ? ((n / total) * 100).toFixed(1) : '0.0';

  const checks: Array<[string, number, number]> = [
    ['Jami obyektlar', total, expected.activeObjects],
    [
      'Reja asosida',
      onPlan,
      expected.byHealth.on_schedule + expected.byHealth.not_started,
    ],
    ['Kechikayotgan', Number(row.delayed), expected.byHealth.delayed],
    ['Xavfli holatda', Number(row.at_risk), expected.byHealth.at_risk],
    [
      'Joriy yil yakunlanadi',
      Number(row.this_year),
      expected.byDeadline.currentYear,
    ],
    ['Keyingi yil', Number(row.next_year), expected.byDeadline.nextYear],
    ['2028+ yillar', Number(row.beyond), expected.byDeadline.beyond],
  ];

  console.log('\n' + '─'.repeat(64));
  console.log('📊 DASHBOARD KO‘RSATKICHLARI (maket bilan solishtirish)\n');

  let mismatch = 0;
  for (const [label, actual, want] of checks) {
    const ok = actual === want;
    if (!ok) mismatch += 1;
    const share = label === 'Jami obyektlar' ? '100%' : `${pct(actual)}%`;
    console.log(
      `  ${ok ? '✅' : '⚠️ '} ${label.padEnd(24)} ${String(actual).padStart(4)} ${`(${share})`.padStart(9)}  kutilgan: ${want}`,
    );
  }

  const cost = Number(row.total_cost);
  console.log(
    `  ${Math.abs(cost - expected.totalCostTargetSom) < 1 ? '✅' : '⚠️ '} ${'Umumiy qiymat'.padEnd(24)} ${(cost / 1e12).toFixed(2)} trln so‘m  kutilgan: ${(expected.totalCostTargetSom / 1e12).toFixed(1)} trln`,
  );

  const counts = await dataSource.query<
    Array<{ table: string; count: string }>
  >(
    `SELECT 'tumanlar' AS table, COUNT(*)::text FROM districts
     UNION ALL SELECT 'foydalanuvchilar', COUNT(*)::text FROM users
     UNION ALL SELECT 'pudratchilar', COUNT(*)::text FROM contractors
     UNION ALL SELECT 'obyektlar (jami)', COUNT(*)::text FROM construction_objects
     UNION ALL SELECT 'bosqichlar', COUNT(*)::text FROM object_milestones
     UNION ALL SELECT 'bajarilish yozuvlari', COUNT(*)::text FROM object_progress_updates
     UNION ALL SELECT 'kechikishlar (ochiq)', COUNT(*)::text FROM object_delays WHERE status <> 'resolved'
     UNION ALL SELECT 'foto-hisobotlar', COUNT(*)::text FROM photo_reports
     UNION ALL SELECT 'hujjatlar', COUNT(*)::text FROM object_documents
     UNION ALL SELECT 'moliyaviy harakatlar', COUNT(*)::text FROM funding_transactions
     UNION ALL SELECT 'AI tahlillar', COUNT(*)::text FROM ai_analyses
     UNION ALL SELECT 'bildirishnomalar', COUNT(*)::text FROM notifications`,
  );

  console.log('\n📦 JADVALLAR\n');
  for (const c of counts)
    console.log(
      `  ${String(c.table).padEnd(24)} ${String(c.count).padStart(6)}`,
    );

  console.log('\n' + '─'.repeat(64));
  console.log(
    mismatch === 0
      ? `✅ Seed yakunlandi — barcha ko‘rsatkichlar maketga mos (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`
      : `⚠️  Seed yakunlandi, lekin ${mismatch} ta ko‘rsatkich mos kelmadi (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`,
  );
  console.log(
    '\n🔑 Kirish: hokim@andijon.uz / Hokim2026!   (barcha hisoblar — README.md)\n',
  );
}

main().catch((error: unknown) => {
  console.error('\n❌ Seed yiqildi:\n', error);
  process.exitCode = 1;
});
