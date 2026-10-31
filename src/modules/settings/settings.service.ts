import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from '../../database/entities/app-setting.entity';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';

export interface SettingDefinition {
  key: string;
  value: unknown;
  description: string;
  category: string;
}

/**
 * SOZLAMALAR SUKUT QIYMATLARI — yagona manba.
 *
 * ⚠️ Bazada yozuv bo‘lmasa, shu ro‘yxatdagi qiymat qaytadi. Shu sababli
 * yangi sozlama qo‘shish uchun migratsiya SHART EMAS: kod yangilanadi,
 * qiymat o‘z-o‘zidan paydo bo‘ladi. Admin uni o‘zgartirsa — bazaga yoziladi.
 */
export const SETTING_DEFAULTS: SettingDefinition[] = [
  {
    key: 'dashboard.deadlineWarningDays',
    value: 30,
    description: 'Topshirish muddati ogohlantirishi necha kun oldin chiqsin',
    category: 'dashboard',
  },
  {
    key: 'dashboard.defaultYearFrom',
    value: 2024,
    description: 'Bosh sahifadagi yil oralig‘ining boshlanishi',
    category: 'dashboard',
  },
  {
    key: 'dashboard.defaultYearTo',
    value: 2027,
    description: 'Bosh sahifadagi yil oralig‘ining oxiri',
    category: 'dashboard',
  },
  {
    key: 'objects.staleReportDays',
    value: 21,
    description: 'Shuncha kun hisobot kelmasa ogohlantirish chiqadi',
    category: 'objects',
  },
  {
    key: 'photos.requireModeration',
    value: true,
    description:
      'Foto-hisobot bajarilishga ta’sir qilishi uchun tasdiq talab qilinsinmi',
    category: 'photos',
  },
  {
    key: 'photos.maxDistanceMeters',
    value: 500,
    description:
      'Surat obyektdan shuncha metrdan uzoqda bo‘lsa shubhali deb belgilanadi',
    category: 'photos',
  },
  {
    key: 'support.phone',
    value: '1148',
    description: 'Yordam markazi telefon raqami',
    category: 'support',
  },
  {
    key: 'support.workingHours',
    value: '24/7',
    description: 'Yordam markazi ish vaqti',
    category: 'support',
  },
  {
    key: 'app.organizationName',
    value: 'Andijon viloyati hokimligi',
    description: 'Tizim egasi tashkilot nomi',
    category: 'app',
  },
  {
    key: 'app.systemName',
    value: 'Qurilish obyektlari nazorati tizimi',
    description: 'Tizim nomi (sarlavhada ko‘rinadi)',
    category: 'app',
  },
  {
    key: 'app.mobileAppLinks',
    value: {
      telegram: 'https://t.me/shaffofqurilish_bot',
      appStore: 'https://apps.apple.com/',
      googlePlay: 'https://play.google.com/',
    },
    description: 'Mobil ilova va bot havolalari',
    category: 'app',
  },
];

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSetting)
    private readonly settings: Repository<AppSetting>,
    private readonly audit: AuditService,
  ) {}

  /** Barcha sozlamalar — sukut qiymatlar bazadagilar bilan ustma-ust qo‘yiladi. */
  async all(): Promise<SettingDefinition[]> {
    const stored = await this.settings.find();
    const byKey = new Map(stored.map((s) => [s.key, s]));

    const merged = SETTING_DEFAULTS.map((d) => {
      const row = byKey.get(d.key);
      return row ? { ...d, value: row.value } : d;
    });

    // Kodda yo‘q, lekin bazada bor kalitlar ham ko‘rsatiladi — eski
    // sozlama jimgina yo‘qolib qolmasligi kerak.
    for (const row of stored) {
      if (!SETTING_DEFAULTS.some((d) => d.key === row.key)) {
        merged.push({
          key: row.key,
          value: row.value,
          description: row.description ?? '',
          category: row.category,
        });
      }
    }
    return merged;
  }

  /** Kategoriyalar bo‘yicha guruhlangan — sozlamalar sahifasi shu shaklda chizadi. */
  async grouped(): Promise<Record<string, SettingDefinition[]>> {
    const all = await this.all();
    return all.reduce<Record<string, SettingDefinition[]>>((acc, s) => {
      (acc[s.category] ??= []).push(s);
      return acc;
    }, {});
  }

  async get<T = unknown>(key: string): Promise<T> {
    const row = await this.settings.findOne({ where: { key } });
    if (row) return row.value as T;

    const fallback = SETTING_DEFAULTS.find((d) => d.key === key);
    if (!fallback)
      throw new NotFoundException(`«${key}» sozlamasi mavjud emas`);
    return fallback.value as T;
  }

  async set(
    key: string,
    value: unknown,
    actor: AuthUser,
  ): Promise<SettingDefinition> {
    const definition = SETTING_DEFAULTS.find((d) => d.key === key);
    const existing = await this.settings.findOne({ where: { key } });

    if (!definition && !existing) {
      throw new NotFoundException(`«${key}» sozlamasi mavjud emas`);
    }

    if (existing) {
      // `value` — `jsonb`, TypeORM uni `unknown` deb biladi; ustun turi
      // ataylab erkin, shuning uchun bu yerda aniq cast qilinadi.
      await this.settings.update(existing.id, { value: value as object });
    } else {
      await this.settings.save(
        this.settings.create({
          key,
          value,
          description: definition?.description ?? null,
          category: definition?.category ?? 'general',
        }),
      );
    }

    await this.audit.record({
      userId: actor.id,
      action: 'setting.update',
      entity: 'AppSetting',
      entityId: existing?.id ?? null,
      changes: {
        [key]: {
          before: existing?.value ?? definition?.value ?? null,
          after: value,
        },
      },
    });

    return {
      key,
      value,
      description: definition?.description ?? existing?.description ?? '',
      category: definition?.category ?? existing?.category ?? 'general',
    };
  }

  /** Sukut qiymatga qaytarish — bazadagi yozuv o‘chiriladi. */
  async reset(key: string, actor: AuthUser): Promise<SettingDefinition> {
    const definition = SETTING_DEFAULTS.find((d) => d.key === key);
    if (!definition)
      throw new NotFoundException(`«${key}» sozlamasining sukut qiymati yo‘q`);

    await this.settings.delete({ key });
    await this.audit.record({
      userId: actor.id,
      action: 'setting.reset',
      entity: 'AppSetting',
      changes: { [key]: { before: null, after: definition.value } },
    });

    return definition;
  }

  /**
   * ILOVA KONFIGURATSIYASI — login sahifasida ham kerak, shuning uchun
   * OCHIQ. Faqat `app` va `support` kategoriyalari: boshqa sozlamalar
   * (masalan tekshiruv chegaralari) tashqariga chiqmaydi.
   */
  async publicConfig(): Promise<Record<string, unknown>> {
    const all = await this.all();
    return Object.fromEntries(
      all
        .filter((s) => s.category === 'app' || s.category === 'support')
        .map((s) => [s.key, s.value]),
    );
  }
}
