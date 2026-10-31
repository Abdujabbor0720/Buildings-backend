import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { moneyTransformer } from '../transformers';
import { ConstructionObject } from './construction-object.entity';
import { FundingSource } from './funding-source.entity';
import { FundingTransaction } from './funding-transaction.entity';

/**
 * YILLIK MOLIYALASHTIRISH REJASI: obyekt × manba × yil.
 *
 * ⚠️ Yil bo‘yicha bo‘linishi shart: 3 yillik qurilishda «qancha ajratilgan»
 * degan savol har doim YIL bilan beriladi («bu yil qancha berildi»).
 * Bitta umumiy summa saqlansa, byudjet rejasi bilan solishtirib bo‘lmasdi.
 */
@Entity('funding_allocations')
@Unique('uq_allocation_object_source_year', ['objectId', 'sourceId', 'year'])
@Index('idx_allocations_year', ['year'])
export class FundingAllocation extends BaseEntity {
  @Index()
  @Column('uuid', { name: 'object_id' })
  objectId!: string;

  @ManyToOne(() => ConstructionObject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'object_id' })
  object!: ConstructionObject;

  @Column('uuid', { name: 'source_id' })
  sourceId!: string;

  @ManyToOne(() => FundingSource, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'source_id' })
  source!: FundingSource;

  @ApiProperty({ example: 2026 })
  @Column('smallint')
  year!: number;

  @ApiProperty({ description: 'Rejada ko‘zda tutilgan summa' })
  @Column('numeric', {
    precision: 18,
    scale: 2,
    default: 0,
    name: 'planned_amount',
    transformer: moneyTransformer,
  })
  plannedAmount!: string;

  @ApiProperty({ description: 'Haqiqatda ajratilgan summa' })
  @Column('numeric', {
    precision: 18,
    scale: 2,
    default: 0,
    name: 'allocated_amount',
    transformer: moneyTransformer,
  })
  allocatedAmount!: string;

  @ApiProperty({ description: 'Pudratchiga to‘langan summa' })
  @Column('numeric', {
    precision: 18,
    scale: 2,
    default: 0,
    name: 'paid_amount',
    transformer: moneyTransformer,
  })
  paidAmount!: string;

  @Column('text', { nullable: true })
  note!: string | null;

  @OneToMany(() => FundingTransaction, (t) => t.allocation)
  transactions!: FundingTransaction[];
}
