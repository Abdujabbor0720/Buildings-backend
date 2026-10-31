import { UserRole } from './enums';

/**
 * Ruxsat kaliti: `<bo‘lim>.<amal>`.
 * ⚠️ Bo‘limlar ATAYLAB mayda: «obyektni ko‘rish» huquqi «moliyani ko‘rish»
 * huquqini bermasligi kerak — narx va pudrat summasi alohida qaror.
 */
export const PERMISSIONS = {
  OBJECTS_VIEW: 'objects.view',
  OBJECTS_CREATE: 'objects.create',
  OBJECTS_UPDATE: 'objects.update',
  OBJECTS_DELETE: 'objects.delete',
  OBJECTS_PROGRESS: 'objects.progress',

  FUNDING_VIEW: 'funding.view',
  FUNDING_MANAGE: 'funding.manage',

  CONTRACTORS_VIEW: 'contractors.view',
  CONTRACTORS_MANAGE: 'contractors.manage',

  PHOTOS_VIEW: 'photos.view',
  PHOTOS_UPLOAD: 'photos.upload',
  PHOTOS_MODERATE: 'photos.moderate',

  DOCUMENTS_VIEW: 'documents.view',
  DOCUMENTS_MANAGE: 'documents.manage',

  DELAYS_VIEW: 'delays.view',
  DELAYS_MANAGE: 'delays.manage',

  REPORTS_VIEW: 'reports.view',
  REPORTS_EXPORT: 'reports.export',

  USERS_VIEW: 'users.view',
  USERS_MANAGE: 'users.manage',

  SETTINGS_VIEW: 'settings.view',
  SETTINGS_MANAGE: 'settings.manage',

  AUDIT_VIEW: 'audit.view',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ALL = Object.values(PERMISSIONS) as Permission[];

const READ_ONLY: Permission[] = [
  PERMISSIONS.OBJECTS_VIEW,
  PERMISSIONS.CONTRACTORS_VIEW,
  PERMISSIONS.PHOTOS_VIEW,
  PERMISSIONS.DOCUMENTS_VIEW,
  PERMISSIONS.DELAYS_VIEW,
  PERMISSIONS.REPORTS_VIEW,
];

/** Rol → ruxsatlar. Bitta joy; guard shu jadvaldan o‘qiydi. */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.SUPER_ADMIN]: ALL,

  // Hokim: butun viloyatni ko‘radi va eksport qiladi, lekin ma’lumot kiritmaydi.
  [UserRole.GOVERNOR]: [
    ...READ_ONLY,
    PERMISSIONS.FUNDING_VIEW,
    PERMISSIONS.REPORTS_EXPORT,
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.AUDIT_VIEW,
  ],

  [UserRole.REGION_ADMIN]: ALL.filter(
    (p) =>
      p !== PERMISSIONS.SETTINGS_MANAGE && p !== PERMISSIONS.OBJECTS_DELETE,
  ),

  [UserRole.DISTRICT_ADMIN]: [
    ...READ_ONLY,
    PERMISSIONS.OBJECTS_CREATE,
    PERMISSIONS.OBJECTS_UPDATE,
    PERMISSIONS.OBJECTS_PROGRESS,
    PERMISSIONS.PHOTOS_UPLOAD,
    PERMISSIONS.PHOTOS_MODERATE,
    PERMISSIONS.DOCUMENTS_MANAGE,
    PERMISSIONS.DELAYS_MANAGE,
    PERMISSIONS.FUNDING_VIEW,
    PERMISSIONS.REPORTS_EXPORT,
  ],

  [UserRole.SUPERVISOR]: [
    ...READ_ONLY,
    PERMISSIONS.OBJECTS_PROGRESS,
    PERMISSIONS.PHOTOS_UPLOAD,
    PERMISSIONS.DOCUMENTS_MANAGE,
    PERMISSIONS.DELAYS_MANAGE,
  ],

  // Pudratchi faqat O‘Z obyektlarini ko‘radi — bu guard emas, scope darajasida
  // (`applyScope`) cheklanadi; ruxsat kaliti faqat amalni ochadi.
  [UserRole.CONTRACTOR]: [
    PERMISSIONS.OBJECTS_VIEW,
    PERMISSIONS.PHOTOS_VIEW,
    PERMISSIONS.PHOTOS_UPLOAD,
    PERMISSIONS.DOCUMENTS_VIEW,
    PERMISSIONS.DELAYS_VIEW,
    PERMISSIONS.OBJECTS_PROGRESS,
  ],

  [UserRole.VIEWER]: READ_ONLY,
};

export function permissionsForRole(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}
