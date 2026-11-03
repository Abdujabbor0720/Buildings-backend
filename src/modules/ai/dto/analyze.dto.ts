import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
} from 'class-validator';

/**
 * TANLANGAN OBYEKTLARNI TAHLIL QILISH.
 *
 * ⚠️ `ArrayMaxSize` MAJBURIY: har obyekt uchun bir nechta so‘rov va
 * yozuv bajariladi. Chegarasiz ro‘yxat yuborilsa, bitta bosish butun
 * bazani aylanib, so‘rov vaqtini tugatardi — «hammasini tahlil qilish»
 * uchun alohida, fon rejimidagi yo‘l bor (`POST /ai/run`).
 */
export class AnalyzeManyDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Kamida bitta obyekt tanlanishi kerak' })
  @ArrayMaxSize(50, {
    message:
      'Bir vaqtda 50 tadan ko‘p obyekt tahlil qilinmaydi — «Hammasini tahlil qilish» dan foydalaning',
  })
  @IsUUID('4', { each: true })
  objectIds!: string[];

  @ApiPropertyOptional({
    default: false,
    description: 'Har obyektning bosqichlari ham tahlil qilinsinmi',
  })
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  @IsOptional()
  withMilestones?: boolean;
}
