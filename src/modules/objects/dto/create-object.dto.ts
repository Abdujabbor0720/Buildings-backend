import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { toMoneyString, trim } from '../../../common/dto/transforms';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ObjectStatus } from '../../../common/constants/enums';

export class CreateObjectDto {
  @ApiProperty({ example: 'Baliqchi tumani 2-son maktab' })
  @Transform(trim)
  @IsString()
  @MinLength(5, {
    message: 'Obyekt nomi kamida 5 belgidan iborat bo‘lishi kerak',
  })
  @MaxLength(300)
  name!: string;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  @IsOptional()
  description?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'Tuman tanlanmagan' })
  districtId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'Qurilish turi tanlanmagan' })
  typeId!: string;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(400)
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: 40.8676 })
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsLatitude({ message: 'Kenglik (lat) qiymati noto‘g‘ri' })
  @IsOptional()
  lat?: number;

  @ApiPropertyOptional({ example: 71.9187 })
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsLongitude({ message: 'Uzunlik (lng) qiymati noto‘g‘ri' })
  @IsOptional()
  lng?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  contractorId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  responsibleId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  fundingSourceId?: string;

  @ApiProperty({
    example: '48500000000.00',
    description: 'Loyiha qiymati, so‘m',
  })
  @Transform(toMoneyString)
  @IsNumberString(
    { no_symbols: false },
    { message: 'Loyiha qiymati son bo‘lishi kerak' },
  )
  totalCost!: string;

  @ApiPropertyOptional({ example: 600 })
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsInt()
  @Min(0)
  @IsOptional()
  capacity?: number;

  @ApiPropertyOptional({ example: 'o‘quvchi o‘rni' })
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  @IsOptional()
  capacityUnit?: string;

  @ApiPropertyOptional({ example: 4820.5 })
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @Min(0)
  @IsOptional()
  areaM2?: number;

  @ApiPropertyOptional({ example: 3 })
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  floors?: number;

  @ApiProperty({ example: '2025-03-01' })
  @IsDateString({}, { message: 'Reja boshlanish sanasi noto‘g‘ri' })
  plannedStartDate!: string;

  @ApiProperty({ example: '2026-12-30' })
  @IsDateString({}, { message: 'Reja tugash sanasi noto‘g‘ri' })
  plannedEndDate!: string;

  @ApiPropertyOptional({ example: '2025-03-14' })
  @IsDateString()
  @IsOptional()
  actualStartDate?: string;

  @ApiPropertyOptional({ example: '2026-11-20' })
  @IsDateString()
  @IsOptional()
  actualEndDate?: string;

  @ApiPropertyOptional({
    enum: ObjectStatus,
    default: ObjectStatus.NOT_STARTED,
  })
  @IsEnum(ObjectStatus)
  @IsOptional()
  status?: ObjectStatus;

  @ApiPropertyOptional({ example: 0, minimum: 0, maximum: 100 })
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @Min(0)
  @Max(100, { message: 'Bajarilish 100% dan oshmasligi kerak' })
  @IsOptional()
  progressPercent?: number;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  @IsOptional()
  coverImageUrl?: string;
}

/**
 * ⚠️ `progressPercent` bu yerda ham bor, lekin uni O‘ZGARTIRISH uchun
 * `POST /objects/:id/progress` ishlatiladi: u tarix yozadi. To‘g‘ridan-to‘g‘ri
 * `PATCH` bilan o‘zgartirilsa, dinamika grafigida sakrash paydo bo‘lib,
 * uning sababi hech qayerda qolmasdi — shuning uchun servis buni rad etadi.
 */
export class UpdateObjectDto extends PartialType(CreateObjectDto) {}
