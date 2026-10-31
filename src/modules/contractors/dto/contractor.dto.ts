import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  toArray,
  toNumber,
  trim,
  trimLower,
} from '../../../common/dto/transforms';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ContractorStatus } from '../../../common/constants/enums';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateContractorDto {
  @ApiProperty({ example: '“Andijon Qurilish Invest” MChJ' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: '301234567', description: 'STIR — 9 raqam' })
  @Transform(trim)
  @Matches(/^\d{9}$/, { message: 'STIR 9 ta raqamdan iborat bo‘lishi kerak' })
  inn!: string;

  @ApiPropertyOptional({ example: 'Shuhrat Mamatqulov' })
  @Transform(trim)
  @IsString()
  @MaxLength(150)
  @IsOptional()
  director?: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @Transform(trim)
  @Matches(/^\+998\d{9}$/, {
    message: 'Telefon +998XXXXXXXXX ko‘rinishida bo‘lishi kerak',
  })
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional()
  @Transform(trimLower)
  @IsEmail({}, { message: 'Email formati noto‘g‘ri' })
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: 'QL-2021-00418' })
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  @IsOptional()
  licenseNumber?: string;

  @ApiPropertyOptional({ example: '2028-04-30' })
  @IsDateString()
  @IsOptional()
  licenseExpiry?: string;

  @ApiPropertyOptional({
    enum: ContractorStatus,
    default: ContractorStatus.ACTIVE,
  })
  @IsEnum(ContractorStatus)
  @IsOptional()
  status?: ContractorStatus;

  @ApiPropertyOptional({ example: 2011 })
  @Transform(toNumber)
  @IsInt()
  @Min(1900)
  @IsOptional()
  foundedYear?: number;

  @ApiPropertyOptional({ example: 240 })
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  @IsOptional()
  employeesCount?: number;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  note?: string;
}

export class UpdateContractorDto extends PartialType(CreateContractorDto) {}

export class ContractorQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ContractorStatus, isArray: true })
  @Transform(toArray)
  @IsArray()
  @IsEnum(ContractorStatus, { each: true })
  @IsOptional()
  status?: ContractorStatus[];

  @ApiPropertyOptional({ description: 'Reyting shundan yuqori' })
  @Transform(toNumber)
  @Min(0)
  @IsOptional()
  minRating?: number;
}
