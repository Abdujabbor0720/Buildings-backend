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
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/constants/permissions';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import {
  CalendarQueryDto,
  CreateMilestoneDto,
  ReplaceMilestonesDto,
  SubmitMilestoneDto,
  UpdateMilestoneDto,
} from './dto/milestone.dto';
import { MilestonesService } from './milestones.service';

@ApiTags('Bosqichlar va ish rejasi')
@ApiBearerAuth()
@Controller()
export class MilestonesController {
  constructor(private readonly milestones: MilestonesService) {}

  @Get('calendar')
  @RequirePermissions(PERMISSIONS.OBJECTS_VIEW)
  @ApiOperation({ summary: 'Kalendar (ish rejasi) — oy kesimidagi bosqichlar' })
  calendar(@Query() query: CalendarQueryDto, @CurrentUser() user: AuthUser) {
    return this.milestones.calendar(query, user);
  }

  @Get('objects/:objectId/milestones')
  @RequirePermissions(PERMISSIONS.OBJECTS_VIEW)
  @ApiOperation({ summary: 'Obyekt bosqichlari' })
  list(@Param('objectId', ParseUUIDPipe) objectId: string) {
    return this.milestones.listForObject(objectId);
  }

  @Post('objects/:objectId/milestones')
  @RequirePermissions(PERMISSIONS.OBJECTS_UPDATE)
  @ApiOperation({ summary: 'Bosqich qo‘shish' })
  create(
    @Param('objectId', ParseUUIDPipe) objectId: string,
    @Body() dto: CreateMilestoneDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.milestones.create(objectId, dto, user);
  }

  @Put('objects/:objectId/milestones')
  @RequirePermissions(PERMISSIONS.OBJECTS_UPDATE)
  @ApiOperation({
    summary: 'Butun ish rejasini almashtirish (ulushlar yig‘indisi 100%)',
  })
  replace(
    @Param('objectId', ParseUUIDPipe) objectId: string,
    @Body() dto: ReplaceMilestonesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.milestones.replaceAll(objectId, dto, user);
  }

  @Patch('milestones/:id')
  @RequirePermissions(PERMISSIONS.OBJECTS_UPDATE)
  @ApiOperation({ summary: 'Bosqichni tahrirlash' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMilestoneDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.milestones.update(id, dto, user);
  }

  @Delete('milestones/:id')
  @RequirePermissions(PERMISSIONS.OBJECTS_UPDATE)
  @ApiOperation({ summary: 'Bosqichni o‘chirish' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.milestones.remove(id, user);
  }

  /**
   * BOSQICHNI TOPSHIRISH.
   *
   * ⚠️ Ruxsat `objects.update` EMAS, `photos.upload`: topshirish —
   * MAYDONDAN keladigan amal va uni kurator ham, pudratchi vakili ham
   * bajaradi. Reja TUZISH esa boshqa qaror va u `objects.update` da
   * qoladi — ikkalasini bitta kalitga yig‘ish pudratchiga ish rejasini
   * qayta yozish huquqini berib qo‘yardi.
   */
  @Post('milestones/:id/submit')
  @RequirePermissions(PERMISSIONS.PHOTOS_UPLOAD)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bosqichni topshirish (surat MAJBURIY)',
    description:
      'Suratlar avval `POST /files/upload-many` orqali yuklanadi, bu yerda ularning id lari beriladi. ' +
      'Javobda bosqichning yangi holati, foto-hisobot, obyektning qayta hisoblangan bajarilishi va AI xulosasi qaytadi.',
  })
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitMilestoneDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.milestones.submit(id, dto, user);
  }
}
