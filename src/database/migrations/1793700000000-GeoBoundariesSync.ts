import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MigrationInterface, QueryRunner } from 'typeorm';
import { pointInGeometry } from '../../helpers/geo.helpers';

/**
 * CHEGARALARNI JONLI BAZAGA YOZISH — DEPLOY PAYTIDA, O‘Z-O‘ZIDAN.
 *
 * ⚠️ BU MIGRATSIYA NIMA UCHUN BOR.
 * Tuman va mahalla chegaralari `database/seeds/data/*.geojson` da
 * turadi va ular KOD bilan birga deploy qilinadi. Bazaga esa ular
 * faqat ikki yo‘l bilan tushardi: `npm run seed` (prod'da TAQIQ —
 * jadvallarni `TRUNCATE` qiladi) yoki `npm run geo:sync` (QO‘LDA
 * ishga tushiriladigan skript).
 *
 * Natija amalda shunday bo‘ldi: fayllarda 16 ta tumanning aniq
 * chegarasi turibdi, jonli bazada esa hamon eski, qo‘pol kontur —
 * Xonobod 6 ta nuqta, Andijon shahri 15 ta. Shu qo‘pol chegaralar
 * sababli 53 ta mahalla NOTO‘G‘RI tumanga biriktirilgan edi va
 * «Baliqchi tumani» xaritasida Andijon shahridagi mahalla paydo
 * bo‘lib, xarita butun viloyatga cho‘zilib ketgan edi.
 *
 * Deploy buyrug‘i (`README` §8) `npm run migration:run` ni ishga
 * tushiradi — demak chegaralar MIGRATSIYA bo‘lsa, keyingi deploy'da
 * o‘z-o‘zidan joyiga tushadi va hech kim hech narsani eslab
 * qolishi shart emas.
 *
 * ⚠️ `geo:sync` skripti O‘CHIRILMAYDI: u chegaralar deploy'dan
 * TASHQARIDA yangilanganda (OSM'dan qayta import qilinganda) kerak.
 * Ikkalasi AYNI natijani beradi.
 *
 * ⚠️ MIGRATSIYA O‘ZI YETARLI — entity'larga TEGMAYDI. Migratsiya
 * tarixda muzlab qoladi: bugungi `Mahalla` entity'si ertaga
 * o‘zgarsa, entity orqali yozilgan migratsiya toza bazada yiqilardi.
 * Shuning uchun bu yerda faqat XOM SQL va sof geometriya yordamchisi
 * (`pointInGeometry`) ishlatiladi.
 *
 * ⚠️ HECH NARSA O‘CHIRILMAYDI. Tuman qo‘shilmaydi ham, o‘chirilmaydi
 * ham (ro‘yxat ma’muriy qaror bilan o‘zgaradi, OSM bilan emas);
 * fayldan tushib qolgan mahalla `is_active = false` qilinadi, chunki
 * unga obyekt bog‘langan bo‘lishi mumkin.
 *
 * Manba: OpenStreetMap, ODbL 1.0 © OpenStreetMap hissadorlari.
 */

const DATA_DIR = join(__dirname, '..', 'seeds', 'data');

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

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as T;
}

export class GeoBoundariesSync1793700000000 implements MigrationInterface {
  name = 'GeoBoundariesSync1793700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const districtGeo = readJson<{
      bbox: number[];
      features: DistrictFeature[];
    }>('andijon-districts.geojson');
    const mahallaGeo = readJson<{ features: MahallaFeature[] }>(
      'andijon-mahallas.geojson',
    );

    /* ───────── 1. Tuman chegaralari ───────── */

    /* ⚠️ `queryRunner.query()` TypeORM 0.3 da turlanmagan natija
       qaytaradi — shuning uchun har joyda aniq `as` bilan yoziladi. */
    const districts = (await queryRunner.query(
      `SELECT "id", "code" FROM "districts"`,
    )) as Array<{ id: string; code: string }>;
    const districtIdByCode = new Map(districts.map((d) => [d.code, d.id]));

    for (const feature of districtGeo.features) {
      const id = districtIdByCode.get(feature.properties.code);
      if (!id || !feature.geometry) continue;
      await queryRunner.query(
        `UPDATE "districts" SET "geometry" = $1, "updated_at" = now() WHERE "id" = $2`,
        [JSON.stringify(feature.geometry), id],
      );
    }

    // Viloyat chegaralovchi to‘rtburchagi — xarita aynan shunga moslanadi.
    if (Array.isArray(districtGeo.bbox) && districtGeo.bbox.length === 4) {
      await queryRunner.query(
        `UPDATE "regions" SET "bbox" = $1, "updated_at" = now() WHERE "code" = 'andijon'`,
        [JSON.stringify(districtGeo.bbox)],
      );
    }

    /* ───────── 2. Mahallalar ───────── */

    /*
     * ⚠️ Moslashtirish `code` BO‘YICHA, `(district_id, code)` bo‘yicha
     * EMAS. Aynan shu migratsiya mahallani BOSHQA tumanga ko‘chiradi
     * (eski qo‘pol chegara sababli noto‘g‘ri biriktirilgani uchun), va
     * `ON CONFLICT (district_id, code)` bunday qatorni topa olmay,
     * ikkinchi nusxa yaratib qo‘yardi.
     */
    const seen: string[] = [];
    for (const feature of mahallaGeo.features) {
      const p = feature.properties;
      const districtId = districtIdByCode.get(p.districtCode);
      if (!districtId) continue;
      seen.push(p.code);

      const geometry = feature.geometry
        ? JSON.stringify(feature.geometry)
        : null;
      const updated = (await queryRunner.query(
        `UPDATE "mahallas"
            SET "name" = $1, "official_name" = $2, "center_lat" = $3,
                "center_lng" = $4, "geometry" = $5, "district_id" = $6,
                "is_active" = true, "updated_at" = now()
          WHERE "code" = $7
        RETURNING "id"`,
        [
          p.name,
          p.officialName,
          p.centerLat,
          p.centerLng,
          geometry,
          districtId,
          p.code,
        ],
      )) as unknown[];

      if (updated.length === 0) {
        await queryRunner.query(
          `INSERT INTO "mahallas"
             ("code", "name", "official_name", "center_lat", "center_lng",
              "geometry", "district_id", "is_active")
           VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
          [
            p.code,
            p.name,
            p.officialName,
            p.centerLat,
            p.centerLng,
            geometry,
            districtId,
          ],
        );
      }
    }

    /*
     * ⚠️ Fayldan tushib qolgan mahalla O‘CHIRILMAYDI — nofaol qilinadi:
     * unga `mahalla_id` bilan bog‘langan obyekt bo‘lishi mumkin va
     * o‘chirish tarixdagi kesimni buzardi.
     */
    if (seen.length > 0) {
      await queryRunner.query(
        `UPDATE "mahallas" SET "is_active" = false, "updated_at" = now()
          WHERE "is_active" = true AND NOT ("code" = ANY($1))`,
        [seen],
      );
    }

    /* ───────── 3. Obyektlarni mahallaga qayta biriktirish ───────── */

    /*
     * ⚠️ Chegara o‘zgargach bu MAJBURIY: obyektning `mahalla_id` i
     * eski konturdan hisoblangan va endi boshqa mahallaga tushishi
     * mumkin. Qidiruv FAQAT o‘z tumani ichida (`mahalla-assign.ts`
     * bilan AYNI qoida): chegaradagi nuqta qo‘shni tumanning
     * mahallasiga tushib ketmasin.
     */
    const mahallas = (await queryRunner.query(
      `SELECT "id", "district_id", "geometry" FROM "mahallas"
        WHERE "is_active" = true AND "geometry" IS NOT NULL
        ORDER BY "name" ASC`,
    )) as Array<{ id: string; district_id: string; geometry: unknown }>;
    const byDistrict = new Map<string, typeof mahallas>();
    for (const m of mahallas) {
      const list = byDistrict.get(m.district_id);
      if (list) list.push(m);
      else byDistrict.set(m.district_id, [m]);
    }

    const objects = (await queryRunner.query(
      `SELECT "id", "district_id", "lat", "lng", "mahalla_id"
         FROM "construction_objects"
        WHERE "lat" IS NOT NULL AND "lng" IS NOT NULL`,
    )) as Array<{
      id: string;
      district_id: string;
      lat: number | null;
      lng: number | null;
      mahalla_id: string | null;
    }>;

    for (const object of objects) {
      const candidates = byDistrict.get(object.district_id) ?? [];
      let hit: string | null = null;
      for (const m of candidates) {
        if (pointInGeometry(object.lng, object.lat, m.geometry)) {
          hit = m.id;
          break;
        }
      }
      if (hit === object.mahalla_id) continue;
      await queryRunner.query(
        `UPDATE "construction_objects" SET "mahalla_id" = $1 WHERE "id" = $2`,
        [hit, object.id],
      );
    }
  }

  /**
   * ⚠️ ORQAGA QAYTARISH — ataylab BO‘SH.
   *
   * Bu migratsiya sxemaga tegmaydi, u faqat MA’LUMOTNI to‘g‘rilaydi.
   * «Qaytarish» degani eski, qo‘pol va xato chegaralarni tiklash
   * bo‘lardi — ularning nusxasi hech qayerda saqlanmagan va
   * saqlanishi ham kerak emas.
   */
  public async down(): Promise<void> {
    // Hech narsa qilinmaydi — yuqoridagi izohga qarang.
  }
}
