import { hash } from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
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
 * ISHLAB CHIQARISH BAZASINI BIRINCHI MARTA TO‘LDIRISH.
 *
 * ⚠️ `run-seed.ts` BILAN CHALKASHMASIN. Seed — demo ma’lumot generatori:
 * u 23 ta jadvalni `TRUNCATE ... CASCADE` qilib boshlanadi, ya’ni prod
 * bazada ishga tushirilsa HAMMA haqiqiy ma’lumotni o‘chirib yuboradi.
 * Shu fayl esa teskari qoidaga quriladi: **hech narsani o‘chirmaydi**,
 * faqat YO‘Q narsani qo‘shadi.
 *
 * Nima yoziladi:
 *   1. Andijon viloyati va uning tumanlari (xaritasiz ilova ishlamaydi)
 *   2. Kataloglar — qurilish turlari, moliya manbalari, kechikish sabablari
 *      (obyekt yaratish formasi aynan shulardan tanlaydi)
 *   3. Sozlamalar (`app_settings`) — standart qiymatlar
 *   4. BITTA `super_admin` — aks holda tizimga kirib ichidan hech narsa
 *      yaratib bo‘lmaydi (birinchi odamni yaratadigan ochiq endpoint YO‘Q)
 *
 * Har bo‘lim MUSTAQIL tekshiriladi: jadvalda qator bo‘lsa, o‘sha bo‘lim
 * butunlay chetlab o‘tiladi. Shuning uchun skriptni necha marta ishga
 * tushirsa ham natija bir xil va xavfsiz — yarmida uzilib qolsa qaytadan
 * ishga tushirish yetarli.
 *
 * Ishga tushirish (serverda, loyiha papkasida):
 *   ADMIN_EMAIL=admin@andijon.uz ADMIN_PASSWORD='...' npm run bootstrap
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
const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_ROUNDS = 12;

/* ───────────────────────── 1. Geografiya ───────────────────────── */

async function ensureGeo(em: EntityManager): Promise<void> {
  if ((await em.count(Region)) > 0) {
    const districts = await em.count(District);
    console.log(`⏭️  Geografiya allaqachon bor (${districts} ta tuman) — tegilmadi`);
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

  console.log(`🗺️  Andijon viloyati va ${saved.length} ta tuman/shahar qo‘shildi`);
}

/* ───────────────────────── 2. Kataloglar ───────────────────────── */

async function ensureCatalogs(em: EntityManager): Promise<void> {
  if ((await em.count(ConstructionType)) === 0) {
    const rows = await em.save(
      readJson<CatalogRow[]>('construction-types.json').map((r) =>
        em.create(ConstructionType, { ...r, icon: r.icon ?? null, isActive: true }),
      ),
    );
    console.log(`📚 ${rows.length} ta qurilish turi qo‘shildi`);
  } else {
    console.log('⏭️  Qurilish turlari allaqachon bor — tegilmadi');
  }

  if ((await em.count(FundingSource)) === 0) {
    const rows = await em.save(
      readJson<CatalogRow[]>('funding-sources.json').map((r) =>
        em.create(FundingSource, { ...r, isActive: true }),
      ),
    );
    console.log(`💰 ${rows.length} ta moliyalashtirish manbasi qo‘shildi`);
  } else {
    console.log('⏭️  Moliya manbalari allaqachon bor — tegilmadi');
  }

  if ((await em.count(DelayReason)) === 0) {
    const rows = await em.save(
      readJson<CatalogRow[]>('delay-reasons.json').map((r) =>
        em.create(DelayReason, { ...r, icon: r.icon ?? null, isActive: true }),
      ),
    );
    console.log(`⏳ ${rows.length} ta kechikish sababi qo‘shildi`);
  } else {
    console.log('⏭️  Kechikish sabablari allaqachon bor — tegilmadi');
  }
}

/* ───────────────────────── 3. Sozlamalar ───────────────────────── */

/**
 * ⚠️ Bu yerda bo‘lim butunlay bo‘sh bo‘lishi SHART EMAS: keyinchalik yangi
 * sozlama qo‘shilsa, u ham yozilishi kerak. Shuning uchun kalit bo‘yicha
 * solishtiriladi va faqat YO‘Q kalitlar qo‘shiladi — mavjud sozlamaning
 * qiymati (admin o‘zgartirgani) hech qachon ustidan yozilmaydi.
 */
async function ensureSettings(em: EntityManager): Promise<void> {
  const existing = new Set(
    (await em.find(AppSetting, { select: { key: true } })).map((r) => r.key),
  );

  const missing = SETTING_DEFAULTS.filter((d) => !existing.has(d.key));
  if (missing.length === 0) {
    console.log(`⏭️  Sozlamalar to‘liq (${existing.size} ta) — tegilmadi`);
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
  console.log(`⚙️  ${missing.length} ta yangi sozlama qo‘shildi`);
}

/* ───────────────────────── 4. Birinchi administrator ───────────────────────── */

async function ensureAdmin(em: EntityManager): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? '';

  const admins = await em.count(User, { where: { role: UserRole.SUPER_ADMIN } });
  if (admins > 0) {
    console.log(`⏭️  Administrator allaqachon bor (${admins} ta) — tegilmadi`);
    return;
  }

  if (!email || !password) {
    console.log(
      '\n⚠️  ADMINISTRATOR YARATILMADI — bazada birorta `super_admin` yo‘q.\n' +
        '   Tizimga kirish uchun quyidagicha qaytadan ishga tushiring:\n\n' +
        "   ADMIN_EMAIL=admin@andijon.uz ADMIN_PASSWORD='kuchliParol123' npm run bootstrap\n",
    );
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

  // ⚠️ `email` unikal indeksga ega: boshqa roldagi o‘sha email bo‘lsa
  // `save` jim xatolik bermasdan 23505 bilan yiqiladi. Oldin aytamiz.
  if (await em.exists(User, { where: { email } })) {
    throw new Error(
      `${email} bazada bor, lekin u super_admin emas. ` +
        'Boshqa email bering yoki o‘sha foydalanuvchining rolini qo‘lda o‘zgartiring.',
    );
  }

  const region = await em.findOne(Region, { where: { code: 'andijon' } });

  await em.save(
    em.create(User, {
      email,
      passwordHash: await hash(password, BCRYPT_ROUNDS),
      firstName: process.env.ADMIN_FIRST_NAME?.trim() || 'Tizim',
      lastName: process.env.ADMIN_LAST_NAME?.trim() || 'Administratori',
      middleName: null,
      position: 'Tizim administratori',
      phone: process.env.ADMIN_PHONE?.trim() || null,
      avatarUrl: null,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      // `super_admin` butun viloyatni ko‘radi — doira CHEKLANMAYDI.
      regionId: region?.id ?? null,
      districtId: null,
      contractorId: null,
    }),
  );

  console.log(`\n👤 Administrator yaratildi: ${email}`);
  console.log('   Parol — siz bergan qiymat. Birinchi kirishdan keyin almashtiring.\n');
}

/* ───────────────────────── Ishga tushirish ───────────────────────── */

async function bootstrap(): Promise<void> {
  console.log('\n🚀 Bootstrap boshlandi\n' + '─'.repeat(64));

  const ds = await AppDataSource.initialize();
  try {
    // ⚠️ BITTA TRANZAKSIYA: yarmida yiqilsa baza yarim to‘ldirilgan
    // holatda qolmasligi kerak — tumanlar bor, kataloglar yo‘q holati
    // obyekt yaratish formasini jimgina buzardi.
    await ds.transaction(async (em) => {
      await ensureGeo(em);
      await ensureCatalogs(em);
      await ensureSettings(em);
      await ensureAdmin(em);
    });

    console.log('─'.repeat(64));
    console.log('✅ Bootstrap tugadi — baza ishlashga tayyor\n');
  } finally {
    await ds.destroy();
  }
}

bootstrap().catch((err: unknown) => {
  console.error('\n❌ Bootstrap yiqildi:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
