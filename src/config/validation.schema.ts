import * as Joi from 'joi';

/**
 * Sozlama yetishmasa dastur ISHGA TUSHMASIN — yarim sozlangan holatda ishlagan
 * server eng yomoni: xato runtime'da, so‘rov o‘rtasida chiqadi.
 */
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(4000),
  API_PREFIX: Joi.string().default('api/v1'),
  CORS_ORIGINS: Joi.string().default('http://localhost:5173'),

  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').required(),
  DB_NAME: Joi.string().required(),
  DB_LOGGING: Joi.boolean().default(false),
  DB_SSL: Joi.boolean().default(false),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_TTL: Joi.string().default('30m'),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_TTL: Joi.string().default('30d'),

  // ───────── Fayl saqlash: DigitalOcean Spaces ─────────
  // ⚠️ Lokal `uploads/` papkasi YO‘Q. Bir nechta server nusxasi ishlaganda
  // (yoki konteyner qayta yaratilganda) diskdagi fayl yo‘qoladi yoki faqat
  // bitta nusxada ko‘rinadi — shuning uchun fayl obyekt xotirasida.
  UPLOAD_MAX_MB: Joi.number().min(1).max(1024).default(100),
  DO_REGION: Joi.string().required(),
  DO_ENDPOINT: Joi.string().required(),
  DO_ACCESS_KEY: Joi.string().required(),
  DO_SECRET_KEY: Joi.string().required(),
  DO_BUCKET_NAME: Joi.string().required(),
  // Bo‘sh bo‘lsa — bucket yopiq deb hisoblanadi va imzolangan havola beriladi.
  DO_BUCKET_PUBLIC_BASE_URL: Joi.string().allow('').default(''),
  DO_SIGNED_URL_TTL: Joi.number().min(60).max(604800).default(900),

  // ───────── AI (OpenAI) ─────────
  OPENAI_API_KEY: Joi.string().allow('').default(''),
  AI_VISION_MODEL: Joi.string().default('gpt-5.4-mini'),
  AI_VISION_ENABLED: Joi.boolean().default(true),
  AI_VISION_MAX_IMAGES: Joi.number().min(1).max(10).default(4),
  AI_VISION_TIMEOUT_MS: Joi.number().min(5000).max(300000).default(90000),

  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(200),
});
