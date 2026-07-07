/**
 * Limites de upload no front, alinhados a `UPLOAD_LIMITS` do backend.
 * Padrão: **2048 MB (2 GB)** por arquivo em todos os perfis.
 *
 * Override global: `VITE_UPLOAD_MAX_MB=2048` (espelhe `UPLOAD_MAX_MB` no backend).
 */

export const DEFAULT_UPLOAD_MAX_MB = 2048;

const DEFAULT_FILES_PER_REQUEST = 10;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function resolveMaxMb(specificEnv?: string): number {
  const globalMb = import.meta.env.VITE_UPLOAD_MAX_MB;
  if (globalMb?.trim()) {
    return parsePositiveInt(globalMb, DEFAULT_UPLOAD_MAX_MB);
  }
  return parsePositiveInt(specificEnv, DEFAULT_UPLOAD_MAX_MB);
}

const descricaoProjetoMaxMb = resolveMaxMb(import.meta.env.VITE_UPLOAD_DESCRICAO_PROJETO_MAX_MB);
const tarefaMaxMb = resolveMaxMb(import.meta.env.VITE_UPLOAD_TAREFA_MAX_MB);
const genericMaxMb = resolveMaxMb(import.meta.env.VITE_UPLOAD_GENERIC_MAX_MB);
const treinamentoMaxMb = resolveMaxMb(import.meta.env.VITE_UPLOAD_TREINAMENTO_MAX_MB);

export const UPLOAD_LIMITS = {
  descricaoProjeto: {
    maxMb: descricaoProjetoMaxMb,
    maxBytes: descricaoProjetoMaxMb * 1024 * 1024,
  },
  tarefa: {
    maxMb: tarefaMaxMb,
    maxBytes: tarefaMaxMb * 1024 * 1024,
  },
  generic: {
    maxMb: genericMaxMb,
    maxBytes: genericMaxMb * 1024 * 1024,
  },
  treinamento: {
    maxMb: treinamentoMaxMb,
    maxBytes: treinamentoMaxMb * 1024 * 1024,
  },
  maxFilesPerRequest: parsePositiveInt(
    import.meta.env.VITE_UPLOAD_MAX_FILES_PER_REQUEST,
    DEFAULT_FILES_PER_REQUEST,
  ),
} as const;

type UploadScope = keyof Omit<typeof UPLOAD_LIMITS, 'maxFilesPerRequest'>;

/** Retorna o tamanho legível em MB (com 1 casa decimal). */
export function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Valida o tamanho de um arquivo contra um dos escopos.
 * Retorna mensagem de erro localizada quando excede; null caso esteja ok.
 */
export function validateFileSize(file: File, scope: UploadScope): string | null {
  const limit = UPLOAD_LIMITS[scope];
  if (file.size > limit.maxBytes) {
    return `O arquivo "${file.name}" (${formatMb(file.size)}) excede o limite de ${limit.maxMb} MB.`;
  }
  return null;
}

export function validateDescricaoProjetoFileSize(file: File): string | null {
  return validateFileSize(file, 'descricaoProjeto');
}

export function validateTarefaFileSize(file: File): string | null {
  return validateFileSize(file, 'tarefa');
}

export function validateGenericFileSize(file: File): string | null {
  return validateFileSize(file, 'generic');
}

export function validateTreinamentoVideoFileSize(file: File): string | null {
  return validateFileSize(file, 'treinamento');
}
