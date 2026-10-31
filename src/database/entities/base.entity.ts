import { ApiProperty } from '@nestjs/swagger';
import {
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Hamma jadval uchun umumiy ustunlar.
 *
 * `deletedAt` — YUMSHOQ o‘chirish: nazorat tizimida yozuv jismonan
 * o‘chirilmaydi, aks holda «bu obyekt qayerga ketdi» degan savolga javob
 * qolmaydi. TypeORM `softDelete()` bilan ishlaydi va barcha so‘rovlar
 * avtomatik `deletedAt IS NULL` filtri bilan ketadi.
 */
export abstract class BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @ApiProperty()
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}
