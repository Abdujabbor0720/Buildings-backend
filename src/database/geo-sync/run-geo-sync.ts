import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { ConstructionObject } from '../entities/construction-object.entity';
import { District } from '../entities/district.entity';
import { Mahalla } from '../entities/mahalla.entity';
import { Region } from '../entities/region.entity';
import { assignMahallasInTx } from '../../modules/geo/mahalla-assign';

/**
 * CHEGARALARNI JONLI BAZAGA YOZISH.
 *
 *   npm run geo:sync
 *   npm run geo:sync -- --dry-run
 *
 * ⚠️ `npm run seed` BILAN CHALKASHMASIN. Seed — demo generator: u
 * jadvallarni `TRUNCATE ... CASCADE` qilib boshlaydi va prod bazada
 * haqiqiy obyektlarni o‘chirib yuboradi. Bu skript esa FAQAT
 * chegaralarga tegadi: tuman va mahalla geometriyasini yangilaydi,
 * obyektlarni mahallaga qaytadan biriktiradi va boshqa hech narsani
 * o‘zgartirmaydi.
 *
 * ⚠️ TUMAN QO‘SHILMAYDI VA O‘CHIRILMAYDI. Faqat mavjudlarining
 * geometriyasi yangilanadi: tumanlar ro‘yxati ma’muriy qaror bilan
 * o‘zgaradi, OSM bilan emas. Faylda bazada yo‘q tuman bo‘lsa — u
 * sanab aytiladi, lekin yozilmaydi.
 *
 * ⚠️ MAHALLA O‘CHIRILMAYDI, NOFAOL qilinadi (`isActive = false`).
 * Obyektlar unga `mahalla_id` bilan bog‘langan bo‘lishi mumkin va
 * o‘chirish tarixdagi hisobotni buzardi.
 */

const DATA_DIR = join(__dirname, '..', 'seeds', 'data');
const readJson = <T>(file: string): T =>
  JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as T;

interface DistrictFeature {
  properties: { code: string };
  geometry: Record<string, unknown> | null;
}

interface MahallaFeature {
  properties: {
    code: string;
    name: string;
    officialName: string | null;
    districtCode: string;
    centerLat: number;
    centerLng: number;
  };
  geometry: Record<string, unknown> | null;
}

interface Report {
  districtsUpdated: number;
  districtsMissing: string[];
  mahallasInserted: number;
  mahallasUpdated: number;
  mahallasDeactivated: number;
  orphanMahallas: number;
  objectsMatched: number;
  objectsUnmatched: number;
  coveredDistricts: number;
  totalDistricts: number;
}

async function sync(em: EntityManager, dryRun: boolean): Promise<Report> {
  const districtGeo = readJson<{ bbox: number[]; features: DistrictFeature[] }>(
    'andijon-districts.geojson',
  );
  const mahallaGeo = readJson<{ features: MahallaFeature[] }>(
    'andijon-mahallas.geojson',
  );

  /* ───────── Tumanlar ───────── */

  const districts = await em.find(District);
  const byCode = new Map(districts.map((d) => [d.code, d]));

  let districtsUpdated = 0;
  const districtsMissing: string[] = [];
  for (const feature of districtGeo.features) {
    const district = byCode.get(feature.properties.code);
    if (!district) {
      districtsMissing.push(feature.properties.code);
      continue;
    }
    if (!feature.geometry) continue;
    if (!dryRun) {
      /* ⚠️ `as never` — TypeORM ning `QueryDeepPartialEntity` turi
         `jsonb` ustunni rekursiv «qisman obyekt» deb o‘qiydi va
         tayyor GeoJSON ni qabul qilmaydi. Qiymat baribir butunligicha
         yoziladi, shuning uchun bu yerda cast xavfsiz. */
      await em.update(
        District,
        { id: district.id },
        { geometry: feature.geometry as never },
      );
    }
    districtsUpdated += 1;
  }

  // Viloyat chegaralovchi to‘rtburchagi ham fayldan yangilanadi —
  // xarita aynan shunga moslanadi (`region.bbox`).
  if (!dryRun && Array.isArray(districtGeo.bbox)) {
    const region = await em.findOne(Region, { where: { code: 'andijon' } });
    if (region)
      await em.update(Region, { id: region.id }, { bbox: districtGeo.bbox });
  }

  /* ───────── Mahallalar ───────── */

  const existing = await em.find(Mahalla);
  const byMahallaCode = new Map(existing.map((m) => [m.code, m]));
  const seen = new Set<string>();

  let inserted = 0;
  let updated = 0;
  let orphan = 0;
  const toInsert: Mahalla[] = [];
  const coveredDistricts = new Set<string>();

  for (const feature of mahallaGeo.features) {
    const p = feature.properties;
    const district = byCode.get(p.districtCode);
    if (!district) {
      orphan += 1;
      continue;
    }
    coveredDistricts.add(district.id);
    seen.add(p.code);

    const current = byMahallaCode.get(p.code);
    if (current) {
      if (!dryRun) {
        await em.update(
          Mahalla,
          { id: current.id },
          {
            name: p.name,
            officialName: p.officialName,
            centerLat: p.centerLat,
            centerLng: p.centerLng,
            geometry: feature.geometry as never,
            districtId: district.id,
            isActive: true,
          },
        );
      }
      updated += 1;
    } else {
      toInsert.push(
        em.create(Mahalla, {
          code: p.code,
          name: p.name,
          officialName: p.officialName,
          centerLat: p.centerLat,
          centerLng: p.centerLng,
          geometry: feature.geometry,
          districtId: district.id,
          isActive: true,
        }),
      );
      inserted += 1;
    }
  }

  if (!dryRun && toInsert.length > 0) await em.save(toInsert);

  /*
   * ⚠️ Fayldan tushib qolgan mahalla O‘CHIRILMAYDI — nofaol qilinadi.
   * Unga biriktirilgan obyekt bo‘lishi mumkin va o‘chirish
   * `mahalla_id` ni `NULL` ga tushirib, tarixdagi kesimni buzardi.
   */
  const stale = existing.filter((m) => m.isActive && !seen.has(m.code));
  if (!dryRun && stale.length > 0) {
    await em.update(
      Mahalla,
      { id: stale.map((m) => m.id) as unknown as string },
      { isActive: false },
    );
  }

  /* ───────── Obyektlarni qayta biriktirish ───────── */

  const objects = await em.find(ConstructionObject, {
    select: { id: true, districtId: true, lat: true, lng: true },
    where: {},
  });
  const located = objects.filter((o) => o.lat !== null && o.lng !== null);

  const assignment = dryRun
    ? { matched: 0, unmatched: 0 }
    : await assignMahallasInTx(em, located);

  return {
    districtsUpdated,
    districtsMissing,
    mahallasInserted: inserted,
    mahallasUpdated: updated,
    mahallasDeactivated: stale.length,
    orphanMahallas: orphan,
    objectsMatched: assignment.matched,
    objectsUnmatched: assignment.unmatched,
    coveredDistricts: coveredDistricts.size,
    totalDistricts: districts.length,
  };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  console.log(
    `\n🗺️  Chegaralarni sinxronlash${dryRun ? ' (DRY RUN — hech narsa yozilmaydi)' : ''}\n` +
      '─'.repeat(64),
  );

  const ds = await AppDataSource.initialize();
  try {
    // ⚠️ BITTA TRANZAKSIYA: yarim yozilgan chegara xaritani
    // tumanlari yangi, mahallalari eski holatda qoldirardi.
    const report = await ds.transaction((em) => sync(em, dryRun));

    console.log(`  • tuman chegarasi yangilandi: ${report.districtsUpdated}`);
    if (report.districtsMissing.length > 0) {
      console.log(
        `  ⚠️  bazada yo‘q tumanlar (yozilmadi): ${report.districtsMissing.join(', ')}`,
      );
    }
    console.log(
      `  • mahalla: +${report.mahallasInserted} yangi, ${report.mahallasUpdated} yangilandi` +
        (report.mahallasDeactivated > 0
          ? `, ${report.mahallasDeactivated} nofaol qilindi`
          : ''),
    );
    if (report.orphanMahallas > 0) {
      console.log(
        `  ⚠️  ${report.orphanMahallas} ta mahallaning tumani bazada topilmadi`,
      );
    }
    console.log(
      `  • chegara bor tumanlar: ${report.coveredDistricts}/${report.totalDistricts}`,
    );
    if (!dryRun) {
      console.log(
        `  • obyekt → mahalla: ${report.objectsMatched} biriktirildi, ` +
          `${report.objectsUnmatched} chegaradan tashqarida`,
      );
    }
    console.log('─'.repeat(64));
    console.log(
      dryRun ? '✅ Tekshiruv tugadi (yozilmadi)\n' : '✅ Sinxronlash tugadi\n',
    );
  } finally {
    await ds.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error('\n❌ Sinxronlash yiqildi:', error);
  process.exit(1);
});
