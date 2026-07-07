/**
 * Limites de upload centralizados (multer, body parser Express, validação no front).
 *
 * Padrão: **2048 MB (2 GB)** por arquivo em todos os perfis.
 * Override global (recomendado): `UPLOAD_MAX_MB=2048` no backend e `VITE_UPLOAD_MAX_MB=2048` no front.
 *
 * Overrides por perfil (opcionais, só se precisar divergir do global):
 * - `UPLOAD_DESCRICAO_PROJETO_MAX_MB` — anexos da descrição do projeto
 * - `UPLOAD_TAREFA_MAX_MB` — Meu Trabalho (objetivo / entrega)
 * - `UPLOAD_GENERIC_MAX_MB` — /uploads, estoque, comunicações, RH, perfil, etc.
 * - `UPLOAD_TREINAMENTO_MAX_MB` — vídeos de treinamento
 */

export const DEFAULT_UPLOAD_MAX_MB = 2048;

const DEFAULT_FILES_PER_REQUEST = 10;

function parsePositiveInt(envValue: string | undefined, fallback: number): number {
  if (!envValue) return fallback;
  const n = Number.parseInt(envValue.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function resolveMaxMb(specificEnv?: string): number {
  const globalMb = process.env.UPLOAD_MAX_MB;
  if (globalMb?.trim()) {
    return parsePositiveInt(globalMb, DEFAULT_UPLOAD_MAX_MB);
  }
  return parsePositiveInt(specificEnv, DEFAULT_UPLOAD_MAX_MB);
}

const descricaoProjetoMaxMb = resolveMaxMb(process.env.UPLOAD_DESCRICAO_PROJETO_MAX_MB);
const tarefaMaxMb = resolveMaxMb(process.env.UPLOAD_TAREFA_MAX_MB);
const genericMaxMb = resolveMaxMb(process.env.UPLOAD_GENERIC_MAX_MB);
const treinamentoMaxMb = resolveMaxMb(process.env.UPLOAD_TREINAMENTO_MAX_MB);
const maxFilesPerRequest = parsePositiveInt(
  process.env.UPLOAD_MAX_FILES_PER_REQUEST,
  DEFAULT_FILES_PER_REQUEST,
);

/** Limite efetivo global (maior perfil configurado) — útil para body parser e proxy. */
export const UPLOAD_MAX_MB_EFFECTIVE = Math.max(
  descricaoProjetoMaxMb,
  tarefaMaxMb,
  genericMaxMb,
  treinamentoMaxMb,
);

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
  maxFilesPerRequest,
} as const;

/** Limite do `json()` / `urlencoded()` do Express (deve ser ≥ ao maior upload). */
export function expressBodyParserLimit(): string {
  return `${UPLOAD_MAX_MB_EFFECTIVE}mb`;
}
