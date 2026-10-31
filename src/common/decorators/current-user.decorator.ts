import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { UserRole } from '../constants/enums';
import type { Permission } from '../constants/permissions';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  permissions: Permission[];
  regionId: string | null;
  districtId: string | null;
  contractorId: string | null;
  fullName: string;
}

export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);
