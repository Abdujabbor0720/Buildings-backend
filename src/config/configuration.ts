export interface AppConfig {
  env: string;
  port: number;
  apiPrefix: string;
  corsOrigins: string[];
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    name: string;
    synchronize: boolean;
    logging: boolean;
    ssl: boolean;
  };
  jwt: {
    accessSecret: string;
    accessTtl: string;
    refreshSecret: string;
    refreshTtl: string;
  };
  upload: {
    maxFileSizeMb: number;
  };
  /** DigitalOcean Spaces (S3 bilan mos). */
  storage: {
    region: string;
    endpoint: string;
    accessKey: string;
    secretKey: string;
    bucket: string;
    /** CDN/public manzil. Bo‘sh bo‘lsa — fayllar yopiq, imzolangan havola beriladi. */
    publicBaseUrl: string;
    /** Imzolangan havolaning amal qilish muddati, soniya. */
    signedUrlTtlSec: number;
  };
  ai: {
    apiKey: string;
    /** Suratdan bajarilishni baholaydigan model. */
    visionModel: string;
    enabled: boolean;
    /** Bitta tahlilga yuboriladigan maksimal surat soni (narx cheklovi). */
    maxImagesPerReport: number;
    timeoutMs: number;
  };
  throttle: { ttl: number; limit: number };
}

import { normalizeUrl } from '../modules/storage/spaces.client';

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    name: process.env.DB_NAME ?? 'buildings_db',
    // ⚠️ synchronize hech qachon prod'da yoqilmaydi — migratsiya yagona yo‘l.
    synchronize: false,
    logging: process.env.DB_LOGGING === 'true',
    ssl: process.env.DB_SSL === 'true',
  },
  jwt: {
    accessSecret:
      process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '30m',
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
  },
  upload: {
    maxFileSizeMb: parseInt(process.env.UPLOAD_MAX_MB ?? '100', 10),
  },
  storage: {
    region: process.env.DO_REGION ?? 'fra1',
    endpoint: normalizeUrl(process.env.DO_ENDPOINT ?? ''),
    accessKey: process.env.DO_ACCESS_KEY ?? '',
    secretKey: process.env.DO_SECRET_KEY ?? '',
    bucket: process.env.DO_BUCKET_NAME ?? '',
    publicBaseUrl: normalizeUrl(process.env.DO_BUCKET_PUBLIC_BASE_URL ?? ''),
    signedUrlTtlSec: parseInt(process.env.DO_SIGNED_URL_TTL ?? '900', 10),
  },
  ai: {
    apiKey: (process.env.OPENAI_API_KEY ?? '').trim(),
    visionModel: process.env.AI_VISION_MODEL ?? 'gpt-5.4-mini',
    // Kalit yo‘q bo‘lsa o‘z-o‘zidan o‘chadi — alohida bayroq qo‘yish
    // esdan chiqsa, tizim har suratda 401 xatosi yozib turardi.
    enabled:
      process.env.AI_VISION_ENABLED !== 'false' &&
      Boolean((process.env.OPENAI_API_KEY ?? '').trim()),
    maxImagesPerReport: parseInt(process.env.AI_VISION_MAX_IMAGES ?? '4', 10),
    timeoutMs: parseInt(process.env.AI_VISION_TIMEOUT_MS ?? '90000', 10),
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '200', 10),
  },
});
