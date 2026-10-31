import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  toArray,
  toBoolean,
  trim,
  trimLower,
} from '../../../common/dto/transforms';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../../common/constants/enums';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateUserDto {
  @ApiProperty({ example: 'a.karimov@andijon.uz' })
  @Transform(trimLower)
  @IsEmail({}, { message: 'Email formati noto‘g‘ri' })
  @MaxLength(150)
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Parol kamida 8 belgidan iborat bo‘lishi kerak' })
  @MaxLength(100)
  password!: string;

  @ApiProperty({ example: 'Jahongir' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  firstName!: string;

  @ApiProperty({ example: 'Karimov' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  lastName!: string;

  @ApiPropertyOptional({ example: 'Baxtiyorovich' })
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  @IsOptional()
  middleName?: string;

  @ApiPropertyOptional({ example: 'Viloyat hokimi' })
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  position?: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @Transform(trim)
  @Matches(/^\+998\d{9}$/, {
    message: 'Telefon raqami +998XXXXXXXXX ko‘rinishida bo‘lishi kerak',
  })
  @IsOptional()
  phone?: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole, { message: 'Rol noto‘g‘ri tanlangan' })
  role!: UserRole;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  regionId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  districtId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Faqat `contractor` roli uchun',
  })
  @IsUUID('4')
  @IsOptional()
  contractorId?: string;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  @IsOptional()
  avatarUrl?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

/** ⚠️ Parol bu yerda O‘ZGARTIRILMAYDI — alohida endpoint bor (`/reset-password`). */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {}

export class ResetPasswordDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  newPassword!: string;
}

export class UserQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: UserRole, isArray: true })
  @Transform(toArray)
  @IsArray()
  @IsEnum(UserRole, { each: true })
  @IsOptional()
  role?: UserRole[];

  @ApiPropertyOptional() @IsUUID('4') @IsOptional() regionId?: string;
  @ApiPropertyOptional() @IsUUID('4') @IsOptional() districtId?: string;
  @ApiPropertyOptional() @IsUUID('4') @IsOptional() contractorId?: string;

  @ApiPropertyOptional({
    description: 'Faqat obyektga mas’ul etib biriktirilganlar',
  })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  onlyResponsible?: boolean;

  @ApiPropertyOptional()
  @Transform(({ value }) =>
    value === undefined || value === ''
      ? undefined
      : value === 'true' || value === '1' || value === true,
  )
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
