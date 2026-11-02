import { Module } from '@nestjs/common';
import { BootstrapService } from './bootstrap.service';

/**
 * ⚠️ Jadval (entity) ro‘yxatini olmaydi: `BootstrapService` `DataSource`
 * bilan to‘g‘ridan-to‘g‘ri ishlaydi, chunki u bitta tranzaksiyada OLTI xil
 * jadvalga yozadi. Har birini `forFeature` ga qo‘shish shu modulni domen
 * modullariga bog‘lab qo‘yardi.
 */
@Module({ providers: [BootstrapService] })
export class BootstrapModule {}
