import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { trimLower } from '../../../common/dto/transforms';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'hokim@andijon.uz' })
  @Transform(trimLower)
  @IsEmail({}, { message: 'Email formati noto‘g‘ri' })
  @MaxLength(150)
  email!: string;

  @ApiProperty({ example: 'Hokim2026!', minLength: 6 })
  @IsString({ message: 'Parol matn bo‘lishi kerak' })
  @MinLength(6, { message: 'Parol kamida 6 belgidan iborat bo‘lishi kerak' })
  @MaxLength(100)
  password!: string;
}
