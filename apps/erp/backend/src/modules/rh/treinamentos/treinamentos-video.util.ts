import { join } from 'path';
import * as fs from 'fs';

export function resolveTreinamentosUploadDir(): string {
  const env = process.env.UPLOADS_DIR;
  const base =
    env && !/^https?:\/\//i.test(env)
      ? env.startsWith('.')
        ? join(process.cwd(), env)
        : env
      : join(process.cwd(), 'uploads');
  const dir = join(base, 'treinamentos');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export const TREINAMENTO_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/ogg',
]);
