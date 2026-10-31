import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/constants/permissions';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import {
  CreateTransactionDto,
  FundingQueryDto,
  UpsertAllocationDto,
} from './dto/funding.dto';
import { FundingService } from './funding.service';

@ApiTags('Moliyalashtirish')
@ApiBearerAuth()
@Controller('funding')
export class FundingController {
  constructor(private readonly funding: FundingService) {}

  @Get('summary')
  @RequirePermissions(PERMISSIONS.FUNDING_VIEW)
  @ApiQuery({ name: 'regionId', required: false })
  @ApiQuery({ name: 'year', required: false })
  @ApiOperation({ summary: 'Moliyalashtirish umumiy ko‘rsatkichlari' })
  summary(
    @Query('regionId') regionId?: string,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ) {
    return this.funding.summary(regionId, year);
  }

  @Get('allocations')
  @RequirePermissions(PERMISSIONS.FUNDING_VIEW)
  @ApiOperation({ summary: 'Yillik moliyalashtirish rejalari' })
  allocations(@Query() query: FundingQueryDto, @CurrentUser() user: AuthUser) {
    return this.funding.listAllocations(query, user);
  }

  @Get('transactions')
  @RequirePermissions(PERMISSIONS.FUNDING_VIEW)
  @ApiOperation({ summary: 'Moliyaviy harakatlar daftari' })
  transactions(@Query() query: FundingQueryDto, @CurrentUser() user: AuthUser) {
    return this.funding.listTransactions(query, user);
  }

  @Get('objects/:objectId')
  @RequirePermissions(PERMISSIONS.FUNDING_VIEW)
  @ApiOperation({ summary: 'Bitta obyektning moliyasi (reja + daftar)' })
  objectFunding(@Param('objectId', ParseUUIDPipe) objectId: string) {
    return this.funding.objectFunding(objectId);
  }

  @Put('allocations')
  @RequirePermissions(PERMISSIONS.FUNDING_MANAGE)
  @ApiOperation({ summary: 'Yillik rejani yozish / yangilash' })
  upsertAllocation(
    @Body() dto: UpsertAllocationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.funding.upsertAllocation(dto, user);
  }

  @Post('transactions')
  @RequirePermissions(PERMISSIONS.FUNDING_MANAGE)
  @ApiOperation({
    summary: 'Moliyaviy harakat qayd etish',
    description:
      'Daftar append-only: xato yozuv tahrirlanmaydi, teskari «adjustment» qatori yoziladi.',
  })
  createTransaction(
    @Body() dto: CreateTransactionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.funding.createTransaction(dto, user);
  }
}
