import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(6)
  currentPassword!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, {
    message: 'Yangi parol kamida 8 belgidan iborat bo‘lishi kerak',
  })
  @MaxLength(100)
  newPassword!: string;
}
