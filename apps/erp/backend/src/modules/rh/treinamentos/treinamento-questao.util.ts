import { BadRequestException } from '@nestjs/common';

/** Quantidade de alternativas por questão (configurável no futuro). */
export const TREINAMENTO_QUESTAO_QTD_ALTERNATIVAS = 4;

export type TreinamentoQuestaoAlternativa = {
  texto: string;
  correta: boolean;
};

export type TreinamentoQuestaoJson = {
  enunciado: string;
  alternativas: TreinamentoQuestaoAlternativa[];
};

export function validarQuestaoJson(raw: unknown): TreinamentoQuestaoJson {
  if (!raw || typeof raw !== 'object') {
    throw new BadRequestException('Questão inválida.');
  }
  const o = raw as Record<string, unknown>;
  const enunciado = typeof o.enunciado === 'string' ? o.enunciado.trim() : '';
  if (!enunciado) {
    throw new BadRequestException('Informe o enunciado da questão.');
  }
  if (!Array.isArray(o.alternativas)) {
    throw new BadRequestException('Informe as alternativas da questão.');
  }
  if (o.alternativas.length !== TREINAMENTO_QUESTAO_QTD_ALTERNATIVAS) {
    throw new BadRequestException(
      `A questão deve ter exatamente ${TREINAMENTO_QUESTAO_QTD_ALTERNATIVAS} alternativas.`,
    );
  }
  const alternativas: TreinamentoQuestaoAlternativa[] = [];
  let corretas = 0;
  for (const alt of o.alternativas) {
    if (!alt || typeof alt !== 'object') {
      throw new BadRequestException('Alternativa inválida.');
    }
    const a = alt as Record<string, unknown>;
    const texto = typeof a.texto === 'string' ? a.texto.trim() : '';
    if (!texto) {
      throw new BadRequestException('Todas as alternativas precisam de texto.');
    }
    const correta = a.correta === true;
    if (correta) corretas += 1;
    alternativas.push({ texto, correta });
  }
  if (corretas !== 1) {
    throw new BadRequestException('Marque exatamente uma alternativa como correta.');
  }
  return { enunciado, alternativas };
}

/** Versão para participante (sem revelar qual é a correta). */
export function questaoJsonParaParticipante(
  q: TreinamentoQuestaoJson,
): { enunciado: string; alternativas: Array<{ texto: string }> } {
  return {
    enunciado: q.enunciado,
    alternativas: q.alternativas.map((a) => ({ texto: a.texto })),
  };
}
