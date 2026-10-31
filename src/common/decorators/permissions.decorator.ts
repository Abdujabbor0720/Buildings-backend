import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../constants/permissions';

export const PERMISSIONS_KEY = 'requiredPermissions';

/** Endpoint uchun kerakli ruxsat(lar). Bittasi yetarli emas — HAMMASI kerak. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
