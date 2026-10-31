import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Endpoint autentifikatsiyasiz ochiq (login, ochiq statistika, geojson). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
