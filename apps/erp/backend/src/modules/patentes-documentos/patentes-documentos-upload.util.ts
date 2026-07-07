import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { UPLOAD_LIMITS } from '../../common/constants/upload-limits';
import { PatentesDocumentosService } from './patentes-documentos.service';

const MIME_PERMITIDOS = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function resolveUploadsBase(): string {
  const env = process.env.UPLOADS_DIR;
  if (env && !/^https?:\/\//i.test(env)) {
    return env.startsWith('.') ? join(process.cwd(), env) : env;
  }
  return join(process.cwd(), 'uploads');
}

function resolveTempDir(): string {
  const dir = join(resolveUploadsBase(), 'patentes-documentos', '_tmp');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function createPatenteDocumentoMulterOptions() {
  return {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        cb(null, resolveTempDir());
      },
      filename: (_req, file, cb) => {
        const ts = Date.now();
        const rnd = Math.round(Math.random() * 1e9);
        const ext = extname(file.originalname) || '.pdf';
        cb(null, `${ts}-${rnd}${ext}`);
      },
    }),
    limits: { fileSize: UPLOAD_LIMITS.generic.maxBytes },
    fileFilter: (
      _req: Express.Request,
      file: Express.Multer.File,
      cb: (error: Error | null, acceptFile: boolean) => void,
    ) => {
      if (MIME_PERMITIDOS.has(file.mimetype)) {
        cb(null, true);
      } else {
        cb(
          new BadRequestException(
            'Formato não permitido. Envie PDF, Word, ODT ou imagem (JPEG/PNG/WebP).',
          ),
          false,
        );
      }
    },
  };
}

export function finalizePatenteDocumentoUpload(
  file: Express.Multer.File,
  pastaId: number,
  service: PatentesDocumentosService,
): string {
  const destDir = service.resolvePastaDir(pastaId);
  const destPath = join(destDir, file.filename);
  const srcPath = file.path;
  if (srcPath && srcPath !== destPath) {
    fs.renameSync(srcPath, destPath);
    file.path = destPath;
    file.destination = destDir;
  }
  return file.filename;
}
