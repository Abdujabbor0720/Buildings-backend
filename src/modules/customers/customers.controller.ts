import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/constants/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CustomersService } from './customers.service';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCustomerDto {
  @ApiProperty({ example: 'Andijon viloyati hokimligi' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'Davlat organi' })
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  @IsOptional()
  type?: string;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  @IsOptional()
  inn?: string;
  @ApiPropertyOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(150)
  @IsOptional()
  head?: string;
  @ApiPropertyOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  @IsOptional()
  phone?: string;
  @ApiPropertyOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  @IsOptional()
  address?: string;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

@ApiTags('Buyurtmachilar')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.OBJECTS_VIEW)
  @ApiOperation({ summary: 'Buyurtmachilar ro‘yxati' })
  list(@Query() query: PaginationDto) {
    return this.customers.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.OBJECTS_VIEW)
  @ApiOperation({ summary: 'Bitta buyurtmachi' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.OBJECTS_CREATE)
  @ApiOperation({ summary: 'Buyurtmachi qo‘shish' })
  create(@Body() dto: CreateCustomerDto) {
    return this.customers.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.OBJECTS_UPDATE)
  @ApiOperation({ summary: 'Buyurtmachini tahrirlash' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customers.update(id, dto);
  }
}
