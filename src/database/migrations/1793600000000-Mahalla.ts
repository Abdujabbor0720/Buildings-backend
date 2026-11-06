import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MAHALLA (MFY) QATLAMI — viloyat → tuman → MAHALLA.
 *
 * Bosh sahifada viloyat tanlanganda xarita TUMANLAR kesimida chiziladi;
 * tuman tanlanganda esa MAHALLALAR kesimida chizilishi kerak. Buning
 * uchun uchinchi ma'muriy pog'ona va obyektning unga bog'lanishi kerak.
 *
 * ⚠️ `mahalla_id` NULLABLE va sukut bo'yicha bo'sh. Sabab ikkita:
 *   1. jadvalda allaqachon obyektlar bor va migratsiya ularni qayta
 *      yozmasligi kerak;
 *   2. mahalla chegaralari qoplamasi TO'LIQ EMAS (manba — OpenStreetMap,
 *      ODbL) va koordinatasi yo'q obyekt ham bo'lishi mumkin. Mahallasi
 *      aniqlanmagan obyekt hisobotdan tushib qolmaydi — u tuman
 *      darajasida sanaladi.
 *
 * ⚠️ `ON DELETE CASCADE` — tuman o'chirilsa mahallalari ham ketadi
 * (ular tumandan tashqarida ma'noga ega emas). Obyekt tomonida esa
 * `SET NULL`: chegara fayli yangilanib, mahalla o'chib ketsa, OBYEKT
 * qolishi shart.
 */
export class Mahalla1793600000000 implements MigrationInterface {
  name = 'Mahalla1793600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "mahallas" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "code" character varying(40) NOT NULL,
        "name" character varying(160) NOT NULL,
        "official_name" character varying(240),
        "center_lat" double precision NOT NULL,
        "center_lng" double precision NOT NULL,
        "geometry" jsonb,
        "is_active" boolean NOT NULL DEFAULT true,
        "district_id" uuid NOT NULL,
        CONSTRAINT "pk_mahallas" PRIMARY KEY ("id"),
        CONSTRAINT "uq_mahallas_district_code" UNIQUE ("district_id", "code"),
        CONSTRAINT "fk_mahallas_district" FOREIGN KEY ("district_id")
          REFERENCES "districts"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_mahallas_district" ON "mahallas" ("district_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_mahallas_code" ON "mahallas" ("code")`,
    );

    await queryRunner.query(
      `ALTER TABLE "construction_objects" ADD COLUMN "mahalla_id" uuid`,
    );
    await queryRunner.query(`
      ALTER TABLE "construction_objects"
        ADD CONSTRAINT "fk_objects_mahalla"
        FOREIGN KEY ("mahalla_id") REFERENCES "mahallas"("id") ON DELETE SET NULL
    `);
    /* Mahalla kesimidagi statistika AYNAN shu indeks ustida ishlaydi —
       tuman xaritasi har ochilganda shu so'rov yuboriladi. */
    await queryRunner.query(
      `CREATE INDEX "idx_objects_mahalla" ON "construction_objects" ("mahalla_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_objects_mahalla"`);
    await queryRunner.query(
      `ALTER TABLE "construction_objects" DROP CONSTRAINT IF EXISTS "fk_objects_mahalla"`,
    );
    await queryRunner.query(
      `ALTER TABLE "construction_objects" DROP COLUMN IF EXISTS "mahalla_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "mahallas"`);
  }
}
