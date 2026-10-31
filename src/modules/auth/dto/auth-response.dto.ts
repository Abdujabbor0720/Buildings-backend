import { ApiProperty } from '@nestjs/swagger';
import type { UserRole } from '../../../common/constants/enums';
import type { Permission } from '../../../common/constants/permissions';

export class AuthUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty() fullName!: string;
  /** `J. Karimov` — header'da shu ko‘rinadi. */
  @ApiProperty() shortName!: string;
  @ApiProperty() position!: string | null;
  @ApiProperty() avatarUrl!: string | null;
  @ApiProperty() role!: UserRole;
  @ApiProperty({ isArray: true, type: String }) permissions!: Permission[];
  @ApiProperty() regionId!: string | null;
  @ApiProperty() districtId!: string | null;
  @ApiProperty() contractorId!: string | null;
}

export class AuthTokensDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty({ description: 'Access token amal qilish muddati (ISO)' })
  expiresAt!: string;
}

export class AuthResponseDto {
  @ApiProperty({ type: AuthUserDto }) user!: AuthUserDto;
  @ApiProperty({ type: AuthTokensDto }) tokens!: AuthTokensDto;
}
