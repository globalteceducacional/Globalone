import { Prisma } from '@prisma/client';

/**
 * Campos seguros de Usuario em respostas de API (listagens, tarefas, projetos).
 * Nunca inclui senha, CPF, PIX, endereço ou outros dados sensíveis.
 */
export const USUARIO_PUBLIC_SELECT = {
  id: true,
  nome: true,
  fotoUrl: true,
  email: true,
  funcao: true,
  cargo: { select: { id: true, nome: true } },
} satisfies Prisma.UsuarioSelect;

/** Relação integrante → usuario (Meu Trabalho, etapas). */
export const ETAPA_INTEGRANTE_PUBLIC_INCLUDE = {
  include: {
    usuario: { select: USUARIO_PUBLIC_SELECT },
  },
} as const;

/** Relação projeto responsável → usuario. */
export const PROJETO_RESPONSAVEL_PUBLIC_INCLUDE = {
  include: {
    usuario: { select: USUARIO_PUBLIC_SELECT },
  },
} as const;

const STRIP_KEYS = new Set(['senha', 'cpf', 'pix', 'endereco', 'dadosContato']);

/**
 * Remove campos sensíveis de objetos aninhados na resposta JSON (defesa em profundidade).
 * Útil quando algum include legado ainda traz o modelo completo.
 */
export function stripSensitiveUserFields<T>(payload: T): T {
  if (payload === null || payload === undefined) return payload;
  if (Array.isArray(payload)) {
    return payload.map((item) => stripSensitiveUserFields(item)) as T;
  }
  if (typeof payload !== 'object' || payload instanceof Date) {
    return payload;
  }
  const record = payload as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (STRIP_KEYS.has(key)) continue;
    out[key] = stripSensitiveUserFields(value);
  }
  return out as T;
}
