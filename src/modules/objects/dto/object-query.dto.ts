import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  toArray,
  toNumber,
  toOptionalBoolean,
} from '../../../common/dto/transforms';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import {
  ObjectHealth,
  ObjectStatus,
  RiskLevel,
} from '../../../common/constants/enums';

/** Obyektlar ro‘yxati filtri. Barcha maydonlar ixtiyoriy va birga ishlaydi. */
export class ObjectQueryDto extends PaginationDto {
  @ApiPropertyOptional() @IsUUID('4') @IsOptional() regionId?: string;

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

  @ApiPropertyOptional({ enum: ObjectHealth, isArray: true })
  @Transform(toArray)
  @IsArray()
  @IsEnum(ObjectHealth, { each: true })
  @IsOptional()
  health?: ObjectHealth[];

  @ApiPropertyOptional({ enum: ObjectStatus, isArray: true })
  @Transform(toArray)
  @IsArray()
  @IsEnum(ObjectStatus, { each: true })
  @IsOptional()
  status?: ObjectStatus[];

  @ApiPropertyOptional({ enum: RiskLevel, isArray: true })
  @Transform(toArray)
  @IsArray()
  @IsEnum(RiskLevel, { each: true })
  @IsOptional()
  riskLevel?: RiskLevel[];

  @ApiPropertyOptional() @IsUUID('4') @IsOptional() contractorId?: string;
  @ApiPropertyOptional() @IsUUID('4') @IsOptional() customerId?: string;
  @ApiPropertyOptional() @IsUUID('4') @IsOptional() responsibleId?: string;
  @ApiPropertyOptional() @IsUUID('4') @IsOptional() fundingSourceId?: string;
  @ApiPropertyOptional() @IsUUID('4') @IsOptional() delayReasonId?: string;

  @ApiPropertyOptional({ description: 'Reja bo‘yicha topshirish yili' })
  @Transform(toNumber)
  @IsInt()
  @Min(2000)
  @Max(2100)
  @IsOptional()
  year?: number;

  @ApiPropertyOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(2000)
  @Max(2100)
  @IsOptional()
  yearFrom?: number;

  @ApiPropertyOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(2000)
  @Max(2100)
  @IsOptional()
  yearTo?: number;

  @ApiPropertyOptional({ description: 'Bajarilish, % dan' })
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  progressFrom?: number;

  @ApiPropertyOptional({ description: 'Bajarilish, % gacha' })
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  progressTo?: number;

  @ApiPropertyOptional({ description: 'Qiymati shundan katta, so‘m' })
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  @IsOptional()
  costFrom?: number;

  @ApiPropertyOptional({ description: 'Qiymati shundan kichik, so‘m' })
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  @IsOptional()
  costTo?: number;

  @ApiPropertyOptional({ description: 'Faqat kechikkanlar (delayDays > 0)' })
  @Transform(toOptionalBoolean)
  @IsBoolean()
  @IsOptional()
  onlyDelayed?: boolean;

  @ApiPropertyOptional({ description: 'Faqat ochiq muammosi borlar' })
  @Transform(toOptionalBoolean)
  @IsBoolean()
  @IsOptional()
  hasOpenDelays?: boolean;

  @ApiPropertyOptional({
    description: 'Shuncha kun ichida topshirilishi kerak',
  })
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(3650)
  @IsOptional()
  dueWithinDays?: number;
}
