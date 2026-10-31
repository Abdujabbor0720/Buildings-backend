import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * QIDIRUV INDEKSLARI.
 *
 * Obyektlar ro‘yxatidagi qidiruv `ILIKE '%matn%'` bilan ishlaydi — bunday
 * shablonni oddiy B-tree indeks TEZLASHTIRMAYDI (u faqat prefiksda ishlaydi)
 * va PostgreSQL har safar butun jadvalni ko‘rib chiqadi. 200 ta obyektda bu
 * sezilmaydi, 50 000 da esa qidiruv sekunlab cho‘ziladi.
 *
 * `pg_trgm` + GIN indeks aynan shu holat uchun: matn uch harfli bo‘laklarga
 * bo‘linadi va ixtiyoriy o‘rindagi qism bo‘yicha qidiruv indeksdan foydalanadi.
 */
export class SearchIndexes1793347618500 implements MigrationInterface {
  name = 'SearchIndexes1793347618500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    /*
     * ⚠️ Indeks USTUN ustida emas, `COALESCE(ustun, '')` IFODASI ustida
     * quriladi. Sabab texnik: TypeORM'ning `migration:generate` buyrug‘i
     * bazadagi USTUN indekslarini entity metadata bilan solishtiradi va
     * o‘zi bilmaganini «ortiqcha» deb topib, oddiy B-tree bilan
     * ALMASHTIRIB yuboradi — qidiruv esa jimgina sekinlashadi.
     * IFODA indekslarini esa u umuman ko‘rmaydi va tegmaydi.
     *
     * Semantika o‘zgarmaydi: `NULL` hech qachon `ILIKE` ga mos kelmaydi,
     * demak `COALESCE(col,'') ILIKE p` ≡ `col ILIKE p`.
     * ⚠️ Shu sababli SO‘ROVLAR HAM aynan shu ifoda bilan yoziladi —
     * aks holda indeks ishlatilmaydi (`objects.service.ts` ga qarang).
     */
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_objects_name_trgm
         ON construction_objects USING gin ((COALESCE(name, '')) gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_objects_address_trgm
         ON construction_objects USING gin ((COALESCE(address, '')) gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_objects_code_trgm
         ON construction_objects USING gin ((COALESCE(code, '')) gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_contractors_name_trgm
         ON contractors USING gin ((COALESCE(name, '')) gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_users_name_trgm
         ON users USING gin ((first_name || ' ' || last_name) gin_trgm_ops)`,
    );

    // Dashboard «Muddatlar bo‘yicha» so‘rovi `EXTRACT(YEAR FROM ...)`
    // bo‘yicha guruhlaydi — oddiy ustun indeksi bunga yaramaydi.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_objects_planned_end_year
         ON construction_objects ((EXTRACT(YEAR FROM planned_end_date)))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_objects_planned_end_year`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_name_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_contractors_name_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_objects_code_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_objects_address_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_objects_name_trgm`);
    // ⚠️ `pg_trgm` kengaytmasi O‘CHIRILMAYDI: uni boshqa migratsiyalar
    // yoki qo‘lda yozilgan so‘rovlar ham ishlatayotgan bo‘lishi mumkin.
  }
}
