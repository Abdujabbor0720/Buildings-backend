import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { toUpperCase, trim } from '../../../common/dto/transforms';
import { DashboardQueryDto } from './dashboard-query.dto';

/**
 * BOSH SAHIFADAGI OLTITA KO‘RSATKICH — har biri alohida sahifa.
 *
 * ⚠️ Kalitlar URL'da ko‘rinadi (`/kpi/at-risk`), shuning uchun ular
 * DEFIS bilan yoziladi va O‘ZGARMAYDI: hokimlik xodimlari sahifani
 * saqlab qo‘yadi va havola keyin ham ochilishi kerak.
 *
 * ⚠️ `TOTAL` va `COST` AYNI to‘plam ustida ishlaydi — farq faqat
 * sarlavhadagi raqamda (soni yoki summasi). Ikkalasini bitta sahifaga
 * yig‘ib bo‘lmaydi: kartalar ham ikkita va foydalanuvchi qaysi
 * kartani bosgan bo‘lsa, o‘sha savolga javob kutadi.
 */
export enum KpiMetric {
  /** «Jami obyektlar» */
  TOTAL = 'total',
  /** «Reja asosida» = on_schedule + not_started */
  ON_PLAN = 'on-plan',
  /** «Kechikayotgan» */
  DELAYED = 'delayed',
  /** «Xavfli holatda» */
  AT_RISK = 'at-risk',
  /** «Joriy yil yakunlanadi» */
  COMPLETING = 'completing',
  /** «Umumiy qiymat» */
  COST = 'cost',
}

export const KPI_METRICS: readonly KpiMetric[] = Object.values(KpiMetric);

/**
 * Ko‘rsatkich sahifasidagi OBYEKTLAR RO‘YXATI so‘rovi.
 *
 * ⚠️ `DashboardQueryDto` dan MEROS OLADI, `PaginationDto` dan emas.
 * Sahifalash maydonlari inert — ular raqamlarga ta’sir qilmaydi;
 * filtr maydonlari esa aksincha, kartadagi son bilan ro‘yxatdagi
 * sonni bog‘lab turadi. Shuning uchun nusxa ko‘chirish xavfi kamroq
 * tomonga tanlandi: filtr bitta joyda (`DashboardQueryDto`) qoladi.
 */
export class KpiMetricObjectsQueryDto extends DashboardQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Transform(({ value }) =>
    value === undefined || value === '' ? 1 : Number(value),
  )
  @IsInt({ message: 'page butun son bo‘lishi kerak' })
  @Min(1, { message: 'page 1 dan kichik bo‘la olmaydi' })
  @IsOptional()
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 200 })
  @Transform(({ value }) =>
    value === undefined || value === '' ? 20 : Number(value),
  )
  @IsInt({ message: 'limit butun son bo‘lishi kerak' })
  @Min(1)
  @Max(200, { message: 'limit 200 dan katta bo‘la olmaydi' })
  @IsOptional()
  limit = 20;

  @ApiPropertyOptional({ description: 'Nomi, kodi yoki manzili bo‘yicha' })
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description:
      'name | code | district | plannedEndDate | progressPercent | delayDays | riskScore | totalCost',
  })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @Transform(toUpperCase)
  @IsIn(['ASC', 'DESC'])
  @IsOptional()
  sortOrder: 'ASC' | 'DESC' = 'DESC';

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
