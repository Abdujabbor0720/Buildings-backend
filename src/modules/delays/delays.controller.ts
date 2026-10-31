import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { DelaysService } from './delays.service';
import {
  CreateDelayDto,
  DelayQueryDto,
  ResolveDelayDto,
  UpdateDelayDto,
} from './dto/delay.dto';

@ApiTags('Kechikishlar va risklar')
@ApiBearerAuth()
@Controller('delays')
export class DelaysController {
  constructor(private readonly delays: DelaysService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DELAYS_VIEW)
  @ApiOperation({ summary: 'Kechikishlar ro‘yxati' })
  list(@Query() query: DelayQueryDto, @CurrentUser() user: AuthUser) {
    return this.delays.list(query, user);
  }

  @Get('reasons-breakdown')
  @RequirePermissions(PERMISSIONS.DELAYS_VIEW)
  @ApiQuery({ name: 'regionId', required: false })
  @ApiQuery({ name: 'onlyOpen', required: false, type: Boolean })
  @ApiOperation({
    summary: 'Asosiy kechikish sabablari (dashboard diagrammasi)',
  })
  breakdown(
    @Query('regionId') regionId?: string,
    @Query('onlyOpen', new ParseBoolPipe({ optional: true }))
    onlyOpen?: boolean,
  ) {
    return this.delays.reasonBreakdown(regionId, onlyOpen ?? true);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.DELAYS_VIEW)
  @ApiOperation({ summary: 'Bitta kechikish yozuvi' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.delays.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DELAYS_MANAGE)
  @ApiOperation({ summary: 'Kechikish / risk qayd etish' })
  create(@Body() dto: CreateDelayDto, @CurrentUser() user: AuthUser) {
    return this.delays.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.DELAYS_MANAGE)
  @ApiOperation({ summary: 'Kechikish yozuvini tahrirlash' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDelayDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.delays.update(id, dto, user);
  }

  @Post(':id/resolve')
  @RequirePermissions(PERMISSIONS.DELAYS_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Muammoni hal qilindi deb yopish' })
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveDelayDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.delays.resolve(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.DELAYS_MANAGE)
  @ApiOperation({ summary: 'Kechikish yozuvini o‘chirish' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.delays.remove(id, user);
  }
}
