import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { AiAnalysisType, RiskLevel } from '../../common/constants/enums';
import { decimalTransformer } from '../transformers';
import { ConstructionObject } from './construction-object.entity';

/**
 * AI TAHLIL natijasi — «AI tahlil» bo‘limi.
 *
 * ⚠️ AI natijasi obyektning HOLATINI O‘ZGARTIRMAYDI. `healthStatus` har doim
 * `evaluateObjectHealth()` dan keladi (shaffof, tekshirib bo‘ladigan
 * formula); AI esa yonida TAVSIYA sifatida turadi. Aks holda hokim
 * ko‘rayotgan raqamning qaerdan kelgani tushuntirib bo‘lmas edi.
 *
 * `details` — modelga xos erkin struktura (`jsonb`): har tahlil turi
 * o‘z maydonlarini yozadi, sxema migratsiyasiz kengayadi.
 */
@Entity('ai_analyses')
@Index('idx_ai_object_type_date', ['objectId', 'type', 'createdAt'])
export class AiAnalysis extends BaseEntity {
  @Index()
  @Column('uuid', { name: 'object_id' })
  objectId!: string;

  @ManyToOne(() => ConstructionObject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'object_id' })
  object!: ConstructionObject;

  @ApiProperty({ enum: AiAnalysisType })
  @Column({ length: 40 })
  type!: AiAnalysisType;

  @ApiProperty({ example: 72, description: '0–100' })
  @Column('numeric', {
    precision: 5,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  score!: number;

  @ApiProperty({ enum: RiskLevel })
  @Column({ length: 20, default: RiskLevel.LOW, name: 'risk_level' })
  riskLevel!: RiskLevel;

  @ApiProperty({
    example: 'Obyekt 2027-yil fevralda topshirilishi ehtimoli yuqori.',
  })
  @Column('text')
  summary!: string;

  /** Tavsiyalar ro‘yxati — foydalanuvchiga ko‘rsatiladigan amaliy qadamlar. */
  @Column('jsonb', { nullable: true })
  recommendations!: string[] | null;

  @Column('jsonb', { nullable: true })
  details!: Record<string, unknown> | null;

  @ApiProperty({
    example: 'rule-engine-v1',
    description: 'Natijani kim/nima chiqargani',
  })
  @Column({ length: 60, default: 'rule-engine-v1' })
  model!: string;
}
