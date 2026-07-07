import { extractDisplayFileName, stripDisplayFileName } from './uploadFile';

export type FilePreviewKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'text'
  | 'markdown'
  | 'spreadsheet'
  | 'document'
  | 'presentation'
  | 'model3d'
  | 'unsupported';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|mkv)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|aac|flac)(\?|#|$)/i;
const PDF_EXT = /\.pdf(\?|#|$)/i;
const TEXT_EXT = /\.(txt|csv|json|xml|log)(\?|#|$)/i;
const MARKDOWN_EXT = /\.(md|markdown)(\?|#|$)/i;
const SPREADSHEET_EXT = /\.(xlsx|xlsm|xls|ods)(\?|#|$)/i;
const DOCUMENT_EXT = /\.(docx|doc)(\?|#|$)/i;
const PRESENTATION_EXT = /\.(pptx|ppt)(\?|#|$)/i;
const MODEL_3D_EXT = /\.(stl|glb|gltf|obj|fbx|ply|stp|step|iges|igs)(\?|#|$)/i;

function pathForKindCheck(src: string): string {
  const t = src.trim();
  if (t.startsWith('data:')) {
    const semi = t.indexOf(';');
    return semi > 0 ? t.slice(0, semi) : t;
  }
  try {
    if (t.startsWith('http://') || t.startsWith('https://')) {
      return new URL(t).pathname;
    }
  } catch {
    /* ignore */
  }
  return t.split('?')[0].split('#')[0];
}

function mimeToKind(mime: string): FilePreviewKind | null {
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m === 'application/pdf') return 'pdf';
  if (m === 'text/markdown' || m === 'text/x-markdown') return 'markdown';
  if (m.startsWith('text/')) return 'text';
  if (
    m.includes('spreadsheet') ||
    m === 'application/vnd.ms-excel' ||
    m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return 'spreadsheet';
  }
  if (
    m.includes('wordprocessing') ||
    m === 'application/msword' ||
    m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'document';
  }
  if (
    m.includes('presentation') ||
    m === 'application/vnd.ms-powerpoint' ||
    m === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    return 'presentation';
  }
  if (
    m.includes('model/') ||
    m === 'application/sla' ||
    m === 'application/vnd.ms-pki.stl' ||
    m === 'application/step' ||
    m === 'application/x-step' ||
    m === 'application/iges' ||
    m === 'application/x-iges'
  ) {
    return 'model3d';
  }
  return null;
}

/** Classifica o arquivo para escolher o visualizador adequado. */
export function getFilePreviewKind(src: string, mimeHint?: string): FilePreviewKind {
  const fromMime = mimeHint ? mimeToKind(mimeHint) : null;
  if (fromMime) return fromMime;

  const path = pathForKindCheck(src).toLowerCase();
  if (path.startsWith('data:image/')) return 'image';
  if (path.startsWith('data:video/')) return 'video';
  if (path.startsWith('data:audio/')) return 'audio';
  if (path.startsWith('data:application/pdf')) return 'pdf';
  if (IMAGE_EXT.test(path)) return 'image';
  if (VIDEO_EXT.test(path)) return 'video';
  if (AUDIO_EXT.test(path)) return 'audio';
  if (PDF_EXT.test(path)) return 'pdf';
  if (MARKDOWN_EXT.test(path)) return 'markdown';
  if (TEXT_EXT.test(path)) return 'text';
  if (SPREADSHEET_EXT.test(path)) return 'spreadsheet';
  if (DOCUMENT_EXT.test(path)) return 'document';
  if (PRESENTATION_EXT.test(path)) return 'presentation';
  if (MODEL_3D_EXT.test(path)) return 'model3d';
  return 'unsupported';
}

function isStorageGeneratedName(base: string): boolean {
  return /^\d{10,}-\d+(\.[a-z0-9]+)?$/i.test(base);
}

export function fileDisplayName(src: string, index = 0, fallbackPrefix = 'Arquivo'): string {
  const fromMeta = extractDisplayFileName(src);
  if (fromMeta) return fromMeta;

  const path = pathForKindCheck(stripDisplayFileName(src));
  const base = path.split('/').pop() ?? '';
  if (base && base.length < 120 && !base.startsWith('data:')) {
    const decoded = decodeURIComponent(base);
    if (!isStorageGeneratedName(decoded)) return decoded;
    const extMatch = decoded.match(/(\.[a-z0-9]{1,8})$/i);
    if (extMatch) return `${fallbackPrefix} ${index + 1}${extMatch[1]}`;
    return `${fallbackPrefix} ${index + 1}`;
  }
  return `${fallbackPrefix} ${index + 1}`;
}

export function fileKindLabel(kind: FilePreviewKind): string {
  switch (kind) {
    case 'image':
      return 'Imagem';
    case 'video':
      return 'Vídeo';
    case 'audio':
      return 'Áudio';
    case 'pdf':
      return 'PDF';
    case 'text':
      return 'Texto';
    case 'markdown':
      return 'Markdown';
    case 'spreadsheet':
      return 'Planilha';
    case 'document':
      return 'Documento';
    case 'presentation':
      return 'Apresentação';
    case 'model3d':
      return 'Modelo 3D';
    default:
      return 'Arquivo';
  }
}

export function isOfficePreviewKind(kind: FilePreviewKind): boolean {
  return kind === 'spreadsheet' || kind === 'document' || kind === 'presentation';
}

export function isModel3dPreviewKind(kind: FilePreviewKind): boolean {
  return kind === 'model3d';
}

export function isMarkdownPreviewKind(kind: FilePreviewKind): boolean {
  return kind === 'markdown';
}
