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
  CreateUserDto,
  ResetPasswordDto,
  UpdateUserDto,
  UserQueryDto,
} from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('Foydalanuvchilar va mas’ullar')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  @ApiOperation({ summary: 'Foydalanuvchilar ro‘yxati' })
  list(@Query() query: UserQueryDto) {
    return this.users.list(query);
  }

  @Get('responsibles')
  @RequirePermissions(PERMISSIONS.OBJECTS_VIEW)
  @ApiQuery({ name: 'regionId', required: false })
  @ApiOperation({ summary: 'Mas’ullar va ularning obyektlari kesimi' })
  responsibles(@Query('regionId') regionId?: string) {
    return this.users.responsibles(regionId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  @ApiOperation({ summary: 'Bitta foydalanuvchi' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @ApiOperation({ summary: 'Yangi foydalanuvchi qo‘shish' })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @ApiOperation({ summary: 'Foydalanuvchini tahrirlash' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.update(id, dto, actor);
  }

  @Post(':id/reset-password')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Parolni administrator tomonidan tiklash' })
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.resetPassword(id, dto.newPassword, actor);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @ApiOperation({ summary: 'Foydalanuvchini faolsizlantirish' })
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.deactivate(id, actor);
  }
}
