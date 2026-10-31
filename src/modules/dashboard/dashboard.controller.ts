import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
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
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@ApiTags('Bosh sahifa (dashboard)')
@ApiBearerAuth()
@RequirePermissions(PERMISSIONS.OBJECTS_VIEW)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'Butun bosh sahifa bitta so‘rovda',
    description:
      'KPI kartalari, tumanlar kesimi, muddatlar, qurilish turlari, TOP kechikayotganlar, kechikish sabablari, yaqin muddatdagilar va so‘nggi foto-hisobotlar.',
  })
  overview(@Query() query: DashboardQueryDto, @CurrentUser() user: AuthUser) {
    return this.dashboard.overview(query, user);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Faqat KPI kartalari' })
  summary(@Query() query: DashboardQueryDto, @CurrentUser() user: AuthUser) {
    return this.dashboard.summary(query, user);
  }

  @Get('by-deadline')
  @ApiOperation({ summary: 'Muddatlar bo‘yicha taqsimot' })
  byDeadline(@Query() query: DashboardQueryDto, @CurrentUser() user: AuthUser) {
    return this.dashboard.byDeadline(query, user);
  }

  @Get('by-type')
  @ApiOperation({ summary: 'Qurilish turlari bo‘yicha taqsimot' })
  byType(@Query() query: DashboardQueryDto, @CurrentUser() user: AuthUser) {
    return this.dashboard.byType(query, user);
  }

  @Get('top-delayed')
  @ApiQuery({ name: 'limit', required: false, example: 5 })
  @ApiOperation({ summary: 'Eng ko‘p kechikayotgan obyektlar' })
  topDelayed(
    @Query() query: DashboardQueryDto,
    @CurrentUser() user: AuthUser,
    @Query('limit', new DefaultValuePipe(5), ParseIntPipe) limit: number,
  ) {
    return this.dashboard.topDelayed(query, user, Math.min(limit, 50));
  }

  @Get('upcoming')
  @ApiQuery({ name: 'limit', required: false, example: 5 })
  @ApiQuery({ name: 'withinDays', required: false, example: 90 })
  @ApiOperation({ summary: 'Yaqin muddatda topshiriladigan obyektlar' })
  upcoming(
    @Query() query: DashboardQueryDto,
    @CurrentUser() user: AuthUser,
    @Query('limit', new DefaultValuePipe(5), ParseIntPipe) limit: number,
    @Query('withinDays', new DefaultValuePipe(90), ParseIntPipe)
    withinDays: number,
  ) {
    return this.dashboard.upcoming(
      query,
      user,
      Math.min(limit, 50),
      Math.min(withinDays, 730),
    );
  }

  @Get('recent-photos')
  @ApiQuery({ name: 'limit', required: false, example: 6 })
  @ApiOperation({ summary: 'So‘nggi foto-hisobotlar' })
  recentPhotos(
    @Query() query: DashboardQueryDto,
    @CurrentUser() user: AuthUser,
    @Query('limit', new DefaultValuePipe(6), ParseIntPipe) limit: number,
  ) {
    return this.dashboard.recentPhotos(query, user, Math.min(limit, 30));
  }
}
