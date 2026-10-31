import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import {
  CreatePhotoReportDto,
  PhotoReportQueryDto,
  ReviewPhotoReportDto,
} from './dto/photo-report.dto';
import { PhotoVisionRunner } from '../ai/vision/photo-vision.runner';
import { PhotoReportsService } from './photo-reports.service';

@ApiTags('Foto-hisobotlar (fotoarxiv)')
@ApiBearerAuth()
@Controller('photo-reports')
export class PhotoReportsController {
  constructor(
    private readonly reports: PhotoReportsService,
    private readonly vision: PhotoVisionRunner,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PHOTOS_VIEW)
  @ApiOperation({ summary: 'Foto-hisobotlar ro‘yxati (fotoarxiv)' })
  list(@Query() query: PhotoReportQueryDto, @CurrentUser() user: AuthUser) {
    return this.reports.list(query, user);
  }

  @Get('stats')
  @RequirePermissions(PERMISSIONS.PHOTOS_VIEW)
  @ApiQuery({ name: 'regionId', required: false })
  @ApiOperation({ summary: 'Fotoarxiv statistikasi' })
  stats(@Query('regionId') regionId?: string) {
    return this.reports.stats(regionId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PHOTOS_VIEW)
  @ApiOperation({ summary: 'Bitta foto-hisobot' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.reports.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PHOTOS_UPLOAD)
  @ApiOperation({
    summary: 'Foto-hisobot yuborish',
    description:
      'Suratlar avval `POST /files/upload` orqali yuklanadi, bu yerda ularning id lari beriladi.',
  })
  create(@Body() dto: CreatePhotoReportDto, @CurrentUser() user: AuthUser) {
    return this.reports.create(dto, user);
  }

  @Post(':id/review')
  @RequirePermissions(PERMISSIONS.PHOTOS_MODERATE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hisobotni tasdiqlash yoki rad etish' })
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewPhotoReportDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reports.review(id, dto, user);
  }

  @Post(':id/recheck')
  @RequirePermissions(PERMISSIONS.PHOTOS_MODERATE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Avtomatik tekshiruvni qayta ishga tushirish' })
  recheck(@Param('id', ParseUUIDPipe) id: string) {
    return this.reports.recheck(id);
  }

  /**
   * ⚠️ `recheck` dan FARQLI: u faqat QOIDALARNI (vaqt, joylashuv, sakrash)
   * qayta hisoblaydi, bu esa suratni MODELGA qayta yuboradi. Ikkalasi
   * boshqa narsani tekshiradi, shuning uchun ikkita tugma.
   */
  @Post(':id/reanalyze')
  @RequirePermissions(PERMISSIONS.PHOTOS_MODERATE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Suratni AI bilan qayta tahlil qilish',
    description:
      'Modelga suratlarni qaytadan yuboradi va bajarilish bahosini yangilaydi. ' +
      'Urinishlar sanog‘i nolga tushadi.',
  })
  reanalyze(@Param('id', ParseUUIDPipe) id: string) {
    return this.vision.reanalyze(id);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PHOTOS_MODERATE)
  @ApiOperation({ summary: 'Foto-hisobotni o‘chirish' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reports.remove(id, user);
  }
}
