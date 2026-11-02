import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { PERMISSIONS } from '../../common/constants/permissions';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CreateObjectDto, UpdateObjectDto } from './dto/create-object.dto';
import { ObjectQueryDto } from './dto/object-query.dto';
import { AddProgressDto } from './dto/progress.dto';
import { MAX_IMPORT_BYTES } from './import/object-import.parser';
import { ObjectImportService } from './import/object-import.service';
import { ObjectHealthService } from './object-health.service';
import { ObjectsService } from './objects.service';

@ApiTags('Qurilish obyektlari')
@ApiBearerAuth()
@Controller('objects')
export class ObjectsController {
  constructor(
    private readonly objects: ObjectsService,
    private readonly health: ObjectHealthService,
    private readonly importer: ObjectImportService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.OBJECTS_VIEW)
  @ApiOperation({ summary: 'Obyektlar ro‘yxati (filtr, saralash, sahifalash)' })
  list(@Query() query: ObjectQueryDto, @CurrentUser() user: AuthUser) {
    return this.objects.list(query, user);
  }

  @Get('map')
  @RequirePermissions(PERMISSIONS.OBJECTS_VIEW)
  @ApiOperation({ summary: 'Xarita uchun obyekt nuqtalari' })
  map(@Query() query: ObjectQueryDto, @CurrentUser() user: AuthUser) {
    return this.objects.mapPoints(query, user);
  }

  @Get('by-code/:code')
  @RequirePermissions(PERMISSIONS.OBJECTS_VIEW)
  @ApiOperation({ summary: 'Kod bo‘yicha obyekt (QR, hujjat havolasi)' })
  byCode(@Param('code') code: string, @CurrentUser() user: AuthUser) {
    return this.objects.findByCode(code, user);
  }

  /* ───────────────── Excel orqali ommaviy yuklash ─────────────────
     ⚠️ Bu ikki yo‘l `@Get(':id')` DAN OLDIN turishi SHART. Nest
     marshrutlarni e'lon tartibida solishtiradi va `:id` pastda bo‘lmasa,
     `/objects/import/template` so‘rovi `id = "import"` bo‘lib ketardi. */

  @Get('import/template')
  @RequirePermissions(PERMISSIONS.OBJECTS_CREATE)
  @ApiOperation({
    summary: 'Yuklash shabloni (.xlsx) — ustunlar va ma’lumotnoma bilan',
  })
  @Header('Cache-Control', 'no-store')
  async importTemplate(@Res() res: Response): Promise<void> {
    const file = await this.importer.buildTemplate();
    res
      .status(HttpStatus.OK)
      .set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="obyektlar-shablon.xlsx"',
        'Content-Length': String(file.byteLength),
      })
      .end(file);
  }

  /**
   * ⚠️ `dryRun=true` — faqat TEKSHIRUV, hech narsa yozilmaydi. Mijoz
   * avval shuni chaqiradi va hisobotni ko‘rsatadi; odam tasdiqlagandan
   * keyingina `dryRun=false` bilan qayta yuboriladi.
   */
  @Post('import')
  @RequirePermissions(PERMISSIONS.OBJECTS_CREATE)
  // ⚠️ Alohida, QATTIQ chegara: har so‘rov 500 qatorni tekshiradi va
  // katalogni o‘qiydi. Umumiy limit (200/daqiqa) bu yerda juda bo‘sh.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      // ⚠️ Global `MulterModule` fayllarni to‘g‘ridan-to‘g‘ri Spaces'ga
      // oqim bilan yozadi. Import fayli saqlanmaydi — u faqat o‘qiladi,
      // shuning uchun bu yo‘lda XOTIRA ishlatiladi va 5 MB bilan
      // cheklanadi.
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMPORT_BYTES, files: 1, fields: 4 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        dryRun: { type: 'string', enum: ['true', 'false'] },
      },
    },
  })
  @ApiOperation({
    summary: 'Obyektlarni Excel’dan yuklash (avval dryRun bilan tekshiring)',
  })
  async import(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('dryRun') dryRun: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file?.buffer?.length)
      throw new BadRequestException('Fayl yuborilmadi');
    // ⚠️ `dryRun` AYNAN `'false'` bo‘lgandagina yozish bo‘ladi. Maydon
    // yetib kelmasa yoki buzilgan bo‘lsa, xavfsiz tomoni — tekshiruv.
    return this.importer.run(
      file.buffer,
      dryRun !== 'false',
      user,
      file.mimetype,
    );
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.OBJECTS_VIEW)
  @ApiOperation({ summary: 'Bitta obyekt — to‘liq ma’lumot' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.objects.findOne(id, user);
  }

  @Get(':id/progress')
  @RequirePermissions(PERMISSIONS.OBJECTS_VIEW)
  @ApiOperation({ summary: 'Bajarilish tarixi (dinamika grafigi uchun)' })
  progress(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.objects.progressHistory(id, user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.OBJECTS_CREATE)
  @ApiOperation({ summary: 'Yangi obyekt qo‘shish' })
  create(@Body() dto: CreateObjectDto, @CurrentUser() user: AuthUser) {
    return this.objects.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.OBJECTS_UPDATE)
  @ApiOperation({ summary: 'Obyekt ma’lumotlarini tahrirlash' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateObjectDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.objects.update(id, dto, user);
  }

  @Post(':id/progress')
  @RequirePermissions(PERMISSIONS.OBJECTS_PROGRESS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bajarilishni yangilash (tarix bilan)' })
  addProgress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddProgressDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.objects.addProgress(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.OBJECTS_DELETE)
  @ApiOperation({ summary: 'Obyektni arxivga ko‘chirish (yumshoq o‘chirish)' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.objects.remove(id, user);
  }

  @Post(':id/restore')
  @RequirePermissions(PERMISSIONS.OBJECTS_DELETE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Arxivdan tiklash' })
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.objects.restore(id, user);
  }

  @Post('recalculate-health')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Barcha obyektlar holatini qayta hisoblash',
    description:
      'Odatda har kecha 02:00 da avtomatik ishlaydi. Bu tugma — ma’lumot ommaviy import qilingandan keyingi zaxira yo‘l.',
  })
  recalculate() {
    return this.health.refreshAll();
  }
}
