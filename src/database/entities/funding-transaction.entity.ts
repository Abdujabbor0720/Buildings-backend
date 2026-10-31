import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { FundingTxType } from '../../common/constants/enums';
import { moneyTransformer } from '../transformers';
import { ConstructionObject } from './construction-object.entity';
import { FundingAllocation } from './funding-allocation.entity';
import { User } from './user.entity';

/**
 * MOLIYAVIY HARAKAT — append-only daftar.
 *
 * ⚠️ Xato yozuv TAHRIRLANMAYDI va O‘CHIRILMAYDI: teskari (kompensatsiya)
 * qatori yoziladi (`ADJUSTMENT`, manfiy summa bilan). Shu tufayli
 * `allocations.allocated_amount` har doim shu daftarning yig‘indisiga teng
 * bo‘ladi va «pul qayerdan paydo bo‘ldi» degan savol javobsiz qolmaydi.
 */
@Entity('funding_transactions')
@Index('idx_funding_tx_object_date', ['objectId', 'occurredAt'])
export class FundingTransaction extends BaseEntity {
  @Index()
  @Column('uuid', { name: 'object_id' })
  objectId!: string;

  @ManyToOne(() => ConstructionObject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'object_id' })
  object!: ConstructionObject;

  @Column('uuid', { nullable: true, name: 'allocation_id' })
  allocationId!: string | null;

  @ManyToOne(() => FundingAllocation, (a) => a.transactions, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'allocation_id' })
  allocation!: FundingAllocation | null;

  @ApiProperty({ enum: FundingTxType })
  @Index()
  @Column({ length: 20 })
  type!: FundingTxType;

  @ApiProperty({ description: 'Summa. ADJUSTMENT da manfiy bo‘lishi mumkin.' })
  @Column('numeric', { precision: 18, scale: 2, transformer: moneyTransformer })
  amount!: string;

  @Column('date', { name: 'occurred_at' })
  occurredAt!: string;

  @ApiProperty({ example: '№ 318-T' })
  @Column({
    type: 'varchar',
    length: 80,
    nullable: true,
    name: 'document_number',
  })
  documentNumber!: string | null;

  @Column('text', { nullable: true })
  note!: string | null;

  @Column('uuid', { nullable: true, name: 'created_by_id' })
  createdById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: User | null;
}
