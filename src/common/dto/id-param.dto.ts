import { IsUUID } from 'class-validator';

export class IdParamDto {
  @IsUUID('4', { message: 'id yaroqli UUID bo‘lishi kerak' })
  id!: string;
}
