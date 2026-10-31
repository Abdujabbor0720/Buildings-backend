import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { toArray, toBoolean, trim } from '../../../common/dto/transforms';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DocumentType } from '../../../common/constants/enums';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateDocumentDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Obyektga bog‘lanmagan hujjat ham bo‘lishi mumkin',
  })
  @IsUUID('4')
  @IsOptional()
  objectId?: string;

  @ApiProperty({ enum: DocumentType })
  @IsEnum(DocumentType, { message: 'Hujjat turi noto‘g‘ri' })
  type!: DocumentType;

  @ApiProperty({ example: 'Loyiha-smeta hujjatlari' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional({ example: '№ 142/2025' })
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  @IsOptional()
  number?: string;

  @ApiPropertyOptional() @IsDateString() @IsOptional() issuedDate?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() expiryDate?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  fileId?: string;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  note?: string;
}

export class UpdateDocumentDto extends PartialType(CreateDocumentDto) {}

export class DocumentQueryDto extends PaginationDto {
  @ApiPropertyOptional() @IsUUID('4') @IsOptional() objectId?: string;
  @ApiPropertyOptional() @IsUUID('4') @IsOptional() districtId?: string;

  @ApiPropertyOptional({ enum: DocumentType, isArray: true })
  @Transform(toArray)
  @IsArray()
  @IsEnum(DocumentType, { each: true })
  @IsOptional()
  type?: DocumentType[];

  @ApiPropertyOptional({ description: 'Faqat muddati tugagan / tugayotganlar' })
  @Transform(toBoolean)
  @IsOptional()
  expiringOnly?: boolean;
}
