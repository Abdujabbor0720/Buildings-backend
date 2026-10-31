import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { toUpperCase, trim } from './transforms';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

export class PaginationDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Transform(({ value }) =>
    value === undefined || value === '' ? 1 : Number(value),
  )
  @IsInt({ message: 'page butun son bo‘lishi kerak' })
  @Min(1, { message: 'page 1 dan kichik bo‘la olmaydi' })
  @IsOptional()
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 200 })
  @Transform(({ value }) =>
    value === undefined || value === '' ? 20 : Number(value),
  )
  @IsInt({ message: 'limit butun son bo‘lishi kerak' })
  @Min(1)
  @Max(200, { message: 'limit 200 dan katta bo‘la olmaydi' })
  @IsOptional()
  limit = 20;

  @ApiPropertyOptional({ description: 'Qidiruv matni' })
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Saralash maydoni' })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @Transform(toUpperCase)
  @IsIn(['ASC', 'DESC'])
  @IsOptional()
  sortOrder: 'ASC' | 'DESC' = 'DESC';

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export class PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;

  constructor(items: T[], total: number, page: number, limit: number) {
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
    this.items = items;
    this.meta = {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }
}
