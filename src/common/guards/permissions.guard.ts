import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { Permission } from '../constants/permissions';
import type { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const granted = req.user?.permissions ?? [];
    const missing = required.filter((p) => !granted.includes(p));

    if (missing.length) {
      throw new ForbiddenException(
        `Bu amal uchun ruxsat yetarli emas: ${missing.join(', ')}`,
      );
    }
    return true;
  }
}
