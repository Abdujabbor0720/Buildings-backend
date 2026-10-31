import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { toArray, toNumber, trim } from '../../../common/dto/transforms';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AiVerdict, PhotoReportStatus } from '../../../common/constants/enums';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreatePhotoReportDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'Obyekt tanlanmagan' })
  objectId!: string;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Yuklangan fayl id(lar)i',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Kamida bitta surat biriktirilishi kerak' })
  @ArrayMaxSize(10, {
    message: 'Bir hisobotga 10 tadan ko‘p surat biriktirib bo‘lmaydi',
  })
  @IsUUID('4', { each: true })
  fileIds!: string[];

  @ApiProperty({ example: 68, minimum: 0, maximum: 100 })
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  @Max(100)
  progressPercent!: number;

  @ApiPropertyOptional({
    description: 'Surat olingan vaqt (EXIF). Berilmasa — hozir.',
  })
  @IsDateString()
  @IsOptional()
  capturedAt?: string;

  @ApiPropertyOptional()
  @Transform(toNumber)
  @IsLatitude()
  @IsOptional()
  lat?: number;
  @ApiPropertyOptional()
  @Transform(toNumber)
  @IsLongitude()
  @IsOptional()
  lng?: number;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  note?: string;
}

export class ReviewPhotoReportDto {
  @ApiProperty({
    enum: [PhotoReportStatus.APPROVED, PhotoReportStatus.REJECTED],
  })
  @IsEnum(PhotoReportStatus)
  status!: PhotoReportStatus;

  @ApiPropertyOptional({ description: 'Rad etish uchun MAJBURIY' })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Tasdiqlanganda obyekt bajarilishi ham yangilansinmi',
  })
  @Transform(
    ({ value }) =>
      value === undefined ||
      value === true ||
      value === 'true' ||
      value === '1',
  )
  @IsOptional()
  applyProgress?: boolean;
}

export class PhotoReportQueryDto extends PaginationDto {
  @ApiPropertyOptional() @IsUUID('4') @IsOptional() objectId?: string;
  @ApiPropertyOptional() @IsUUID('4') @IsOptional() districtId?: string;
  @ApiPropertyOptional() @IsUUID('4') @IsOptional() authorId?: string;

  @ApiPropertyOptional({ enum: PhotoReportStatus, isArray: true })
  @Transform(toArray)
  @IsArray()
  @IsEnum(PhotoReportStatus, { each: true })
  @IsOptional()
  status?: PhotoReportStatus[];

  @ApiPropertyOptional({ enum: AiVerdict, isArray: true })
  @Transform(toArray)
  @IsArray()
  @IsEnum(AiVerdict, { each: true })
  @IsOptional()
  aiVerdict?: AiVerdict[];

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;
}
