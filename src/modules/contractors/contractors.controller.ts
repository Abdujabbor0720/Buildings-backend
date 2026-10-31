import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContractorStatus } from '../../common/constants/enums';
import { PERMISSIONS } from '../../common/constants/permissions';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ContractorsService } from './contractors.service';
import {
  ContractorQueryDto,
  CreateContractorDto,
  UpdateContractorDto,
} from './dto/contractor.dto';

export class SetContractorStatusDto {
  @ApiProperty({ enum: ContractorStatus })
  @IsEnum(ContractorStatus)
  status!: ContractorStatus;

  @ApiPropertyOptional({ description: 'Qora ro‘yxat uchun MAJBURIY' })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  reason?: string;
}

@ApiTags('Pudratchilar')
@ApiBearerAuth()
@Controller('contractors')
export class ContractorsController {
  constructor(private readonly contractors: ContractorsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CONTRACTORS_VIEW)
  @ApiOperation({ summary: 'Pudratchilar ro‘yxati' })
  list(@Query() query: ContractorQueryDto) {
    return this.contractors.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CONTRACTORS_VIEW)
  @ApiOperation({ summary: 'Pudratchi — statistikasi bilan' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.contractors.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CONTRACTORS_MANAGE)
  @ApiOperation({ summary: 'Yangi pudratchi qo‘shish' })
  create(@Body() dto: CreateContractorDto, @CurrentUser() actor: AuthUser) {
    return this.contractors.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CONTRACTORS_MANAGE)
  @ApiOperation({ summary: 'Pudratchini tahrirlash' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractorDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.contractors.update(id, dto, actor);
  }

  @Post(':id/status')
  @RequirePermissions(PERMISSIONS.CONTRACTORS_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Holatni o‘zgartirish (to‘xtatish / qora ro‘yxat)' })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetContractorStatusDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.contractors.setStatus(id, dto.status, dto.reason ?? '', actor);
  }

  @Post(':id/recalculate-rating')
  @RequirePermissions(PERMISSIONS.CONTRACTORS_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reytingni qayta hisoblash' })
  async recalculate(@Param('id', ParseUUIDPipe) id: string) {
    return { rating: await this.contractors.recalculateRating(id) };
  }
}
