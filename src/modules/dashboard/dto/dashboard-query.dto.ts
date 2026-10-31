import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { toArray, toNumber } from '../../../common/dto/transforms';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

const bool = ({ value }: { value: unknown }) => {
  if (value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  return value === 'true' || value === '1';
};

/**
 * Dashboard filtri — header'dagi boshqaruvlar bilan AYNI:
 * viloyat / tuman tanlovi va yil oralig‘i («2024 – 2027»).
 */
export class DashboardQueryDto {
  @ApiPropertyOptional({ description: 'Berilmasa — birinchi faol viloyat' })
  @IsUUID('4')
  @IsOptional()
  regionId?: string;

  @ApiPropertyOptional({ isArray: true, type: String })
  @Transform(toArray)
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  districtIds?: string[];

  @ApiPropertyOptional({ isArray: true, type: String })
  @Transform(toArray)
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  typeIds?: string[];

  @ApiPropertyOptional({
    example: 2024,
    description: 'Reja muddati shu yildan',
  })
  @Transform(toNumber)
  @IsInt()
  @Min(2000)
  @Max(2100)
  @IsOptional()
  yearFrom?: number;

  @ApiPropertyOptional({
    example: 2027,
    description: 'Reja muddati shu yilgacha',
  })
  @Transform(toNumber)
  @IsInt()
  @Min(2000)
  @Max(2100)
  @IsOptional()
  yearTo?: number;

  /**
   * ⚠️ Sukut bo‘yicha FAQAT FAOL obyektlar sanaladi (topshirilgan va bekor
   * qilinganlar tashqarida). Dashboard «hozir nima bo‘lyapti» degan savolga
   * javob beradi; topshirilgan obyekt esa nazoratdan chiqqan va uni
   * «kechikayotgan» bilan bir ustunda ko‘rsatish raqamlarni buzardi.
   */
  @ApiPropertyOptional({
    default: false,
    description: 'Topshirilganlarni ham qo‘shish',
  })
  @Transform(bool)
  @IsBoolean()
  @IsOptional()
  includeCompleted?: boolean;
}
