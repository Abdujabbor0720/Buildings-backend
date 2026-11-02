import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { ENTITIES } from './database/entities/entity-list';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { BootstrapModule } from './database/bootstrap/bootstrap.module';
import { AiModule } from './modules/ai/ai.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogsModule } from './modules/catalogs/catalogs.module';
import { ContractorsModule } from './modules/contractors/contractors.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DelaysModule } from './modules/delays/delays.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { FilesModule } from './modules/files/files.module';
import { StorageModule } from './modules/storage/storage.module';
import { FundingModule } from './modules/funding/funding.module';
import { GeoModule } from './modules/geo/geo.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ObjectsModule } from './modules/objects/objects.module';
import { PhotoReportsModule } from './modules/photo-reports/photo-reports.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SettingsModule } from './modules/settings/settings.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      // @nestjs/config v12 Standard Schema (standardschema.dev) bilan
      // ishlaydi; Joi 18 shu spetsifikatsiyani qo‘llab-quvvatlaydi.
      validationSchema,
      cache: true,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.getOrThrow<string>('database.host'),
        port: config.getOrThrow<number>('database.port'),
        username: config.getOrThrow<string>('database.username'),
        password: config.getOrThrow<string>('database.password'),
        database: config.getOrThrow<string>('database.name'),
        entities: ENTITIES,
        // ⚠️ `synchronize` HECH QACHON yoqilmaydi — sxema faqat migratsiya
        // orqali o‘zgaradi (`src/config/data-source.ts` ga qarang).
        synchronize: false,
        autoLoadEntities: false,
        logging: config.get<boolean>('database.logging')
          ? (['query', 'error'] as const)
          : (['error'] as const),
        ssl: config.get<boolean>('database.ssl')
          ? { rejectUnauthorized: false }
          : false,
        // Ulanish hovuzi: bitta so‘rov bazani kutib qolsa ham, boshqalari
        // davom etishi kerak.
        extra: {
          max: 20,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
        },
      }),
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: (config.get<number>('throttle.ttl') ?? 60) * 1000,
            limit: config.get<number>('throttle.limit') ?? 200,
          },
        ],
      }),
    }),

    ScheduleModule.forRoot(),

    // ⚠️ Domen modullaridan OLDIN: bo‘sh bazada tumanlar, kataloglar va
    // birinchi administrator shu yerda yoziladi. `onApplicationBootstrap`
    // baribir hamma modul tayyor bo‘lgach ishlaydi, lekin ro‘yxatdagi o‘rni
    // nimaga bog‘liqligini ko‘rsatib turadi: u hech kimga bog‘liq emas.
    BootstrapModule,

    // ─────── Umumiy (global) modullar ───────
    AuditModule,
    SettingsModule,

    // ─────── Domen modullari ───────
    AuthModule,
    UsersModule,
    GeoModule,
    CatalogsModule,
    ContractorsModule,
    CustomersModule,
    ObjectsModule,
    DelaysModule,
    StorageModule,
    FilesModule,
    PhotoReportsModule,
    DocumentsModule,
    FundingModule,
    NotificationsModule,
    AiModule,
    DashboardModule,
    ReportsModule,
    HealthModule,
  ],
  providers: [
    // ⚠️ Tartib muhim: avval autentifikatsiya, keyin ruxsat, keyin limit.
    // Guard'lar GLOBAL — endpoint sukut bo‘yicha YOPIQ bo‘lishi kerak,
    // ochiqlari esa aniq `@Public()` bilan belgilanadi. Teskarisi bo‘lsa,
    // yangi kontroller yozgan dasturchi uni jimgina ochiq qoldirib ketardi.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },

    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
