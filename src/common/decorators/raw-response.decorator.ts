import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE_KEY = 'rawResponse';

/** Javob `{success,data}` konvertiga o‘ralmasin (fayl, stream, eksport). */
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);
