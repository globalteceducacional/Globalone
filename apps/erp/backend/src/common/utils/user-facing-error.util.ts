import { ValidationError } from 'class-validator';
import { Prisma } from '@prisma/client';

const FIELD_LABELS: Record<string, string> = {
  email: 'E-mail',
  senha: 'Senha',
  nome: 'Nome',
  titulo: 'Título',
  descricao: 'Descrição',
  dataInicio: 'Data de início',
  dataFim: 'Data de fim',
  mes: 'Mês',
  competencia: 'Competência',
  usuarioId: 'Usuário',
  projetoId: 'Projeto',
  cargoId: 'Cargo',
  cnpj: 'CNPJ',
  telefone: 'Telefone',
  valorUnitario: 'Valor unitário',
  quantidade: 'Quantidade',
};

function fieldLabel(path: string): string {
  const key = path.split('.').pop() ?? path;
  return FIELD_LABELS[key] ?? key;
}

/** Traduz mensagens comuns do class-validator para português claro. */
export function humanizeValidationMessage(raw: string, propertyPath = ''): string {
  const field = propertyPath ? fieldLabel(propertyPath) : 'Campo';
  const msg = raw.trim();

  if (/must be an email/i.test(msg)) return 'Informe um e-mail válido.';
  if (/must be longer than or equal to (\d+) characters/i.test(msg)) {
    const n = msg.match(/(\d+)/)?.[1] ?? '';
    return `${field}: use no mínimo ${n} caracteres.`;
  }
  if (/must be shorter than or equal to (\d+) characters/i.test(msg)) {
    const n = msg.match(/(\d+)/)?.[1] ?? '';
    return `${field}: use no máximo ${n} caracteres.`;
  }
  if (/should not be empty|must not be empty|must be defined/i.test(msg)) {
    return `${field} é obrigatório.`;
  }
  if (/must be a string/i.test(msg)) return `${field}: informe um texto válido.`;
  if (/must be a number/i.test(msg)) return `${field}: informe um número válido.`;
  if (/must be a boolean/i.test(msg)) return `${field}: valor sim/não inválido.`;
  if (/must be an integer/i.test(msg)) return `${field}: informe um número inteiro.`;
  if (/must be a positive number/i.test(msg)) return `${field}: informe um valor positivo.`;
  if (/must be a valid ISO 8601 date string|must be a valid date/i.test(msg)) {
    return `${field}: use o formato de data AAAA-MM-DD.`;
  }
  if (/must match .* regular expression/i.test(msg)) return `${field}: formato inválido.`;
  if (/property (.+) should not exist/i.test(msg)) {
    const prop = msg.match(/property (.+) should not exist/i)?.[1] ?? 'desconhecido';
    return `Campo não permitido: ${prop}.`;
  }
  if (/forbidden property/i.test(msg) || /should not exist/i.test(msg)) {
    return 'Foram enviados dados inválidos. Atualize a página e tente novamente.';
  }

  if (propertyPath && !msg.includes(field)) {
    return `${field}: ${msg.charAt(0).toUpperCase()}${msg.slice(1)}`;
  }
  return msg.charAt(0).toUpperCase() + msg.slice(1);
}

export function flattenValidationErrors(errors: ValidationError[], parent = ''): string[] {
  const out: string[] = [];
  for (const err of errors) {
    const path = parent ? `${parent}.${err.property}` : err.property;
    if (err.constraints) {
      for (const msg of Object.values(err.constraints)) {
        out.push(humanizeValidationMessage(msg, path));
      }
    }
    if (err.children?.length) {
      out.push(...flattenValidationErrors(err.children, path));
    }
  }
  return out;
}

export function humanizePrismaError(error: Prisma.PrismaClientKnownRequestError): string {
  switch (error.code) {
    case 'P2002':
      return 'Este registro já existe. Verifique se não há duplicidade (e-mail, CNPJ, etc.).';
    case 'P2003':
      return 'Não foi possível concluir: existem registros vinculados a este item.';
    case 'P2025':
      return 'Registro não encontrado ou já foi removido.';
    case 'P2014':
      return 'Operação inválida por causa de registros relacionados.';
    default:
      return 'Não foi possível salvar os dados. Verifique as informações e tente novamente.';
  }
}

const TECHNICAL_PATTERN =
  /prisma|typeorm|nestjs|node_modules|ECONNREFUSED|ExceptionHandler|SqlState|at\s+\w+\.|stack trace|internal server/i;

export function looksTechnicalMessage(message: string): boolean {
  return TECHNICAL_PATTERN.test(message);
}

export function sanitizeForUser(message: string, statusCode: number, isProduction: boolean): string {
  const trimmed = message.trim();
  if (!trimmed) return defaultMessageForStatus(statusCode);

  if (isProduction && (statusCode >= 500 || looksTechnicalMessage(trimmed))) {
    return defaultMessageForStatus(statusCode);
  }
  return trimmed;
}

export function defaultMessageForStatus(statusCode: number): string {
  const map: Record<number, string> = {
    400: 'Não foi possível processar a solicitação. Verifique os dados informados.',
    401: 'Credenciais inválidas ou sessão expirada.',
    403: 'Você não tem permissão para realizar esta ação.',
    404: 'Registro não encontrado.',
    409: 'Conflito ao salvar. Este registro pode já existir.',
    413: 'Arquivo ou envio muito grande. Reduza o tamanho e tente novamente.',
    422: 'Alguns campos estão incorretos. Revise o formulário.',
    429: 'Muitas tentativas em sequência. Aguarde um momento e tente novamente.',
    502: 'Serviço temporariamente indisponível. Tente novamente em alguns minutos.',
    503: 'Sistema em manutenção ou sobrecarregado. Tente novamente em breve.',
    504: 'O servidor demorou para responder. Tente novamente.',
  };
  if (map[statusCode]) return map[statusCode];
  if (statusCode >= 500) {
    return 'Erro interno do servidor. Tente novamente. Se persistir, contate o suporte.';
  }
  return 'Não foi possível concluir a operação.';
}

export function joinUserMessages(messages: string[]): string {
  const unique = [...new Set(messages.map((m) => m.trim()).filter(Boolean))];
  if (unique.length === 0) return '';
  if (unique.length === 1) return unique[0];
  return unique.join(' ');
}
