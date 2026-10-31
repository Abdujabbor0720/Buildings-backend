import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsDefined } from 'class-validator';
import { PERMISSIONS } from '../../common/constants/permissions';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SettingsService } from './settings.service';

export class SetSettingDto {
  @ApiProperty({ description: 'Har qanday JSON qiymat' })
  @IsDefined({ message: 'Qiymat yuborilmagan' })
  value!: unknown;
}

@ApiTags('Sozlamalar')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Ochiq konfiguratsiya (login sahifasi uchun)' })
  publicConfig() {
    return this.settings.publicConfig();
  }

  @ApiBearerAuth()
  @Get()
  @RequirePermissions(PERMISSIONS.SETTINGS_VIEW)
  @ApiOperation({ summary: 'Barcha sozlamalar (kategoriyalar bo‘yicha)' })
  grouped() {
    return this.settings.grouped();
  }

  @ApiBearerAuth()
  @Get(':key')
  @RequirePermissions(PERMISSIONS.SETTINGS_VIEW)
  @ApiOperation({ summary: 'Bitta sozlama qiymati' })
  async get(@Param('key') key: string) {
    return { key, value: await this.settings.get(key) };
  }

  @ApiBearerAuth()
  @Put(':key')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Sozlamani o‘zgartirish' })
  set(
    @Param('key') key: string,
    @Body() dto: SetSettingDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.settings.set(key, dto.value, actor);
  }

  @ApiBearerAuth()
  @Delete(':key')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Sukut qiymatga qaytarish' })
  reset(@Param('key') key: string, @CurrentUser() actor: AuthUser) {
    return this.settings.reset(key, actor);
  }
}
