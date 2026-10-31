import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PERMISSIONS } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PayloadSizeGuard } from '../../common/guards/payload-size.guard';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { ALLOWED_SUMMARY_UZ } from '../storage/file-type.helpers';
import { FilesService, type UploadedSpacesFile } from './files.service';

const SUBDIR_QUERY = {
  name: 'subdir',
  required: false,
  enum: ['photos', 'documents', 'avatars', 'general'],
  description: 'Bucket ichidagi papka',
} as const;

@ApiTags('Fayllar')
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @ApiBearerAuth()
  @Post('upload')
  @RequirePermissions(PERMISSIONS.PHOTOS_UPLOAD)
  @UseGuards(PayloadSizeGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiQuery(SUBDIR_QUERY)
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({
    summary: 'Fayl yuklash',
    description: `Ruxsat etilgan turlar: ${ALLOWED_SUMMARY_UZ}. Tur fayl mazmunidan aniqlanadi.`,
  })
  upload(
    @UploadedFile() file: UploadedSpacesFile | undefined,
    @CurrentUser('id') userId: string,
  ) {
    if (!file) throw new BadRequestException('Fayl yuborilmadi');
    return this.files.record(file, userId);
  }

  /**
   * Bir nechta fayl — foto-hisobotda odatda 2–4 ta rakurs bo‘ladi va
   * ularni bitta so‘rovda yuborish mobil tarmoqda sezilarli tez.
   */
  @ApiBearerAuth()
  @Post('upload-many')
  @RequirePermissions(PERMISSIONS.PHOTOS_UPLOAD)
  @UseGuards(PayloadSizeGuard)
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiConsumes('multipart/form-data')
  @ApiQuery(SUBDIR_QUERY)
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
      required: ['files'],
    },
  })
  @ApiOperation({ summary: 'Bir nechta fayl yuklash (ko‘pi bilan 10 ta)' })
  async uploadMany(
    @UploadedFiles() files: UploadedSpacesFile[] | undefined,
    @CurrentUser('id') userId: string,
  ) {
    if (!files?.length) throw new BadRequestException('Fayl yuborilmadi');
    return Promise.all(files.map((file) => this.files.record(file, userId)));
  }

  /**
   * ⚠️ Bu yo‘l fayl MAZMUNINI uzatmaydi — obyekt xotirasiga YO‘NALTIRADI.
   * Serverimiz orqali oqim o‘tkazish 100 MB lik videoda ulanishni band
   * qilib turardi; CDN buni o‘zi, tezroq va arzonroq qiladi.
   *
   * Ochiq (`@Public`): surat `<img src>` orqali yuklanadi va u yerga
   * `Authorization` sarlavhasini qo‘shib bo‘lmaydi. Nomi taxmin qilib
   * bo‘lmaydigan UUID — «havolani bilgan ko‘radi» modeli.
   */
  @Public()
  @RawResponse()
  @Get(':storedName')
  @ApiOperation({ summary: 'Faylga yo‘naltirish (CDN yoki imzolangan havola)' })
  async serve(
    @Param('storedName') storedName: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.files.findByStoredName(storedName);
    const url = await this.files.urlFor(file);

    if (!url) throw new BadRequestException('Fayl manzili aniqlanmadi');

    // Imzolangan havola muddatli — keshlanmasligi kerak.
    res.setHeader(
      'Cache-Control',
      file.url ? 'public, max-age=3600' : 'private, no-store',
    );
    if (download !== undefined) res.setHeader('X-Download', '1');
    res.redirect(302, url);
  }

  @ApiBearerAuth()
  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PHOTOS_MODERATE)
  @ApiOperation({ summary: 'Faylni o‘chirish' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.files.remove(id);
  }
}
