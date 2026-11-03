import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ISH REJASI — BOSQICHNI TOPSHIRISH VA BOSQICH BO‘YICHA AI TAHLILI.
 *
 * Uch narsa qo‘shiladi:
 *
 *   1. `object_milestones` — bosqichga biriktirilgan ISHCHILAR SONI va
 *      TOPSHIRISH izlari (kim, qachon, izoh, nechta hisobot).
 *   2. `photo_reports.milestone_id` — surat qaysi BOSQICHNI topshirgani.
 *      `milestone_percent` esa shu bosqichning o‘z foizi: `progress_percent`
 *      obyektning natijaviy foizini saqlaydi (moderator tasdiqlaganda aynan
 *      u qo‘llanadi), ikkalasi bitta ustunga yig‘ilsa «poydevor 100%»
 *      hisoboti butun obyektni 100% qilib qo‘yardi.
 *   3. `ai_analyses.milestone_id` — bosqich tahlili obyekt tahlili bilan
 *      aralashmasligi uchun.
 *
 * ⚠️ HAMMA USTUN NULLABLE va sukut qiymatli: jadvallarda allaqachon
 * ma’lumot bor va migratsiya ularni qayta yozmasligi kerak.
 */
export class MilestoneSubmission1793512800000 implements MigrationInterface {
  name = 'MilestoneSubmission1793512800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "object_milestones"
        ADD COLUMN "worker_count" smallint,
        ADD COLUMN "submitted_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN "submitted_by_id" uuid,
        ADD COLUMN "submission_note" text,
        ADD COLUMN "report_count" smallint NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "object_milestones"
        ADD CONSTRAINT "fk_milestones_submitted_by"
        FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "photo_reports"
        ADD COLUMN "milestone_id" uuid,
        ADD COLUMN "milestone_percent" numeric(5,2)
    `);
    /*
     * ⚠️ `SET NULL`, `CASCADE` EMAS. Bosqich o‘chirilganda surat obyekt
     * arxivida QOLISHI kerak: u bajarilgan ishning dalili va reja
     * o‘zgargani uni yolg‘onga aylantirmaydi.
     */
    await queryRunner.query(`
      ALTER TABLE "photo_reports"
        ADD CONSTRAINT "fk_photo_reports_milestone"
        FOREIGN KEY ("milestone_id") REFERENCES "object_milestones"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_photo_reports_milestone" ON "photo_reports" ("milestone_id")`,
    );

    await queryRunner.query(`
      ALTER TABLE "ai_analyses" ADD COLUMN "milestone_id" uuid
    `);
    /*
     * Bu yerda esa `CASCADE`: tahlil — bosqich HAQIDAGI fikr, bosqich
     * yo‘q bo‘lsa uning o‘zi ham ma’nosiz.
     */
    await queryRunner.query(`
      ALTER TABLE "ai_analyses"
        ADD CONSTRAINT "fk_ai_analyses_milestone"
        FOREIGN KEY ("milestone_id") REFERENCES "object_milestones"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_ai_analyses_milestone" ON "ai_analyses" ("milestone_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ai_analyses_milestone"`);
    await queryRunner.query(
      `ALTER TABLE "ai_analyses" DROP CONSTRAINT IF EXISTS "fk_ai_analyses_milestone"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_analyses" DROP COLUMN IF EXISTS "milestone_id"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_photo_reports_milestone"`,
    );
    await queryRunner.query(
      `ALTER TABLE "photo_reports" DROP CONSTRAINT IF EXISTS "fk_photo_reports_milestone"`,
    );
    await queryRunner.query(`
      ALTER TABLE "photo_reports"
        DROP COLUMN IF EXISTS "milestone_percent",
        DROP COLUMN IF EXISTS "milestone_id"
    `);

    await queryRunner.query(
      `ALTER TABLE "object_milestones" DROP CONSTRAINT IF EXISTS "fk_milestones_submitted_by"`,
    );
    await queryRunner.query(`
      ALTER TABLE "object_milestones"
        DROP COLUMN IF EXISTS "report_count",
        DROP COLUMN IF EXISTS "submission_note",
        DROP COLUMN IF EXISTS "submitted_by_id",
        DROP COLUMN IF EXISTS "submitted_at",
        DROP COLUMN IF EXISTS "worker_count"
    `);
  }
}
