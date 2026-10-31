import type { UserRole } from '../../common/constants/enums';

/** Access token ichidagi ma’lumot. ⚠️ Maxfiy narsa yozilmaydi — token o‘qiladi. */
export interface JwtPayload {
  /** User id */
  sub: string;
  email: string;
  role: UserRole;
  regionId: string | null;
  districtId: string | null;
  contractorId: string | null;
  iat?: number;
  exp?: number;
}
