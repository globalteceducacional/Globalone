import {
  Controller,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UPLOAD_LIMITS } from '../../common/constants/upload-limits';

function resolveUploadsDir(subdir: string): string {
  const env = process.env.UPLOADS_DIR;
  const base =
    env && !/^https?:\/\//i.test(env)
      ? env.startsWith('.')
        ? join(process.cwd(), env)
        : env
      : join(process.cwd(), 'uploads');
  const dir = join(base, subdir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

const ALLOWED_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  @Post()
  @UseInterceptors(
    FilesInterceptor('files', UPLOAD_LIMITS.maxFilesPerRequest, {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          cb(null, resolveUploadsDir('general'));
        },
        filename: (_req, file, cb) => {
          const ts = Date.now();
          const rnd = Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname) || '';
          cb(null, `${ts}-${rnd}${ext}`);
        },
      }),
      limits: {
        fileSize: UPLOAD_LIMITS.generic.maxBytes,
        files: UPLOAD_LIMITS.maxFilesPerRequest,
      },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIMES.has(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `Tipo de arquivo não permitido: ${file.mimetype}. Aceitos: imagem (png, jpg, gif, webp) ou PDF.`,
            ),
            false,
          );
        }
      },
    }),
  )
  uploadFiles(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }

    const prefix = (process.env.UPLOADS_URL_PREFIX || '/uploads').replace(
      /\/+$/,
      '',
    );

    return files.map((f) => ({
      originalName: f.originalname,
      url: `${prefix}/general/${f.filename}`,
      mimeType: f.mimetype,
      size: f.size,
    }));
  }
}
