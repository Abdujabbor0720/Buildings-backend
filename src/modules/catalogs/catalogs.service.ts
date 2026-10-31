import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository, type ObjectLiteral } from 'typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { ConstructionType } from '../../database/entities/construction-type.entity';
import { DelayReason } from '../../database/entities/delay-reason.entity';
import { FundingSource } from '../../database/entities/funding-source.entity';
import { ObjectDelay } from '../../database/entities/object-delay.entity';
import type {
  CreateCatalogItemDto,
  UpdateCatalogItemDto,
} from './dto/catalog.dto';

/** Katalog yozuvining umumiy shakli — uchala jadval bir xil tuzilgan. */
interface CatalogRow extends ObjectLiteral {
  id: string;
  code: string;
  name: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
}

export type CatalogName =
  'construction-types' | 'funding-sources' | 'delay-reasons';

@Injectable()
export class CatalogsService {
  constructor(
    @InjectRepository(ConstructionType)
    private readonly types: Repository<ConstructionType>,
    @InjectRepository(FundingSource)
    private readonly sources: Repository<FundingSource>,
    @InjectRepository(DelayReason)
    private readonly reasons: Repository<DelayReason>,
    @InjectRepository(ConstructionObject)
    private readonly objects: Repository<ConstructionObject>,
    @InjectRepository(ObjectDelay)
    private readonly delays: Repository<ObjectDelay>,
  ) {}

  /* ───────────────────────── O‘qish ───────────────────────── */

  listConstructionTypes(onlyActive = false): Promise<ConstructionType[]> {
    return this.types.find({
      where: onlyActive ? { isActive: true } : {},
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  listFundingSources(onlyActive = false): Promise<FundingSource[]> {
    return this.sources.find({
      where: onlyActive ? { isActive: true } : {},
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  listDelayReasons(onlyActive = false): Promise<DelayReason[]> {
    return this.reasons.find({
      where: onlyActive ? { isActive: true } : {},
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  /** Barcha kataloglar bitta so‘rovda — frontend ilova ochilishida shuni oladi. */
  async all(): Promise<{
    constructionTypes: ConstructionType[];
    fundingSources: FundingSource[];
    delayReasons: DelayReason[];
  }> {
    const [constructionTypes, fundingSources, delayReasons] = await Promise.all(
      [
        this.listConstructionTypes(true),
        this.listFundingSources(true),
        this.listDelayReasons(true),
      ],
    );
    return { constructionTypes, fundingSources, delayReasons };
  }

  /* ───────────────────────── Yozish ───────────────────────── */

  create(catalog: CatalogName, dto: CreateCatalogItemDto): Promise<CatalogRow> {
    return this.withRepo(catalog, async (repo, label) => {
      if (await repo.findOne({ where: { code: dto.code } })) {
        throw new ConflictException(
          `${label}: «${dto.code}» kodi allaqachon band`,
        );
      }
      return repo.save(repo.create(dto as Partial<CatalogRow>));
    });
  }

  update(
    catalog: CatalogName,
    id: string,
    dto: UpdateCatalogItemDto,
  ): Promise<CatalogRow> {
    return this.withRepo(catalog, async (repo, label) => {
      const row = await repo.findOne({ where: { id } });
      if (!row) throw new NotFoundException(`${label}: yozuv topilmadi`);

      if (dto.code && dto.code !== row.code) {
        if (await repo.findOne({ where: { code: dto.code, id: Not(id) } })) {
          throw new ConflictException(
            `${label}: «${dto.code}» kodi allaqachon band`,
          );
        }
      }
      Object.assign(row, dto);
      return repo.save(row);
    });
  }

  /**
   * ⚠️ O‘CHIRILMAYDI — ARXIVLANADI (`isActive = false`).
   * Katalog yozuviga o‘tgan obyektlar va kechikishlar ishora qiladi;
   * jismonan o‘chirilsa, eski hisobotdagi «Ta'lim muassasalari» ustuni
   * jimgina bo‘shab qolardi. Yangi obyektda u tanlanmaydi, xolos.
   */
  async archive(
    catalog: CatalogName,
    id: string,
  ): Promise<{ message: string; usedBy: number }> {
    return this.withRepo(catalog, async (repo, label) => {
      const row = await repo.findOne({ where: { id } });
      if (!row) throw new NotFoundException(`${label}: yozuv topilmadi`);

      const usedBy = await this.usageCount(catalog, id);
      row.isActive = false;
      await repo.save(row);

      return {
        message:
          usedBy > 0
            ? `«${row.name}» arxivlandi. ${usedBy} ta mavjud yozuv unga bog‘liqligicha qoladi.`
            : `«${row.name}» arxivlandi.`,
        usedBy,
      };
    });
  }

  async restore(catalog: CatalogName, id: string): Promise<CatalogRow> {
    return this.withRepo(catalog, async (repo, label) => {
      const row = await repo.findOne({ where: { id } });
      if (!row) throw new NotFoundException(`${label}: yozuv topilmadi`);
      row.isActive = true;
      return repo.save(row);
    });
  }

  /** Nechta yozuv bu katalog elementiga bog‘langan. */
  private usageCount(catalog: CatalogName, id: string): Promise<number> {
    switch (catalog) {
      case 'construction-types':
        return this.objects.count({ where: { typeId: id } });
      case 'funding-sources':
        return this.objects.count({ where: { fundingSourceId: id } });
      case 'delay-reasons':
        return this.delays.count({ where: { reasonId: id } });
    }
  }

  private withRepo<T>(
    catalog: CatalogName,
    fn: (repo: Repository<CatalogRow>, label: string) => Promise<T>,
  ): Promise<T> {
    switch (catalog) {
      case 'construction-types':
        return fn(this.types, 'Qurilish turi');
      case 'funding-sources':
        return fn(this.sources, 'Moliyalashtirish manbai');
      case 'delay-reasons':
        return fn(this.reasons, 'Kechikish sababi');
      default:
        throw new NotFoundException('Bunday katalog mavjud emas');
    }
  }
}
