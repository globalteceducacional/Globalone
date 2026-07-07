import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { UPLOAD_LIMITS } from '../../common/constants/upload-limits';

function resolveUploadsBase(): string {
  const env = process.env.UPLOADS_DIR;
  if (env && !/^https?:\/\//i.test(env)) {
    return env.startsWith('.') ? join(process.cwd(), env) : env;
  }
  return join(process.cwd(), 'uploads');
}

export function resolveDocumentosDir(tipo: string): string {
  const dir = join(resolveUploadsBase(), 'documentos', tipo);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function resolveDocumentosTempDir(): string {
  const dir = join(resolveUploadsBase(), 'documentos', '_tmp');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Multer grava primeiro o arquivo e só depois parseia os campos do multipart.
 * Por isso não dá para usar req.body.tipo no destination — gravamos em _tmp e movemos após validar.
 */
export function createDocumentoPdfMulterOptions() {
  return {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        cb(null, resolveDocumentosTempDir());
      },
      filename: (_req, file, cb) => {
        const ts = Date.now();
        const rnd = Math.round(Math.random() * 1e9);
        const ext = extname(file.originalname) || '.pdf';
        cb(null, `${ts}-${rnd}${ext}`);
      },
    }),
    limits: { fileSize: UPLOAD_LIMITS.generic.maxBytes },
    fileFilter: (_req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, acceptFile: boolean) => void) => {
      if (file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new BadRequestException('Apenas arquivos PDF são permitidos.'), false);
      }
    },
  };
}

export function finalizeDocumentoUpload(file: Express.Multer.File, tipo: string): string {
  const destDir = resolveDocumentosDir(tipo);
  const destPath = join(destDir, file.filename);
  const srcPath = file.path;
  if (srcPath && srcPath !== destPath) {
    fs.renameSync(srcPath, destPath);
    file.path = destPath;
    file.destination = destDir;
  }
  return file.filename;
}
