import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { toMoneyString, trim } from '../../../common/dto/transforms';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { FundingTxType } from '../../../common/constants/enums';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class UpsertAllocationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'Obyekt tanlanmagan' })
  objectId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'Moliyalashtirish manbai tanlanmagan' })
  sourceId!: string;

  @ApiProperty({ example: 2026 })
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @ApiProperty({
    example: '12000000000.00',
    description: 'Rejadagi summa, so‘m',
  })
  @Transform(toMoneyString)
  @IsNumberString({}, { message: 'Summa son bo‘lishi kerak' })
  plannedAmount!: string;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  note?: string;
}

export class CreateTransactionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  objectId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Yillik rejaga bog‘lash',
  })
  @IsUUID('4')
  @IsOptional()
  allocationId?: string;

  @ApiProperty({ enum: FundingTxType })
  @IsEnum(FundingTxType, { message: 'Harakat turi noto‘g‘ri' })
  type!: FundingTxType;

  @ApiProperty({
    example: '3500000000.00',
    description: 'Summa. ADJUSTMENT turida manfiy bo‘lishi mumkin.',
  })
  @Transform(toMoneyString)
  @IsNumberString({}, { message: 'Summa son bo‘lishi kerak' })
  amount!: string;

  @ApiProperty({ example: '2026-10-15' })
  @IsDateString({}, { message: 'Sana noto‘g‘ri' })
  occurredAt!: string;

  @ApiPropertyOptional({ example: '№ 318-T' })
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  @IsOptional()
  documentNumber?: string;

  @ApiProperty({
    description: 'Izoh majburiy — pul harakatining sababi qolishi kerak',
  })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  note!: string;
}

export class FundingQueryDto extends PaginationDto {
  @ApiPropertyOptional() @IsUUID('4') @IsOptional() objectId?: string;
  @ApiPropertyOptional() @IsUUID('4') @IsOptional() sourceId?: string;
  @ApiPropertyOptional() @IsUUID('4') @IsOptional() districtId?: string;

  @ApiPropertyOptional({ example: 2026 })
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsInt()
  @Min(2000)
  @Max(2100)
  @IsOptional()
  year?: number;

  @ApiPropertyOptional({ enum: FundingTxType })
  @IsEnum(FundingTxType)
  @IsOptional()
  type?: FundingTxType;
}
