import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ObjectHealthService } from './object-health.service';

/**
 * ⚠️ Kechikish KUN O‘TISHI BILAN o‘sadi — hech kim hech narsa kiritmasa ham.
 * Shu sababli holat har kecha qayta hisoblanadi: busiz «38 ta kechikayotgan»
 * raqami oxirgi tahrir kunida qotib qolardi.
 *
 * Vaqt 02:00 — tungi zaxira nusxadan keyin va ish kuni boshlanishidan ancha
 * oldin. Hamma cron `Asia/Tashkent` da belgilanadi.
 */
@Injectable()
export class ObjectsCron {
  private readonly logger = new Logger(ObjectsCron.name);

  constructor(private readonly health: ObjectHealthService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM, {
    name: 'object-health-refresh',
    timeZone: 'Asia/Tashkent',
  })
  async refreshHealth(): Promise<void> {
    this.logger.log('Tungi pass: obyektlar holati qayta hisoblanmoqda…');
    try {
      const report = await this.health.refreshAll();
      this.logger.log(
        `Tungi pass yakunlandi: ${report.updated}/${report.scanned} obyekt yangilandi (${report.durationMs}ms)`,
      );
    } catch (error) {
      this.logger.error(
        'Tungi pass yiqildi',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
