import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService, type RequestContext } from './auth.service';
import { AuthResponseDto, AuthUserDto } from './dto/auth-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('Autentifikatsiya')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  // ⚠️ Login ALOHIDA, qattiq limit bilan: umumiy 200/min parolni
  // saralab topishga (brute force) yetarlicha keng oyna qoldirardi.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tizimga kirish' })
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthResponseDto> {
    return this.auth.login(dto.email, dto.password, context(req));
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Access tokenni yangilash (refresh rotatsiyasi bilan)',
  })
  refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    return this.auth.refresh(dto.refreshToken, context(req));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tizimdan chiqish' })
  logout(@Body() dto: RefreshTokenDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Barcha qurilmalardan chiqish' })
  logoutAll(@CurrentUser('id') userId: string) {
    return this.auth.logoutAll(userId);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Joriy foydalanuvchi va uning ruxsatlari' })
  me(@CurrentUser('id') userId: string): Promise<AuthUserDto> {
    return this.auth.me(userId);
  }

  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Parolni o‘zgartirish' })
  changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(
      userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}

function context(req: Request): RequestContext {
  return {
    ip: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
}
