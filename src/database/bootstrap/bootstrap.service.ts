import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runBootstrapLocked } from './bootstrap.helpers';

/**
 * ILOVA KO‘TARILGANDA BOSHLANG‘ICH MA’LUMOTNI TEKSHIRADI.
 *
 * Migratsiyalar faqat SXEMA yaratadi — yangi serverda na viloyat, na
 * tumanlar, na kataloglar, na birorta foydalanuvchi bo‘ladi. Natijada
 * sayt ochiladi-yu, hech kim kira olmaydi va obyekt yaratish formasi
 * bo‘sh ro‘yxatlar ko‘rsatadi. Shu bo‘shliq deploy’dan keyin QO‘LDA
 * buyruq yozishni talab qilardi; endi ilova o‘zi to‘ldiradi.
 *
 * ⚠️ MAVJUD MA’LUMOTGA TEGILMAYDI. Har bo‘lim alohida tekshiriladi va
 * faqat YO‘Q narsa qo‘shiladi, shuning uchun bu har ishga tushishda
 * bajarilsa ham xavfsiz.
 *
 * ⚠️ XATOLIK ILOVANI YIQITMAYDI. Bo‘sh baza — jiddiy, lekin API’ning
 * qolgan qismi baribir ishlaydi; bootstrap yiqilgani uchun butun
 * serverni ko‘tarmaslik «sayt umuman ochilmayapti» degan kattaroq
 * nosozlikka aylanardi. Xato jurnalga BALAND ovozda yoziladi.
 */
@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Bootstrap');

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Testlarda baza holatini test o‘zi tayyorlaydi — aralashmaymiz.
    if (this.config.get<string>('env') === 'test') return;

    try {
      // ⚠️ BITTA TRANZAKSIYA: advisory lock ham shu tranzaksiyaga bog‘langan
      // (`pg_try_advisory_xact_lock`), ya’ni tranzaksiya tugashi bilan o‘zi
      // bo‘shaydi — qo‘lda bo‘shatishni unutib qolish imkoni yo‘q.
      const report = await this.ds.transaction((em) =>
        runBootstrapLocked(em, {
          email: this.config.get<string>('admin.email'),
          password: this.config.get<string>('admin.password'),
          firstName: this.config.get<string>('admin.firstName'),
          lastName: this.config.get<string>('admin.lastName'),
          phone: this.config.get<string>('admin.phone'),
        }),
      );

      if (!report) {
        this.logger.log('Boshqa nusxa tekshirmoqda — o‘tkazib yuborildi');
        return;
      }

      this.logger.log(report.lines.join(' | '));

      if (report.adminCreated) {
        this.logger.warn(
          `Administrator YARATILDI: ${report.adminCreated}. ` +
            'Parol — .env dagi ADMIN_PASSWORD. Birinchi kirishdan keyin almashtiring.',
        );
      }

      if (report.adminMissing) {
        this.logger.error(
          'TIZIMGA KIRIB BO‘LMAYDI: bazada birorta super_admin yo‘q va ' +
            '.env da ADMIN_EMAIL / ADMIN_PASSWORD berilmagan. ' +
            'Ikkalasini qo‘shib serverni qayta ishga tushiring.',
        );
      }
    } catch (err) {
      this.logger.error(
        `Boshlang‘ich ma’lumot yozilmadi: ${err instanceof Error ? err.message : String(err)}. ` +
          'Server ishlashda davom etadi, lekin baza to‘liq bo‘lmasligi mumkin.',
      );
    }
  }
}
