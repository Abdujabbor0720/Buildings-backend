import { AppDataSource } from '../../config/data-source';
import { runBootstrap } from './bootstrap.helpers';

/**
 * BOSHLANG‘ICH MA’LUMOTNI QO‘LDA YOZISH.
 *
 * Odatda kerak emas: ilova ko‘tarilganda `BootstrapService` buni o‘zi
 * bajaradi. Bu skript ikki holat uchun qoladi:
 *   • serverni qayta ishga tushirmasdan administrator qo‘shish kerak;
 *   • nima yozilishini AVVAL ko‘rib olmoqchisiz (CI, lokal tekshiruv).
 *
 * ⚠️ `npm run seed` BILAN CHALKASHMASIN. Seed — demo ma’lumot generatori:
 * u 23 ta jadvalni `TRUNCATE ... CASCADE` qilib boshlanadi, ya’ni prod
 * bazada ishga tushirilsa haqiqiy ma’lumotni o‘chirib yuboradi. Bu skript
 * esa hech narsani o‘chirmaydi — faqat YO‘Q narsani qo‘shadi.
 *
 * Ishga tushirish:
 *   npm run bootstrap
 *   ADMIN_EMAIL=admin@andijon.uz ADMIN_PASSWORD='...' npm run bootstrap
 */
async function main(): Promise<void> {
  console.log('\n🚀 Bootstrap boshlandi\n' + '─'.repeat(64));

  const ds = await AppDataSource.initialize();
  try {
    // Lock'siz: CLI'ni odam qo‘lda ishga tushiradi, ilova esa o‘z
    // navbatida `runBootstrapLocked` ni chaqiradi — ikkalasi bir vaqtda
    // kelsa, jadval tekshiruvlari baribir bitta tranzaksiya ichida.
    const report = await ds.transaction((em) =>
      runBootstrap(em, {
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
        firstName: process.env.ADMIN_FIRST_NAME,
        lastName: process.env.ADMIN_LAST_NAME,
        phone: process.env.ADMIN_PHONE,
      }),
    );

    for (const line of report.lines) console.log(`  • ${line}`);

    if (report.adminCreated) {
      console.log(`\n👤 Administrator: ${report.adminCreated}`);
      console.log('   Birinchi kirishdan keyin parolni almashtiring.');
    }

    if (report.adminMissing) {
      console.log(
        '\n⚠️  TIZIMGA KIRIB BO‘LMAYDI — bazada super_admin yo‘q.\n' +
          '   .env ga ADMIN_EMAIL va ADMIN_PASSWORD qo‘shing (server ko‘tarilganda\n' +
          '   o‘zi yaratiladi), yoki shu yerda bering:\n\n' +
          "   ADMIN_EMAIL=admin@andijon.uz ADMIN_PASSWORD='kuchliParol123' npm run bootstrap",
      );
    }

    console.log('\n' + '─'.repeat(64));
    console.log('✅ Bootstrap tugadi\n');
  } finally {
    await ds.destroy();
  }
}

main().catch((err: unknown) => {
  console.error('\n❌ Bootstrap yiqildi:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
