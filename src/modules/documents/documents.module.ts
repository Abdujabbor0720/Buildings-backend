import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ObjectDocument } from '../../database/entities/object-document.entity';
import { StoredFile } from '../../database/entities/stored-file.entity';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [TypeOrmModule.forFeature([ObjectDocument, StoredFile])],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
