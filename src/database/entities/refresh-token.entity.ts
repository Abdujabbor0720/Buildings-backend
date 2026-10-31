import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';

/**
 * Refresh token — bazada FAQAT SHA-256 hash'i saqlanadi.
 *
 * ⚠️ Tokenning o‘zi saqlanmaydi: baza nusxasi sizib chiqsa, hash bilan
 * hech kimning sessiyasiga kirib bo‘lmaydi. `revokedAt` — «barcha
 * qurilmalardan chiqish» va o‘g‘irlangan tokenni bekor qilish uchun.
 */
@Entity('refresh_tokens')
export class RefreshToken extends BaseEntity {
  @Index()
  @Column({ length: 64, name: 'token_hash' })
  tokenHash!: string;

  @Index()
  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'revoked_at' })
  revokedAt!: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true, name: 'user_agent' })
  userAgent!: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true, name: 'ip_address' })
  ipAddress!: string | null;
}
