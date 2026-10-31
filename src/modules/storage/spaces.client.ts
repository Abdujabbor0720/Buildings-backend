import { S3Client } from '@aws-sdk/client-s3';

export interface SpacesConnection {
  client: S3Client;
  bucket: string;
  /** Bo‘sh bo‘lsa bucket yopiq — imzolangan havola ishlatiladi. */
  publicBaseUrl: string;
}

/** `https://` qo‘shadi, oxiridagi `/` ni olib tashlaydi. */
export function normalizeUrl(value: string | undefined): string {
  const trimmed = (value ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Spaces ulanishi — MUHIT O‘ZGARUVCHILARIDAN.
 *
 * ⚠️ Bu yerda `ConfigService` ISHLATILMAYDI: ayni ulanish Nest ilovasidan
 * TASHQARIDA ham kerak (seed skripti alohida `ts-node` jarayonida ishlaydi).
 * Ikkita mijoz yozilsa, endpoint yoki imzo uslubi bir joyda o‘zgarib,
 * ikkinchisi jimgina eskisida qolib ketardi.
 */
export function createSpacesConnection(
  env: NodeJS.ProcessEnv = process.env,
): SpacesConnection {
  const missing = [
    'DO_REGION',
    'DO_ENDPOINT',
    'DO_ACCESS_KEY',
    'DO_SECRET_KEY',
    'DO_BUCKET_NAME',
  ].filter((key) => !(env[key] ?? '').trim());

  if (missing.length > 0) {
    throw new Error(
      `Spaces sozlanmagan — .env da yetishmaydi: ${missing.join(', ')}`,
    );
  }

  return {
    client: new S3Client({
      region: env.DO_REGION!,
      endpoint: normalizeUrl(env.DO_ENDPOINT),
      credentials: {
        accessKeyId: env.DO_ACCESS_KEY!,
        secretAccessKey: env.DO_SECRET_KEY!,
      },
      // Spaces virtual-host uslubida: `<bucket>.<region>.digitaloceanspaces.com`.
      forcePathStyle: false,
    }),
    bucket: env.DO_BUCKET_NAME!,
    publicBaseUrl: normalizeUrl(env.DO_BUCKET_PUBLIC_BASE_URL),
  };
}
