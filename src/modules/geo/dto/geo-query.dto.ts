import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { toArray } from '../../../common/dto/transforms';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ObjectHealth } from '../../../common/constants/enums';

export class DistrictStatsQueryDto {
  @ApiPropertyOptional({
    description: 'Viloyat id — berilmasa birinchi faol viloyat',
  })
  @IsUUID('4')
  @IsOptional()
  regionId?: string;

  @ApiPropertyOptional({ description: 'Reja bo‘yicha topshiriladigan yil' })
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsInt()
  @Min(2000)
  @Max(2100)
  @IsOptional()
  year?: number;

  @ApiPropertyOptional({ description: 'Yil oralig‘i boshi' })
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsInt()
  @Min(2000)
  @Max(2100)
  @IsOptional()
  yearFrom?: number;

  @ApiPropertyOptional({ description: 'Yil oralig‘i oxiri' })
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsInt()
  @Min(2000)
  @Max(2100)
  @IsOptional()
  yearTo?: number;

  @ApiPropertyOptional({
    isArray: true,
    type: String,
    description: 'Qurilish turi id(lar)i',
  })
  @Transform(toArray)
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  typeIds?: string[];

  @ApiPropertyOptional({ enum: ObjectHealth, isArray: true })
  @Transform(toArray)
  @IsArray()
  @IsEnum(ObjectHealth, { each: true })
  @IsOptional()
  health?: ObjectHealth[];
}
