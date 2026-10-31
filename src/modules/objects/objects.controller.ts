import {
  Body,
  Controller,
  Delete,
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
import { PERMISSIONS } from '../../common/constants/permissions';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CreateObjectDto, UpdateObjectDto } from './dto/create-object.dto';
import { ObjectQueryDto } from './dto/object-query.dto';
import { AddProgressDto } from './dto/progress.dto';
import { ObjectHealthService } from './object-health.service';
import { ObjectsService } from './objects.service';

@ApiTags('Qurilish obyektlari')
@ApiBearerAuth()
@Controller('objects')
export class ObjectsController {
  constructor(
    private readonly objects: ObjectsService,
    private readonly health: ObjectHealthService,
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
