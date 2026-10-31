import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SURAT TAHLILI — AI NATIJASI UCHUN USTUNLAR.
 *
 * Foto-hisobotda allaqachon `ai_verdict` / `ai_confidence` bor, lekin ular
 * QOIDALAR dvigateli natijasi: surat qachon va qayerda olingani, bajarilish
 * sakrashi. Ular suratning ICHIGA qaramaydi.
 *
 * Bu yerda qo‘shiladigan ustunlar — model suratdan BAHOLAGAN bajarilish:
 *   • `ai_estimated_progress` — modelning bahosi, %;
 *   • `ai_analysis`           — to‘liq tahlil (bosqich, bajarilgan/qolgan ishlar);
 *   • `ai_vision_status`      — tahlil holati (navbatda / tayyor / mumkin emas);
 *   • `ai_attempts`           — urinishlar soni, cheksiz qayta urinishning oldini oladi.
 *
 * ⚠️ `ai_confidence` QAYTA ISHLATILMAYDI: u metama’lumotga ishonch, bu esa
 * suratdan baholash ishonchi. Bitta ustunga ikkalasini yozsak, «surat eski»
 * bilan «surat loyqa» bir xil ko‘rinardi.
 */
export class PhotoVisionAnalysis1793424974000 implements MigrationInterface {
  name = 'PhotoVisionAnalysis1793424974000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "photo_reports"
        ADD COLUMN "ai_estimated_progress" numeric(5,2),
        ADD COLUMN "ai_analysis" jsonb,
        ADD COLUMN "ai_model" character varying(80),
        ADD COLUMN "ai_vision_status" character varying(20) NOT NULL DEFAULT 'pending',
        ADD COLUMN "ai_vision_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN "ai_attempts" smallint NOT NULL DEFAULT 0
    `);

    /*
     * Navbatni tanlaydigan cron: `WHERE ai_vision_status IN (...)
     * ORDER BY created_at`. Kompozit indeks aynan shu shaklga mos.
     *
     * ⚠️ QISMAN indeks (`WHERE ...`) ATAYLAB ishlatilmadi: TypeORM uni
     * entity metadata'sida ifodalay olmaydi va `migration:generate`
     * keyingi safar uni «ortiqcha» deb o‘chirib yuborardi.
     */
    await queryRunner.query(`
      CREATE INDEX "idx_photo_reports_vision_queue"
        ON "photo_reports" ("ai_vision_status", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_photo_reports_vision_queue"`,
    );
    await queryRunner.query(`
      ALTER TABLE "photo_reports"
        DROP COLUMN "ai_attempts",
        DROP COLUMN "ai_vision_at",
        DROP COLUMN "ai_vision_status",
        DROP COLUMN "ai_model",
        DROP COLUMN "ai_analysis",
        DROP COLUMN "ai_estimated_progress"
    `);
  }
}
