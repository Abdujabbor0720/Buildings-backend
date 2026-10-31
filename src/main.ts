import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { configurePgTypes } from './config/pg-types';

// ⚠️ Nest konteyneri yaratilishidan OLDIN: drayver turlari global sozlanadi.
configurePgTypes();

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const port = config.getOrThrow<number>('port');
  const apiPrefix = config.getOrThrow<string>('apiPrefix');
  const corsOrigins = config.getOrThrow<string[]>('corsOrigins');
  const isProd = config.get<string>('env') === 'production';

  app.setGlobalPrefix(apiPrefix);

  app.use(
    helmet({
      // Surat va fayllar boshqa origin'dagi frontendga yuklanadi —
      // standart `same-origin` siyosati ularni bloklab qo‘yardi.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: isProd ? undefined : false,
    }),
  );
  app.use(compression());
  app.use(cookieParser());

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language'],
    exposedHeaders: ['Content-Disposition'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // ⚠️ `whitelist` + `forbidNonWhitelisted`: DTO'da e'lon qilinmagan
      // maydon JIM o‘tkazib yuborilmaydi, balki xato qaytaradi. Aks holda
      // mijoz `role: "super_admin"` kabi maydonni qo‘shib yuborishi va u
      // `Object.assign` orqali bazaga tushib ketishi mumkin edi.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  );

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.enableShutdownHooks();

  if (!isProd) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Qurilish obyektlari nazorati tizimi')
      .setDescription(
        'Andijon viloyati hokimligi — qurilish obyektlarini monitoring qilish API’si.\n\n' +
          'Barcha javoblar bitta konvertda qaytadi: `{ success, data, meta?, timestamp }`.\n' +
          'Xatolar: `{ success: false, statusCode, error: { code, message, details? } }`.',
      )
      .setVersion('1.0.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
        'bearer',
      )
      .addServer(`http://localhost:${port}`)
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha' },
      customSiteTitle: 'Qurilish nazorati — API',
    });
  }

  await app.listen(port, '0.0.0.0');

  logger.log(`Server ishga tushdi: http://localhost:${port}/${apiPrefix}`);
  if (!isProd)
    logger.log(`API hujjatlari:   http://localhost:${port}/${apiPrefix}/docs`);
  logger.log(`Muhit: ${config.get('env')} | CORS: ${corsOrigins.join(', ')}`);
}

void bootstrap();
