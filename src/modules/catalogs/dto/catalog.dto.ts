import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { trim, trimLower } from '../../../common/dto/transforms';
import {
  IsBoolean,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCatalogItemDto {
  @ApiProperty({
    example: 'education',
    description: 'Lotin harflari, raqam va pastki chiziq',
  })
  @Transform(trimLower)
  @Matches(/^[a-z0-9_]+$/, {
    message:
      'Kod faqat kichik lotin harflari, raqam va pastki chiziqdan iborat bo‘lishi kerak',
  })
  @MinLength(2)
  @MaxLength(40)
  code!: string;

  @ApiProperty({ example: 'Ta’lim muassasalari' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Nomi kamida 2 belgidan iborat bo‘lishi kerak' })
  @MaxLength(150)
  name!: string;

  @ApiProperty({ example: '#2563EB' })
  @IsHexColor({
    message: 'Rang HEX formatida bo‘lishi kerak (masalan #2563EB)',
  })
  color!: string;

  @ApiPropertyOptional({ example: 'graduation-cap' })
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional({ default: 0 })
  @Transform(({ value }) =>
    value === undefined || value === '' ? 0 : Number(value),
  )
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateCatalogItemDto extends PartialType(CreateCatalogItemDto) {}
