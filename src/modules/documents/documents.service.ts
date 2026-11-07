import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ObjectDocument } from '../../database/entities/object-document.entity';
import { StoredFile } from '../../database/entities/stored-file.entity';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { diffInDays, tashkentToday } from '../../helpers/date.helpers';
import { AuditService } from '../audit/audit.service';
import type {
  CreateDocumentDto,
  DocumentQueryDto,
  UpdateDocumentDto,
} from './dto/document.dto';

/** Shuncha kun qolganda hujjat «tugayotgan» deb belgilanadi. */
export const DOCUMENT_EXPIRY_WARNING_DAYS = 30;

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(ObjectDocument)
    private readonly documents: Repository<ObjectDocument>,
    @InjectRepository(StoredFile)
    private readonly files: Repository<StoredFile>,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: DocumentQueryDto,
    user: AuthUser,
  ): Promise<PaginatedResult<ObjectDocument>> {
    const qb = this.documents
      .createQueryBuilder('doc')
      .leftJoinAndSelect('doc.object', 'o')
      .leftJoinAndSelect('o.district', 'district')
      // ⚠️ Hujjatni YUKLAGAN odam (`uploadedBy`) bilan obyekt
      // MAS'ULI boshqa-boshqa shaxslar — ikkalasi ham ko'rinadi.
      .leftJoinAndSelect('o.responsible', 'objectResponsible')
      .leftJoinAndSelect('doc.file', 'file')
      .leftJoinAndSelect('doc.uploadedBy', 'uploadedBy');

    // Obyektga bog‘lanmagan hujjatlar (`object_id IS NULL`) HAMMAGA ko‘rinadi:
    // ular umumiy me’yoriy hujjatlar, tuman cheklovi ularga tegishli emas.
    if (user.contractorId) {
      qb.andWhere('(o.contractor_id = :cid OR doc.object_id IS NULL)', {
        cid: user.contractorId,
      });
    } else if (user.districtId) {
      qb.andWhere('(o.district_id = :did OR doc.object_id IS NULL)', {
        did: user.districtId,
      });
    } else if (user.regionId) {
      qb.andWhere('(o.region_id = :rid OR doc.object_id IS NULL)', {
        rid: user.regionId,
      });
    }

    if (query.objectId)
      qb.andWhere('doc.object_id = :objectId', { objectId: query.objectId });
    if (query.districtId)
      qb.andWhere('o.district_id = :districtId', {
        districtId: query.districtId,
      });
    if (query.type?.length)
      qb.andWhere('doc.type IN (:...type)', { type: query.type });
    if (query.expiringOnly) {
      qb.andWhere('doc.expiry_date IS NOT NULL').andWhere(
        'doc.expiry_date <= CURRENT_DATE + :days::int',
        { days: DOCUMENT_EXPIRY_WARNING_DAYS },
      );
    }
    if (query.search) {
      qb.andWhere(
        '(doc.title ILIKE :s OR doc.number ILIKE :s OR o.name ILIKE :s)',
        {
          s: `%${query.search}%`,
        },
      );
    }

    const [items, total] = await qb
      .orderBy('doc.issuedDate', 'DESC', 'NULLS LAST')
      .addOrderBy('doc.createdAt', 'DESC')
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();

    return new PaginatedResult(items, total, query.page, query.limit);
  }

  async findOne(
    id: string,
  ): Promise<ObjectDocument & { daysUntilExpiry: number | null }> {
    const doc = await this.documents.findOne({
      where: { id },
      relations: { object: { district: true }, file: true, uploadedBy: true },
    });
    if (!doc) throw new NotFoundException('Hujjat topilmadi');

    return Object.assign(doc, {
      daysUntilExpiry: doc.expiryDate
        ? diffInDays(tashkentToday(), doc.expiryDate)
        : null,
    });
  }

  async create(
    dto: CreateDocumentDto,
    user: AuthUser,
  ): Promise<ObjectDocument> {
    if (
      dto.issuedDate &&
      dto.expiryDate &&
      (diffInDays(dto.issuedDate, dto.expiryDate) ?? 0) < 0
    ) {
      throw new BadRequestException(
        'Amal qilish muddati berilgan sanadan oldin bo‘la olmaydi',
      );
    }

    let url: string | null = null;
    if (dto.fileId) {
      const file = await this.files.findOne({ where: { id: dto.fileId } });
      if (!file) throw new BadRequestException('Biriktirilgan fayl topilmadi');
      url = file.url;
    }

    const doc = await this.documents.save(
      this.documents.create({ ...dto, url, uploadedById: user.id }),
    );

    await this.audit.record({
      userId: user.id,
      action: 'document.create',
      entity: 'ObjectDocument',
      entityId: doc.id,
      changes: { title: { before: null, after: doc.title } },
    });

    return this.documents.findOneOrFail({
      where: { id: doc.id },
      relations: { file: true },
    });
  }

  async update(
    id: string,
    dto: UpdateDocumentDto,
    user: AuthUser,
  ): Promise<ObjectDocument> {
    const doc = await this.documents.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('Hujjat topilmadi');

    if (dto.fileId && dto.fileId !== doc.fileId) {
      const file = await this.files.findOne({ where: { id: dto.fileId } });
      if (!file) throw new BadRequestException('Biriktirilgan fayl topilmadi');
      await this.documents.update(id, { ...dto, url: file.url });
    } else {
      await this.documents.update(id, dto);
    }

    await this.audit.record({
      userId: user.id,
      action: 'document.update',
      entity: 'ObjectDocument',
      entityId: id,
    });

    return this.documents.findOneOrFail({
      where: { id },
      relations: { file: true },
    });
  }

  async remove(id: string, user: AuthUser): Promise<{ message: string }> {
    const doc = await this.documents.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('Hujjat topilmadi');

    await this.documents.softDelete(id);
    await this.audit.record({
      userId: user.id,
      action: 'document.delete',
      entity: 'ObjectDocument',
      entityId: id,
    });

    return { message: `«${doc.title}» o‘chirildi` };
  }

  /** Muddati tugayotgan hujjatlar — ogohlantirish generatori shuni o‘qiydi. */
  expiringSoon(days = DOCUMENT_EXPIRY_WARNING_DAYS): Promise<ObjectDocument[]> {
    return this.documents
      .createQueryBuilder('doc')
      .leftJoinAndSelect('doc.object', 'o')
      .where('doc.expiry_date IS NOT NULL')
      .andWhere('doc.expiry_date >= CURRENT_DATE')
      .andWhere('doc.expiry_date <= CURRENT_DATE + :days::int', { days })
      .orderBy('doc.expiryDate', 'ASC')
      .getMany();
  }
}
