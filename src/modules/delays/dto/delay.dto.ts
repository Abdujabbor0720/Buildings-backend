import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
  OmitType,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { toArray, toNumber, trim } from '../../../common/dto/transforms';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DelayStatus, RiskLevel } from '../../../common/constants/enums';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateDelayDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'Obyekt tanlanmagan' })
  objectId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'Kechikish sababi tanlanmagan' })
  reasonId!: string;

  @ApiProperty({
    example: 42,
    description: 'Shu sabab keltirgan kechikish, kun',
  })
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  @Max(3650)
  delayDays!: number;

  @ApiPropertyOptional({ enum: RiskLevel, default: RiskLevel.MEDIUM })
  @IsEnum(RiskLevel)
  @IsOptional()
  severity?: RiskLevel;

  @ApiProperty({ example: 'Qurilish materiallari yetkazib berilmadi' })
  @Transform(trim)
  @IsString()
  @MinLength(10, { message: 'Izoh kamida 10 belgidan iborat bo‘lishi kerak' })
  @MaxLength(2000)
  description!: string;

  @ApiPropertyOptional({
    example: 'Yangi yetkazib beruvchi bilan shartnoma tuzilmoqda',
  })
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  mitigationPlan?: string;

  @ApiPropertyOptional({ description: 'Berilmasa — bugun' })
  @IsDateString()
  @IsOptional()
  detectedAt?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  responsibleId?: string;
}

export class UpdateDelayDto extends PartialType(
  OmitType(CreateDelayDto, ['objectId'] as const),
) {
  @ApiPropertyOptional({ enum: DelayStatus })
  @IsEnum(DelayStatus)
  @IsOptional()
  status?: DelayStatus;
}

export class ResolveDelayDto {
  @ApiProperty({ example: 'Materiallar yetkazildi, ish qayta boshlandi' })
  @Transform(trim)
  @IsString()
  @MinLength(5, { message: 'Hal qilish izohi majburiy' })
  @MaxLength(2000)
  resolution!: string;

  @ApiPropertyOptional({ description: 'Berilmasa — bugun' })
  @IsDateString()
  @IsOptional()
  resolvedAt?: string;
}

export class DelayQueryDto extends PaginationDto {
  @ApiPropertyOptional() @IsUUID('4') @IsOptional() objectId?: string;
  @ApiPropertyOptional() @IsUUID('4') @IsOptional() districtId?: string;
  @ApiPropertyOptional() @IsUUID('4') @IsOptional() reasonId?: string;
  @ApiPropertyOptional() @IsUUID('4') @IsOptional() responsibleId?: string;

  @ApiPropertyOptional({ enum: DelayStatus, isArray: true })
  @Transform(toArray)
  @IsArray()
  @IsEnum(DelayStatus, { each: true })
  @IsOptional()
  status?: DelayStatus[];

  @ApiPropertyOptional({ enum: RiskLevel, isArray: true })
  @Transform(toArray)
  @IsArray()
  @IsEnum(RiskLevel, { each: true })
  @IsOptional()
  severity?: RiskLevel[];

  @ApiPropertyOptional({ description: 'Kamida shuncha kun kechikkan' })
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  @IsOptional()
  minDelayDays?: number;
}
