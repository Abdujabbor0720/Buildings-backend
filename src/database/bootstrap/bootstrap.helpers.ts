import { hash } from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EntityManager } from 'typeorm';
import { UserRole } from '../../common/constants/enums';
import { SETTING_DEFAULTS } from '../../modules/settings/settings.service';
import { AppSetting } from '../entities/app-setting.entity';
import { ConstructionType } from '../entities/construction-type.entity';
import { DelayReason } from '../entities/delay-reason.entity';
import { District } from '../entities/district.entity';
import { FundingSource } from '../entities/funding-source.entity';
import { Region } from '../entities/region.entity';
import { User } from '../entities/user.entity';

/**
 * BOSHLANG‘ICH MA’LUMOT — YAGONA MANBA.
 *
 * Shu fayldagi funksiyalarni IKKI chaqiruvchi ishlatadi:
 *   1. `run-bootstrap.ts` — qo‘lda ishga tushiriladigan CLI
 *   2. `bootstrap.service.ts` — ilova ko‘tarilganda avtomatik
 *
 * ⚠️ Ikkinchi nusxa yozilmasin: chaqiruvchilar ajralib ketsa, qo‘lda
 * ishga tushirilgan skript bir xil, avtomat yo‘l boshqa ma’lumot
 * yozadigan holatga tushardi.
 *
 * HAMMA funksiya bir xil shartga bo‘ysunadi: **mavjud ma’lumotga
 * tegilmaydi**, faqat yo‘q narsa qo‘shiladi. Shuning uchun ularni
 * necha marta chaqirish mumkin.
 */

const DATA_DIR = join(__dirname, '..', 'seeds', 'data');
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

/** Parolning eng kichik uzunligi — `UpdatePasswordDto` dagi qoida bilan bir xil. */
export const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_ROUNDS = 12;

/**
 * ⚠️ Bir vaqtda ikki nusxa ko‘tarilsa (pm2 cluster, deploy paytidagi
 * ustma-ust ishga tushish) ikkalasi ham bo‘sh jadvalni ko‘rib, bir xil
 * ma’lumotni IKKI MARTA yozardi: 32 ta tuman, ikkita administrator.
 * Shu kalit bilan advisory lock olinadi — ikkinchisi kutmaydi, shunchaki
 * o‘tkazib yuboradi (`pg_try_advisory_xact_lock`).
 */
export const BOOTSTRAP_LOCK_KEY = 7_314_220_601;

export interface AdminCredentials {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

/** Nima qilinganini chaqiruvchi o‘zi xohlagancha chop etadi. */
export interface BootstrapReport {
  lines: string[];
  adminCreated: string | null;
  /** Administrator ham, env qiymatlari ham yo‘q — tizimga kirib bo‘lmaydi. */
  adminMissing: boolean;
}

/* ───────────────────────── 1. Geografiya ───────────────────────── */

async function ensureGeo(em: EntityManager, out: string[]): Promise<void> {
  if ((await em.count(Region)) > 0) {
    out.push(`geografiya: bor (${await em.count(District)} ta tuman)`);
    return;
  }

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

  const saved = await em.save(
    geo.features.map((f) =>
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
    ),
  );

  out.push(`geografiya: Andijon viloyati + ${saved.length} ta tuman QO‘SHILDI`);
}

/* ───────────────────────── 2. Kataloglar ───────────────────────── */

async function ensureCatalogs(em: EntityManager, out: string[]): Promise<void> {
  if ((await em.count(ConstructionType)) === 0) {
    const rows = await em.save(
      readJson<CatalogRow[]>('construction-types.json').map((r) =>
        em.create(ConstructionType, { ...r, icon: r.icon ?? null, isActive: true }),
      ),
    );
    out.push(`qurilish turlari: ${rows.length} ta QO‘SHILDI`);
  } else {
    out.push('qurilish turlari: bor');
  }

  if ((await em.count(FundingSource)) === 0) {
    const rows = await em.save(
      readJson<CatalogRow[]>('funding-sources.json').map((r) =>
        em.create(FundingSource, { ...r, isActive: true }),
      ),
    );
    out.push(`moliya manbalari: ${rows.length} ta QO‘SHILDI`);
  } else {
    out.push('moliya manbalari: bor');
  }

  if ((await em.count(DelayReason)) === 0) {
    const rows = await em.save(
      readJson<CatalogRow[]>('delay-reasons.json').map((r) =>
        em.create(DelayReason, { ...r, icon: r.icon ?? null, isActive: true }),
      ),
    );
    out.push(`kechikish sabablari: ${rows.length} ta QO‘SHILDI`);
  } else {
    out.push('kechikish sabablari: bor');
  }
}

/* ───────────────────────── 3. Sozlamalar ───────────────────────── */

/**
 * ⚠️ Bo‘lim bo‘sh bo‘lishi SHART EMAS: keyin yangi sozlama qo‘shilsa, u
 * ham yozilishi kerak. Shuning uchun KALIT bo‘yicha solishtiriladi va
 * faqat yo‘q kalitlar qo‘shiladi — admin o‘zgartirgan qiymat hech qachon
 * ustidan yozilmaydi.
 */
async function ensureSettings(em: EntityManager, out: string[]): Promise<void> {
  const existing = new Set(
    (await em.find(AppSetting, { select: { key: true } })).map((r) => r.key),
  );
  const missing = SETTING_DEFAULTS.filter((d) => !existing.has(d.key));

  if (missing.length === 0) {
    out.push(`sozlamalar: to‘liq (${existing.size} ta)`);
    return;
  }

  await em.save(
    missing.map((d) =>
      em.create(AppSetting, {
        key: d.key,
        value: d.value as object,
        description: d.description,
        category: d.category,
      }),
    ),
  );
  out.push(`sozlamalar: ${missing.length} ta yangi kalit QO‘SHILDI`);
}

/* ───────────────────────── 4. Birinchi administrator ───────────────────────── */

async function ensureAdmin(
  em: EntityManager,
  creds: AdminCredentials,
  report: BootstrapReport,
): Promise<void> {
  const admins = await em.count(User, { where: { role: UserRole.SUPER_ADMIN } });
  if (admins > 0) {
    report.lines.push(`administrator: bor (${admins} ta)`);
    return;
  }

  const email = (creds.email ?? '').trim().toLowerCase();
  const password = creds.password ?? '';

  if (!email || !password) {
    report.adminMissing = true;
    report.lines.push('administrator: YO‘Q va ADMIN_EMAIL/ADMIN_PASSWORD berilmagan');
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`ADMIN_EMAIL to‘g‘ri email emas: ${email}`);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `ADMIN_PASSWORD juda qisqa — kamida ${MIN_PASSWORD_LENGTH} belgi kerak`,
    );
  }

  // ⚠️ `email` unikal: boshqa roldagi o‘sha email bo‘lsa `save` 23505 bilan
  // yiqilardi. Sababini oldindan, tushunarli qilib aytamiz.
  if (await em.exists(User, { where: { email } })) {
    throw new Error(
      `${email} bazada bor, lekin super_admin emas — boshqa email bering ` +
        'yoki o‘sha foydalanuvchining rolini qo‘lda o‘zgartiring',
    );
  }

  const region = await em.findOne(Region, { where: { code: 'andijon' } });

  await em.save(
    em.create(User, {
      email,
      passwordHash: await hash(password, BCRYPT_ROUNDS),
      firstName: creds.firstName?.trim() || 'Tizim',
      lastName: creds.lastName?.trim() || 'Administratori',
      middleName: null,
      position: 'Tizim administratori',
      phone: creds.phone?.trim() || null,
      avatarUrl: null,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      // `super_admin` butun viloyatni ko‘radi — doira cheklanmaydi.
      regionId: region?.id ?? null,
      districtId: null,
      contractorId: null,
    }),
  );

  report.adminCreated = email;
  report.lines.push(`administrator: ${email} YARATILDI`);
}

/* ───────────────────────── Umumiy kirish nuqtasi ───────────────────────── */

/**
 * Bo‘sh bazani ishlashga yaroqli holga keltiradi.
 *
 * ⚠️ Chaqiruvchi buni TRANZAKSIYA ichida chaqiradi: yarmida yiqilsa baza
 * yarim to‘ldirilgan holatda qolmasligi kerak — «tumanlar bor, kataloglar
 * yo‘q» holati obyekt yaratish formasini jimgina buzardi.
 */
export async function runBootstrap(
  em: EntityManager,
  creds: AdminCredentials = {},
): Promise<BootstrapReport> {
  const report: BootstrapReport = { lines: [], adminCreated: null, adminMissing: false };

  await ensureGeo(em, report.lines);
  await ensureCatalogs(em, report.lines);
  await ensureSettings(em, report.lines);
  await ensureAdmin(em, creds, report);

  return report;
}

/**
 * Advisory lock'ni olishga URINADI va olinsa `runBootstrap` ni bajaradi.
 * Boshqa nusxa ushlab turgan bo‘lsa `null` qaytadi — kutilmaydi, chunki
 * ikkinchi nusxa baribir o‘sha ishni qiladi.
 */
export async function runBootstrapLocked(
  em: EntityManager,
  creds: AdminCredentials = {},
): Promise<BootstrapReport | null> {
  const [{ locked }] = (await em.query(
    'SELECT pg_try_advisory_xact_lock($1) AS locked',
    [BOOTSTRAP_LOCK_KEY],
  )) as Array<{ locked: boolean }>;

  if (!locked) return null;
  return runBootstrap(em, creds);
}
