import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoredFile } from '../../database/entities/stored-file.entity';
import { SpacesStorageEngine } from '../storage/spaces.storage-engine';
import { StorageService } from '../storage/storage.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([StoredFile]),
    /**
     * ⚠️ `memoryStorage` ham, `diskStorage` ham ISHLATILMAYDI: fayl
     * to‘g‘ridan-to‘g‘ri Spaces'ga oqim bilan ketadi. 100 MB lik video
     * na serverning xotirasida, na diskida to‘planadi.
     */
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService, StorageService],
      useFactory: (config: ConfigService, storage: StorageService) => {
        const maxBytes =
          (config.get<number>('upload.maxFileSizeMb') ?? 100) * 1024 * 1024;
        return {
          storage: new SpacesStorageEngine(storage, maxBytes, 'general'),
          limits: {
            // Busboy darajasidagi qattiq to‘siq. Dvigatel ichida ham
            // sanaladi — u yerdagi xato xabari foydalanuvchiga tushunarli.
            fileSize: maxBytes,
            files: 10,
            fields: 20,
          },
        };
      },
    }),
  ],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
