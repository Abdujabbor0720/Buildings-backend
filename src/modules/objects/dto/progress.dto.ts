import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { trim } from '../../../common/dto/transforms';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AddProgressDto {
  @ApiProperty({ example: 68, minimum: 0, maximum: 100 })
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsNumber({}, { message: 'Bajarilish son bo‘lishi kerak' })
  @Min(0, { message: 'Bajarilish 0% dan kichik bo‘la olmaydi' })
  @Max(100, { message: 'Bajarilish 100% dan katta bo‘la olmaydi' })
  progressPercent!: number;

  @ApiPropertyOptional({
    example: '2026-10-29',
    description: 'Berilmasa — bugun',
  })
  @IsDateString({}, { message: 'Hisobot sanasi noto‘g‘ri' })
  @IsOptional()
  reportDate?: string;

  @ApiPropertyOptional({ example: 'Tom yopish ishlari yakunlandi' })
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  note?: string;
}
