import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { toNumber, trim } from '../../../common/dto/transforms';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MilestoneStatus } from '../../../common/constants/enums';

export class CreateMilestoneDto {
  @ApiProperty({ example: 'Poydevor ishlari' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string;

  @ApiProperty({ example: '2025-03-01' })
  @IsDateString({}, { message: 'Bosqich boshlanish sanasi noto‘g‘ri' })
  plannedStart!: string;

  @ApiProperty({ example: '2025-05-15' })
  @IsDateString({}, { message: 'Bosqich tugash sanasi noto‘g‘ri' })
  plannedEnd!: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  actualStart?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  actualEnd?: string;

  @ApiProperty({ example: 15, description: 'Umumiy bajarilishdagi ulushi, %' })
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  @Max(100)
  weight!: number;

  @ApiPropertyOptional({ example: 0 })
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  progressPercent?: number;

  @ApiPropertyOptional({ enum: MilestoneStatus })
  @IsEnum(MilestoneStatus)
  @IsOptional()
  status?: MilestoneStatus;

  @ApiPropertyOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({
    example: 12,
    description: 'Shu bosqichga biriktirilgan ishchilar soni',
  })
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  @Max(10000)
  @IsOptional()
  workerCount?: number;
}

export class UpdateMilestoneDto extends PartialType(CreateMilestoneDto) {}

/**
 * Bosqichlarni BIRDANIGA almashtirish.
 * ⚠️ Yamash emas, O‘RNIGA QO‘YISH: ulushlar yig‘indisi 100 bo‘lishi
 * kerakligini faqat to‘liq ro‘yxatni ko‘rib tekshirib bo‘ladi.
 */
export class ReplaceMilestonesDto {
  @ApiProperty({ type: [CreateMilestoneDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Kamida bitta bosqich bo‘lishi kerak' })
  @ArrayMaxSize(50, { message: 'Bosqichlar soni 50 tadan oshmasligi kerak' })
  @ValidateNested({ each: true })
  @Type(() => CreateMilestoneDto)
  milestones!: CreateMilestoneDto[];
}

export class CalendarQueryDto {
  @ApiPropertyOptional({ example: 2026 })
  @Transform(toNumber)
  @IsInt()
  @Min(2000)
  @Max(2100)
  @IsOptional()
  year?: number;

  @ApiPropertyOptional({ example: 11, description: '1–12' })
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(12)
  @IsOptional()
  month?: number;

  @ApiPropertyOptional()
  @IsUUID('4')
  @IsOptional()
  districtId?: string;

  @ApiPropertyOptional()
  @IsUUID('4')
  @IsOptional()
  objectId?: string;
}

/**
 * BOSQICHNI TOPSHIRISH.
 *
 * ⚠️ SURAT MAJBURIY (`ArrayMinSize(1)`) — va bu qoida mijozda emas,
 * SHU YERDA yashaydi. Topshirish fakt yozadi: «poydevor quyildi» degan
 * yozuv dalilsiz qolsa, keyinroq uni tekshirib bo‘lmaydi va butun
 * fotoarxivning mohiyati yo‘qoladi.
 */
export class SubmitMilestoneDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'Avval `POST /files/upload-many` orqali yuklangan fayl id lari',
  })
  @IsArray()
  @ArrayMinSize(1, {
    message: 'Topshirish uchun kamida bitta surat biriktirilishi shart',
  })
  @ArrayMaxSize(10, {
    message: 'Bir topshiruvga 10 tadan ko‘p surat biriktirib bo‘lmaydi',
  })
  @IsUUID('4', { each: true })
  fileIds!: string[];

  @ApiPropertyOptional({
    example: 100,
    description:
      'Bosqichning bajarilishi, %. Berilmasa — 100 (to‘liq topshirildi)',
  })
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  progressPercent?: number;

  @ApiPropertyOptional({ description: 'Qanday ishlar bajarildi' })
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({
    description: 'Surat olingan vaqt (EXIF). Berilmasa — hozir.',
  })
  @IsDateString()
  @IsOptional()
  capturedAt?: string;

  @ApiPropertyOptional()
  @Transform(toNumber)
  @IsLatitude()
  @IsOptional()
  lat?: number;

  @ApiPropertyOptional()
  @Transform(toNumber)
  @IsLongitude()
  @IsOptional()
  lng?: number;

  @ApiPropertyOptional({
    example: 12,
    description: 'Shu topshiruvda maydonda bo‘lgan ishchilar soni',
  })
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  @Max(10000)
  @IsOptional()
  workerCount?: number;

  @ApiPropertyOptional({
    example: '2026-11-03',
    description: 'Ish aslida qachon tugagani. Berilmasa — bugun.',
  })
  @IsDateString()
  @IsOptional()
  actualEnd?: string;
}
