import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';

/**
 * ⚠️ `@Global`: fayl saqlash ko‘plab modulga kerak (fayllar, foto-hisobot,
 * hujjat, AI). Har birida qayta import qilish o‘rniga bir marta e’lon
 * qilinadi — bu NestJS'da aynan shunday holatlar uchun mo‘ljallangan.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
