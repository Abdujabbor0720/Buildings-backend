import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { basename } from 'node:path';
import { Repository } from 'typeorm';
import { StoredFile } from '../../database/entities/stored-file.entity';
import {
  ALLOWED_SUMMARY_UZ,
  detectFileType,
  SNIFF_BYTES,
} from '../storage/file-type.helpers';
import type { SpacesFileInfo } from '../storage/spaces.storage-engine';
import { StorageService } from '../storage/storage.service';

/** Multer dvigateli to‘ldirgan maydonlar bilan kengaytirilgan fayl. */
export type UploadedSpacesFile = Express.Multer.File & Partial<SpacesFileInfo>;

@Injectable()
export class FilesService {
  private readonly maxBytes: number;

  constructor(
    @InjectRepository(StoredFile)
    private readonly files: Repository<StoredFile>,
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.maxBytes =
      (config.get<number>('upload.maxFileSizeMb') ?? 100) * 1024 * 1024;
  }

  /**
   * Multer allaqachon Spaces'ga yozgan faylning metama’lumotini qayd etadi.
   *
   * ⚠️ Bu yerda fayl QAYTA yuklanmaydi va tur QAYTA tekshirilmaydi — ikkalasi
   * ham dvigatelda, oqim o‘tayotganda bajarilgan. Bu yerda faqat baza.
   */
  async record(
    file: UploadedSpacesFile,
    uploadedById: string | null,
  ): Promise<StoredFile> {
    if (!file?.key) {
      // Dvigatel almashtirilgan yoki xato sozlangan — jim qolmaslik kerak.
      throw new BadRequestException(
        'Fayl saqlanmadi — yuklovni qayta urinib ko‘ring',
      );
    }

    return this.files.save(
      this.files.create({
        originalName: (file.originalname || basename(file.key)).slice(0, 300),
        storedName: basename(file.key),
        mimeType: file.mimetype,
        size: String(file.size ?? 0),
        path: file.key,
        url: file.url ?? '',
        uploadedById,
      }),
    );
  }

  /**
   * SERVER O‘ZI yaratgan faylni saqlash (generatsiya qilingan hisobot,
   * eksport). Tur baribir MAZMUNDAN aniqlanadi — «o‘zimiz yaratganmiz»
   * degan ishonch kodda xato bo‘lsa jim o‘tib ketardi.
   */
  async saveBuffer(
    buffer: Buffer,
    originalName: string,
    declaredMime: string,
    uploadedById: string | null,
    subdir = 'general',
  ): Promise<StoredFile> {
    if (buffer.length > this.maxBytes) {
      throw new BadRequestException(
        `Fayl hajmi ${Math.round(this.maxBytes / 1024 / 1024)} MB dan oshmasligi kerak`,
      );
    }

    const detected = detectFileType(
      buffer.subarray(0, SNIFF_BYTES),
      declaredMime,
    );
    if (!detected) {
      throw new BadRequestException(
        `Fayl turi aniqlanmadi yoki qabul qilinmaydi. Ruxsat etilgan: ${ALLOWED_SUMMARY_UZ}.`,
      );
    }

    const key = this.storage.buildKey(subdir, detected.ext);
    const result = await this.storage.putBuffer(
      buffer,
      key,
      detected,
      originalName,
    );

    return this.files.save(
      this.files.create({
        originalName: originalName.slice(0, 300),
        storedName: basename(key),
        mimeType: detected.mime,
        size: String(result.size),
        path: key,
        url: result.url,
        uploadedById,
      }),
    );
  }

  async findOne(id: string): Promise<StoredFile> {
    const file = await this.files.findOne({ where: { id } });
    if (!file) throw new NotFoundException('Fayl topilmadi');
    return file;
  }

  async findByStoredName(storedName: string): Promise<StoredFile> {
    const file = await this.files.findOne({ where: { storedName } });
    if (!file) throw new NotFoundException('Fayl topilmadi');
    return file;
  }

  /**
   * Faylga olib boradigan manzil.
   *
   * ⚠️ Ochiq bucket'da bu CDN havolasi va u BIZNING serverimizdan
   * o‘tmaydi — yuzlab surat bir ekranda ochilganda ham yuk tushmaydi.
   * Yopiq bucket'da — qisqa muddatli imzolangan havola.
   */
  async urlFor(file: StoredFile): Promise<string> {
    if (file.url) return file.url;
    return this.storage.resolveUrl(file.path);
  }

  async remove(id: string): Promise<{ message: string }> {
    const file = await this.findOne(id);

    // Avval baza, keyin obyekt xotirasi: obyekt o‘chmay qolsa — «yetim»
    // fayl qoladi (zararsiz). Teskarisi bo‘lsa — bazada bor, bucket'da
    // yo‘q yozuv qolib, har ochishda 404 chiqarardi.
    await this.files.softDelete(id);
    await this.storage.remove(file.path);

    return { message: `«${file.originalName}» o‘chirildi` };
  }
}
