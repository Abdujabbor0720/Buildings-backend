import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/constants/permissions';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { DashboardMetricsService } from './dashboard-metrics.service';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { KPI_METRICS, KpiMetric } from './dto/kpi-metric.dto';
import { KpiMetricObjectsQueryDto } from './dto/kpi-metric.dto';

/**
 * `:metric` YO‘L BO‘LAGI — ro‘yxatdan tashqari qiymat 400 bilan
 * qaytariladi.
 *
 * ⚠️ Xabar o‘zbekcha va RUXSAT ETILGAN qiymatlarni sanab beradi:
 * standart `ParseEnumPipe` xabari inglizcha va shunchaki
 * «Validation failed» deydi — havolani qo‘lda yozgan odam nimasi
 * noto‘g‘ri ekanini bilmay qolardi.
 */
const metricParam = new ParseEnumPipe(KpiMetric, {
  exceptionFactory: () =>
    new BadRequestException(
      `Noma’lum ko‘rsatkich. Ruxsat etilganlari: ${KPI_METRICS.join(', ')}`,
    ),
});

@ApiTags('Bosh sahifa (dashboard)')
@ApiBearerAuth()
@RequirePermissions(PERMISSIONS.OBJECTS_VIEW)
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly metrics: DashboardMetricsService,
  ) {}

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

  /* ───────────── Ko‘rsatkichning batafsil sahifasi ───────────── */

  /**
   * ⚠️ Bu yo‘l `GET /dashboard` bilan AYNI doirada ishlaydi
   * (`dashboard-scope.ts`): kartadagi raqamni bosgan odam ichkarida
   * AYNAN o‘sha to‘plamni ko‘radi. Ruxsat ham bir xil — sinf
   * darajasidagi `objects.view`.
   */
  @Get('metrics/:metric')
  @ApiParam({ name: 'metric', enum: KpiMetric })
  @ApiOperation({
    summary: 'Bitta ko‘rsatkichning batafsil kesimi',
    description:
      'Holat, status, risk, bajarilish, tuman, qurilish turi, yil va oy, moliya manbasi, pudratchi va kechikish sabablari bo‘yicha taqsimot.',
  })
  metricDetail(
    @Param('metric', metricParam) metric: KpiMetric,
    @Query() query: DashboardQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.metrics.detail(metric, query, user);
  }

  @Get('metrics/:metric/objects')
  @ApiParam({ name: 'metric', enum: KpiMetric })
  @ApiOperation({
    summary: 'Ko‘rsatkich ichidagi obyektlar ro‘yxati (sahifalangan)',
  })
  metricObjects(
    @Param('metric', metricParam) metric: KpiMetric,
    @Query() query: KpiMetricObjectsQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.metrics.listObjects(metric, query, user);
  }
}
