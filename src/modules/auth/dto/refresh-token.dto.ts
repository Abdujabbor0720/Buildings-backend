import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Login/refresh javobida qaytgan refresh token' })
  @IsString()
  @Length(32, 256, { message: 'Refresh token yaroqsiz' })
  refreshToken!: string;
}
