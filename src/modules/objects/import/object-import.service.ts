import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';
import { ObjectStatus, UserRole } from '../../../common/constants/enums';
import { ConstructionObject } from '../../../database/entities/construction-object.entity';
import { ConstructionType } from '../../../database/entities/construction-type.entity';
import { Contractor } from '../../../database/entities/contractor.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { District } from '../../../database/entities/district.entity';
import { FundingSource } from '../../../database/entities/funding-source.entity';
import { Region } from '../../../database/entities/region.entity';
import { User } from '../../../database/entities/user.entity';
import { AuditService } from '../../audit/audit.service';
import { ObjectHealthService } from '../object-health.service';
import { detectFileType, SNIFF_BYTES } from '../../storage/file-type.helpers';
import { parseImportWorkbook } from './object-import.parser';
import { buildImportTemplate } from './object-import.template';
import {
  parseDate,
  parseInteger,
  parseMoney,
  parseNumber,
  refKey,
} from './object-import.values';
import {
  COLUMN_SPECS,
  type ImportColumnKey,
  type ImportReport,
  type ImportRowPreview,
  type RawImportRow,
  type RowIssue,
} from './object-import.types';

const HEADER_OF = new Map<ImportColumnKey, string>(
  COLUMN_SPECS.map((s) => [s.key, s.header]),
);

interface PreparedRow {
  rowNumber: number;
  data: Partial<ConstructionObject>;
  preview: ImportRowPreview;
}

/**
 * OBYEKTLARNI EXCEL ORQALI OMMAVIY YUKLASH.
 *
 * ⚠️ HAMMASI YOKI HECH NARSA. Avval FAYLNING HAMMA qatori tekshiriladi;
 * bitta xato bo‘lsa ham birorta obyekt yozilmaydi.
 *
 * Nega shunday: qisman yuklashda odam faylni tuzatib qayta yuboradi va
 * birinchi safar o‘tgan qatorlar IKKI MARTA yoziladi. 200 ta obyektni
 * qo‘lda qidirib o‘chirish — aynan shu xatoning narxi.
 *
 * ⚠️ `dryRun` va haqiqiy yuklash BITTA kod yo‘lidan o‘tadi. Ikki alohida
 * yo‘l bo‘lsa, ko‘rib chiqishda «hammasi joyida» deb ko‘rsatilgan fayl
 * yozishda boshqacha xatti-harakat qilishi mumkin edi.
 */
@Injectable()
export class ObjectImportService {
  private readonly logger = new Logger(ObjectImportService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ConstructionObject)
    private readonly objects: Repository<ConstructionObject>,
    private readonly health: ObjectHealthService,
    private readonly audit: AuditService,
  ) {}

  /** Shablon — ustunlar, izohlar va HAQIQIY katalog nomlari bilan. */
  async buildTemplate(): Promise<Buffer> {
    const refs = await this.loadReferences();
    const people = await this.dataSource.getRepository(User).find({
      where: { isActive: true },
      select: { id: true, email: true, firstName: true, lastName: true },
      order: { lastName: 'ASC' },
      take: 300,
    });

    return buildImportTemplate({
      districts: refs.districtNames,
      types: refs.typeNames,
      customers: [...refs.customers.values()].map((c) => c.name),
      // ⚠️ `Set` orqali: pudratchi ikki kalit bilan (nom + qisqartma)
      // yozilgan bo‘lsa, ro‘yxatda ikki marta chiqib qolardi.
      contractors: [
        ...new Set([...refs.contractors.values()].map((c) => c.name)),
      ],
      fundingSources: [...refs.sources.values()].map((s) => s.name),
      responsibles: people.map((u) => ({
        name: `${u.lastName} ${u.firstName}`,
        email: u.email,
      })),
    });
  }

  async run(
    buffer: Buffer,
    dryRun: boolean,
    user: AuthUser,
    declaredMime?: string,
  ): Promise<ImportReport> {
    // ⚠️ `Content-Type` ga ISHONILMAYDI — uni jo‘natuvchi yozadi.
    // Fayl BAYTLARIDAN aniqlanadi: `.xlsx` — ichida `xl/workbook.xml`
    // bor ZIP. Busiz bajariladigan fayl `.xlsx` nomi bilan kelib,
    // kutubxonaga berilardi.
    const detected = detectFileType(
      buffer.subarray(0, SNIFF_BYTES),
      declaredMime,
    );
    if (detected?.ext !== '.xlsx') {
      throw new BadRequestException(
        'Faqat .xlsx fayl qabul qilinadi (.xls, .csv va boshqalar qo‘llanmaydi)',
      );
    }

    const { rows, missingColumns } = await parseImportWorkbook(buffer);
    if (missingColumns.length > 0) {
      throw new BadRequestException(
        `Faylda majburiy ustunlar yo‘q: ${missingColumns.join(', ')}. Shablonni yuklab oling.`,
      );
    }

    const refs = await this.loadReferences();
    const errors: RowIssue[] = [];
    const warnings: RowIssue[] = [];
    const prepared: PreparedRow[] = [];

    // ⚠️ Fayl ICHIDAGI takror ham tekshiriladi: bitta faylda bir nomli
    // ikki qator bo‘lsa, baza tekshiruvi ularni ushlay olmaydi (ikkalasi
    // ham hali yo‘q).
    const seenInFile = new Map<string, number>();

    for (const row of rows) {
      const rowErrors: RowIssue[] = [];
      const rowWarnings: RowIssue[] = [];
      const data = this.prepareRow(row, refs, user, rowErrors, rowWarnings);

      if (data) {
        const dupKey = `${refKey(data.name ?? '')}|${data.districtId}`;
        const firstSeen = seenInFile.get(dupKey);
        if (firstSeen !== undefined) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            column: HEADER_OF.get('name') ?? null,
            message: `Shu nom va tuman ${firstSeen}-qatorda allaqachon bor — faylda takror`,
          });
        } else if (refs.existing.has(dupKey)) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            column: HEADER_OF.get('name') ?? null,
            message: 'Shu nomli obyekt bu tumanda bazada ALLAQACHON bor',
          });
        } else {
          seenInFile.set(dupKey, row.rowNumber);
        }
      }

      const ok = rowErrors.length === 0 && data !== null;

      errors.push(...rowErrors);
      // ⚠️ Ogohlantirish FAQAT yoziladigan qator uchun. Xatosi bor qator
      // baribir yuklanmaydi — uning «mas’ul biriktirilmagan» ogohi
      // ro‘yxatni ko‘mib, haqiqiy xatolarni ko‘rinmas qilardi
      // (8 qatorli faylda 22 ta ogoh, 7 ta xato).
      if (ok) warnings.push(...rowWarnings);
      const preview: ImportRowPreview = {
        rowNumber: row.rowNumber,
        name: row.values.name || '—',
        districtName: row.values.districtName || '—',
        typeName: row.values.typeName || '—',
        ok,
      };
      if (ok && data)
        prepared.push({ rowNumber: row.rowNumber, data, preview });
      else prepared.push({ rowNumber: row.rowNumber, data: {}, preview });
    }

    const report: ImportReport = {
      totalRows: rows.length,
      validRows: prepared.filter((p) => p.preview.ok).length,
      dryRun,
      created: 0,
      errors,
      warnings,
      rows: prepared.map((p) => p.preview),
    };

    if (dryRun || errors.length > 0) return report;

    report.created = await this.commit(
      prepared.filter((p) => p.preview.ok),
      refs,
      user,
    );
    return report;
  }

  /* ───────────────────────── Katalog ───────────────────────── */

  private async loadReferences() {
    const [districts, types, customers, contractors, sources, users, objects] =
      await Promise.all([
        this.dataSource
          .getRepository(District)
          .find({ where: { isActive: true } }),
        this.dataSource
          .getRepository(ConstructionType)
          .find({ where: { isActive: true } }),
        this.dataSource
          .getRepository(Customer)
          .find({ where: { isActive: true } }),
        this.dataSource.getRepository(Contractor).find(),
        this.dataSource
          .getRepository(FundingSource)
          .find({ where: { isActive: true } }),
        this.dataSource.getRepository(User).find({
          where: { isActive: true },
          select: { id: true, email: true, firstName: true, lastName: true },
        }),
        this.objects.find({
          select: { id: true, name: true, districtId: true },
        }),
      ]);

    const byName = <T extends { name: string; id: string }>(list: T[]) =>
      new Map(list.map((item) => [refKey(item.name), item]));

    return {
      districts: byName(districts),
      types: byName(types),
      customers: byName(customers),
      contractors: byName(contractors),
      sources: byName(sources),
      /** Mas’ul — EMAIL yoki «Familiya Ism» bo‘yicha topiladi. */
      users: new Map<string, User>([
        ...users.map((u) => [refKey(u.email), u] as const),
        ...users.map(
          (u) => [refKey(`${u.lastName} ${u.firstName}`), u] as const,
        ),
      ]),
      existing: new Set(
        objects.map((o) => `${refKey(o.name)}|${o.districtId}`),
      ),
      districtNames: districts.map((d) => d.name),
      typeNames: types.map((t) => t.name),
    };
  }

  /* ───────────────────────── Bitta qator ───────────────────────── */

  private prepareRow(
    row: RawImportRow,
    refs: Awaited<ReturnType<ObjectImportService['loadReferences']>>,
    user: AuthUser,
    errors: RowIssue[],
    warnings: RowIssue[],
  ): Partial<ConstructionObject> | null {
    const v = row.values;
    const fail = (key: ImportColumnKey | null, message: string) =>
      errors.push({
        rowNumber: row.rowNumber,
        column: key ? (HEADER_OF.get(key) ?? null) : null,
        message,
      });
    const warn = (key: ImportColumnKey | null, message: string) =>
      warnings.push({
        rowNumber: row.rowNumber,
        column: key ? (HEADER_OF.get(key) ?? null) : null,
        message,
      });

    /* ── Nomi ── */
    const name = v.name.trim();
    if (name.length < 5)
      fail('name', 'Obyekt nomi kamida 5 belgi bo‘lishi kerak');
    if (name.length > 300)
      fail('name', 'Obyekt nomi 300 belgidan oshmasligi kerak');

    /* ── Tuman ── */
    const district = refs.districts.get(refKey(v.districtName));
    if (!district) {
      fail(
        'districtName',
        v.districtName
          ? `«${v.districtName}» — bunday tuman yo‘q`
          : 'Tuman ko‘rsatilmagan',
      );
    } else if (
      user.role === UserRole.DISTRICT_ADMIN &&
      user.districtId &&
      user.districtId !== district.id
    ) {
      // ⚠️ Doira tekshiruvi HAR QATORDA: tuman admini faylga boshqa
      // tumanni yozib, o‘z huquqidan chetga chiqa olmasligi kerak.
      fail('districtName', 'Bu tumanda obyekt yaratishga ruxsatingiz yo‘q');
    }

    /* ── Turi ── */
    const type = refs.types.get(refKey(v.typeName));
    if (!type) {
      fail(
        'typeName',
        v.typeName
          ? `«${v.typeName}» — bunday qurilish turi yo‘q`
          : 'Qurilish turi ko‘rsatilmagan',
      );
    }

    /* ── Qiymati ── */
    const totalCost = parseMoney(v.totalCost);
    if (totalCost === null)
      fail('totalCost', 'Qiymat son bo‘lishi kerak (faqat raqamlar)');
    else if (totalCost <= 0)
      fail('totalCost', 'Qiymat noldan katta bo‘lishi kerak');

    /* ── Sanalar ── */
    const start = parseDate(v.plannedStartDate);
    const end = parseDate(v.plannedEndDate);
    if (!start)
      fail('plannedStartDate', 'Sana tushunarsiz. Masalan: 01.03.2026');
    if (!end) fail('plannedEndDate', 'Sana tushunarsiz. Masalan: 20.12.2027');
    if (start && end && end <= start) {
      fail(
        'plannedEndDate',
        'Tugash sanasi boshlanish sanasidan keyin bo‘lishi kerak',
      );
    }

    /* ── Ixtiyoriy bog‘lanishlar ── */
    const customer = v.customerName
      ? refs.customers.get(refKey(v.customerName))
      : undefined;
    if (v.customerName && !customer)
      fail('customerName', `«${v.customerName}» — bunday buyurtmachi yo‘q`);

    const contractor = v.contractorName
      ? refs.contractors.get(refKey(v.contractorName))
      : undefined;
    if (v.contractorName && !contractor)
      fail('contractorName', `«${v.contractorName}» — bunday pudratchi yo‘q`);
    if (!v.contractorName)
      warn(
        'contractorName',
        'Pudratchi biriktirilmagan — keyin biriktirishingiz mumkin',
      );

    const responsible = v.responsible
      ? refs.users.get(refKey(v.responsible))
      : undefined;
    if (v.responsible && !responsible) {
      fail(
        'responsible',
        `«${v.responsible}» — bunday foydalanuvchi yo‘q (email bilan yozing)`,
      );
    }
    if (!v.responsible) {
      // ⚠️ XATO EMAS, ogohlantirish: obyekt mas’ulsiz ham mavjud bo‘ladi
      // va keyin biriktiriladi. Majburiy qilinsa, qabulxona ma’lumotni
      // umuman kirita olmay qolardi.
      warn(
        'responsible',
        'Mas’ul shaxs biriktirilmagan — obyekt yaratilgach biriktiring',
      );
    }

    const source = v.fundingSourceName
      ? refs.sources.get(refKey(v.fundingSourceName))
      : undefined;
    if (v.fundingSourceName && !source) {
      fail(
        'fundingSourceName',
        `«${v.fundingSourceName}» — bunday moliyalashtirish manbasi yo‘q`,
      );
    }

    /* ── Koordinata ── */
    const lat = parseNumber(v.lat);
    const lng = parseNumber(v.lng);
    if (v.lat && lat === null) fail('lat', 'Kenglik son bo‘lishi kerak');
    if (v.lng && lng === null) fail('lng', 'Uzunlik son bo‘lishi kerak');
    if (lat !== null && (lat < -90 || lat > 90))
      fail('lat', 'Kenglik −90 … 90 oralig‘ida bo‘lishi kerak');
    if (lng !== null && (lng < -180 || lng > 180))
      fail('lng', 'Uzunlik −180 … 180 oralig‘ida bo‘lishi kerak');
    if ((lat === null) !== (lng === null)) {
      fail(
        'lat',
        'Kenglik va uzunlik BIRGA to‘ldiriladi yoki ikkalasi ham bo‘sh qoladi',
      );
    } else if (lat === null) {
      warn(
        'lat',
        'Koordinata yo‘q — obyekt xaritada ko‘rinmaydi. Keyin obyektni tahrirlab, xaritadan belgilashingiz mumkin',
      );
    }

    /* ── Sonli ixtiyoriylar ── */
    const capacity = parseInteger(v.capacity);
    if (v.capacity && capacity === null)
      fail('capacity', 'Quvvat butun son bo‘lishi kerak');
    const floors = parseInteger(v.floors);
    if (v.floors && floors === null)
      fail('floors', 'Qavatlar soni butun son bo‘lishi kerak');

    const progress = parseNumber(v.progressPercent);
    if (v.progressPercent && progress === null)
      fail('progressPercent', 'Bajarilish son bo‘lishi kerak');
    if (progress !== null && (progress < 0 || progress > 100)) {
      fail('progressPercent', 'Bajarilish 0 va 100 oralig‘ida bo‘lishi kerak');
    }

    if (errors.some((e) => e.rowNumber === row.rowNumber)) return null;

    return {
      name,
      description: v.description || null,
      districtId: district!.id,
      regionId: district!.regionId,
      typeId: type!.id,
      address: v.address || null,
      lat,
      lng,
      customerId: customer?.id ?? null,
      contractorId: contractor?.id ?? null,
      responsibleId: responsible?.id ?? null,
      fundingSourceId: source?.id ?? null,
      totalCost: totalCost!.toFixed(2),
      capacity,
      capacityUnit: v.capacityUnit || null,
      floors,
      plannedStartDate: start!,
      plannedEndDate: end!,
      status: ObjectStatus.NOT_STARTED,
      progressPercent: progress ?? 0,
    };
  }

  /* ───────────────────────── Yozish ───────────────────────── */

  private async commit(
    rows: PreparedRow[],
    refs: Awaited<ReturnType<ObjectImportService['loadReferences']>>,
    user: AuthUser,
  ): Promise<number> {
    if (rows.length === 0) return 0;

    const ids = await this.dataSource.transaction(async (em) => {
      // ⚠️ Kod generatori advisory lock oladi va u TRANZAKSIYA oxirigacha
      // ushlanadi, shuning uchun raqamlar ketma-ket va takrorsiz chiqadi
      // hatto ikki odam bir vaqtda yuklasa ham.
      const regionIds = [...new Set(rows.map((r) => r.data.regionId!))];
      const regions = await em.find(Region, { where: { id: In(regionIds) } });
      const prefixOf = new Map(
        regions.map((r) => [r.id, (r.code ?? 'OBJ').slice(0, 3).toUpperCase()]),
      );

      /** `AND-2026` → keyingi tartib raqami. Bitta tranzaksiyada hisoblanadi. */
      const nextOf = new Map<string, number>();
      const created: ConstructionObject[] = [];

      for (const row of rows) {
        const prefix = prefixOf.get(row.data.regionId!) ?? 'OBJ';
        const year = new Date(
          `${row.data.plannedStartDate}T00:00:00Z`,
        ).getUTCFullYear();
        const lockKey = `${prefix}-${year}`;

        if (!nextOf.has(lockKey)) {
          await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
            lockKey,
          ]);
          const found = await em.query<Array<{ max: string | null }>>(
            `SELECT MAX(CAST(SPLIT_PART(code, '-', 3) AS int))::text AS max
               FROM construction_objects
              WHERE code LIKE $1`,
            [`${lockKey}-%`],
          );
          nextOf.set(lockKey, Number(found[0]?.max ?? 0));
        }

        const next = nextOf.get(lockKey)! + 1;
        nextOf.set(lockKey, next);

        created.push(
          em.create(ConstructionObject, {
            ...row.data,
            code: `${lockKey}-${String(next).padStart(4, '0')}`,
          }),
        );
      }

      const saved = await em.save(created, { chunk: 100 });
      for (const object of saved) await this.health.refreshOne(object.id, em);
      return saved.map((o) => o.id);
    });

    // ⚠️ Audit TRANZAKSIYADAN KEYIN va BITTA yozuv bilan: har obyekt uchun
    // alohida yozuv 500 qatorli faylda audit jurnalini ko‘mib yuborardi.
    await this.audit.record({
      userId: user.id,
      action: 'object.import',
      entity: 'ConstructionObject',
      entityId: ids[0] ?? null,
      changes: { imported: { before: null, after: ids.length } },
    });

    this.logger.log(
      `Excel import: ${ids.length} ta obyekt yaratildi (${user.id})`,
    );
    void refs;
    return ids.length;
  }
}
