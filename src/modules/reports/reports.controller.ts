import {
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  ParseIntPipe,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { PERMISSIONS } from '../../common/constants/permissions';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { ReportsService } from './reports.service';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('Hisobotlar')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  @ApiQuery({ name: 'regionId', required: false })
  @ApiOperation({ summary: 'Umumiy hisobot' })
  summary(@Query('regionId') regionId?: string) {
    return this.reports.summary(regionId);
  }

  @Get('progress-timeline')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  @ApiQuery({ name: 'months', required: false, example: 12 })
  @ApiQuery({ name: 'regionId', required: false })
  @ApiOperation({ summary: 'Bajarilish dinamikasi (oylar kesimida)' })
  timeline(
    @Query('months', new DefaultValuePipe(12), ParseIntPipe) months: number,
    @Query('regionId') regionId?: string,
  ) {
    return this.reports.progressTimeline(
      Math.min(Math.max(months, 1), 60),
      regionId,
    );
  }

  @Get('export/objects')
  @RequirePermissions(PERMISSIONS.REPORTS_EXPORT)
  @RawResponse()
  @Header('Content-Type', XLSX_MIME)
  @ApiProduces(XLSX_MIME)
  @ApiOperation({ summary: 'Obyektlarni Excel’ga chiqarish' })
  async exportObjects(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query('regionId') regionId?: string,
  ): Promise<void> {
    send(res, await this.reports.exportObjects(user, regionId), 'obyektlar');
  }

  @Get('export/districts')
  @RequirePermissions(PERMISSIONS.REPORTS_EXPORT)
  @RawResponse()
  @Header('Content-Type', XLSX_MIME)
  @ApiProduces(XLSX_MIME)
  @ApiOperation({ summary: 'Tumanlar kesimini Excel’ga chiqarish' })
  async exportDistricts(
    @Res() res: Response,
    @Query('regionId') regionId?: string,
  ): Promise<void> {
    send(
      res,
      await this.reports.exportDistricts(regionId),
      'tumanlar-kesimida',
    );
  }

  @Get('export/delays')
  @RequirePermissions(PERMISSIONS.REPORTS_EXPORT)
  @RawResponse()
  @Header('Content-Type', XLSX_MIME)
  @ApiProduces(XLSX_MIME)
  @ApiOperation({ summary: 'Kechikishlarni Excel’ga chiqarish' })
  async exportDelays(
    @Res() res: Response,
    @Query('regionId') regionId?: string,
  ): Promise<void> {
    send(res, await this.reports.exportDelays(regionId), 'kechikishlar');
  }
}

/**
 * ⚠️ Fayl nomidagi sana ISO ko‘rinishida (`2026-10-30`) — bu MASHINA
 * o‘qiydigan joy: fayllar papkada to‘g‘ri saralanishi kerak. Ekranga
 * chiqadigan sanalar esa `formatDateUz` orqali ketadi.
 */
function send(res: Response, buffer: Buffer, baseName: string): void {
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `${baseName}-${stamp}.xlsx`;
  res.setHeader('Content-Type', XLSX_MIME);
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.end(buffer);
}
