import { api } from './api';
import { useAuthStore } from '../store/auth';

export type TipoBatida = 'ENTRADA' | 'SAIDA';
export type OrigemPonto = 'NORMAL' | 'AJUSTE_RH';

export interface UsuarioPontoMini {
  id: number;
  nome: string;
  email: string;
  fotoUrl?: string | null;
}

export interface RegistroPonto {
  id: number;
  usuarioId: number;
  usuario?: UsuarioPontoMini;
  tipo: TipoBatida;
  dataHora: string;
  latitude: number | null;
  longitude: number | null;
  precisaoGps: number | null;
  fotoUrl: string | null;
  ip: string | null;
  origem: OrigemPonto;
  observacao: string | null;
  ajustadoPor?: { id: number; nome: string } | null;
  justificativa: string | null;
  ajustadoEm: string | null;
  criadoEm: string;
  /** NSR (REP) — presente nas listagens do backend. */
  nsr?: number | null;
}

/**
 * Bloco de almoço da jornada.
 *
 * - `automatico=true` → o RH definiu intervalo fixo (ex.: 12:00-13:00) que é descontado
 *   automaticamente no espelho; o colaborador só bate ENTRADA e SAÍDA.
 * - `automatico=false` → o colaborador bate **4 vezes**: entrada, saída para almoço,
 *   volta do almoço e saída final. As duas batidas centrais ficam em
 *   `saidaManual` / `voltaManual`.
 */
export interface PontoHojeAlmoco {
  automatico: boolean;
  inicio: string;
  fim: string;
  /** Minutos descontados no fechamento do dia (null se ainda não há saída). */
  descontoMin: number | null;
  saidaAutomatica: string | null;
  voltaAutomatica: string | null;
  /** Saída para o almoço quando o modo é manual (2ª batida do dia). */
  saidaManual?: { id: number; dataHora: string } | null;
  /** Volta do almoço quando o modo é manual (3ª batida do dia). */
  voltaManual?: { id: number; dataHora: string } | null;
}

/** Item resumido de uma batida do dia (entrada/saída). */
export interface PontoBatidaResumo {
  id: number;
  tipo: TipoBatida;
  dataHora: string;
  fotoUrl: string | null;
}

export interface PontoHoje {
  /** Quando true, o colaborador não usa ponto/banco (configurado na jornada). */
  dispensadoControlePonto?: boolean;
  entrada: { id: number; dataHora: string; fotoUrl: string | null } | null;
  /** Última saída do dia (4ª batida no modo manual). */
  saida: { id: number; dataHora: string; fotoUrl: string | null } | null;
  proximaBatida: TipoBatida | null;
  /** Indica se o ciclo do dia está completo (2 batidas no automático, 4 no manual). */
  concluido?: boolean;
  /** Lista cronológica de todas as batidas do dia. */
  batidasHoje?: PontoBatidaResumo[];
  /** Presente nas APIs atuais; ausente em backends antigos. */
  almoco?: PontoHojeAlmoco;
}

export interface ListarPontoFiltros {
  inicio?: string;
  fim?: string;
  usuarioId?: number;
}

/**
 * Envia uma batida com selfie + geolocalização.
 * O backend decide automaticamente se é ENTRADA ou SAÍDA pela ordem do dia.
 */
export async function baterPonto(params: {
  fotoBlob: Blob;
  latitude: number;
  longitude: number;
  precisaoGps?: number;
  observacao?: string;
}): Promise<RegistroPonto> {
  const form = new FormData();
  const fileName = `selfie-${Date.now()}.jpg`;
  form.append('foto', params.fotoBlob, fileName);
  form.append('latitude', String(params.latitude));
  form.append('longitude', String(params.longitude));
  if (params.precisaoGps != null && Number.isFinite(params.precisaoGps)) {
    form.append('precisaoGps', String(params.precisaoGps));
  }
  if (params.observacao && params.observacao.trim()) {
    form.append('observacao', params.observacao.trim());
  }

  const { data } = await api.post<RegistroPonto>('/rh/ponto/bater', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function getPontoHoje(): Promise<PontoHoje> {
  const { data } = await api.get<PontoHoje>('/rh/ponto/hoje');
  return data;
}

export async function listarMeusPontos(filtros: ListarPontoFiltros = {}): Promise<RegistroPonto[]> {
  const { data } = await api.get<RegistroPonto[]>('/rh/ponto/meus', { params: filtros });
  return data;
}

export async function listarTodosPontos(filtros: ListarPontoFiltros = {}): Promise<RegistroPonto[]> {
  const { data } = await api.get<RegistroPonto[]>('/rh/ponto', { params: filtros });
  return data;
}

export interface CriarAjusteParams {
  usuarioId: number;
  tipo: TipoBatida;
  dataHora: string;
  justificativa: string;
  observacao?: string;
}

export async function criarAjustePonto(params: CriarAjusteParams): Promise<RegistroPonto> {
  const { data } = await api.post<RegistroPonto>('/rh/ponto/ajuste', params);
  return data;
}

export interface EditarPontoParams {
  tipo?: TipoBatida;
  dataHora?: string;
  justificativa: string;
  observacao?: string;
}

export async function editarPonto(id: number, params: EditarPontoParams): Promise<RegistroPonto> {
  const { data } = await api.patch<RegistroPonto>(`/rh/ponto/${id}`, params);
  return data;
}

export async function removerPonto(id: number, justificativa: string): Promise<void> {
  await api.delete(`/rh/ponto/${id}`, { data: { justificativa } });
}

/** Baixa o CSV no navegador (gera download via blob). */
export async function exportarPontoCsv(
  filtros: ListarPontoFiltros = {},
  fileName?: string,
): Promise<void> {
  const response = await api.get('/rh/ponto/exportar', {
    params: filtros,
    responseType: 'blob',
  });
  const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ts = new Date().toISOString().slice(0, 10);
  a.download = fileName ?? `ponto-${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Tipos compartilhados ────────────────────────────────────────────────────

export type SolicitacaoStatus = 'PENDENTE' | 'APROVADO' | 'REPROVADO' | 'CANCELADO';
export type AfastamentoTipo =
  | 'ATESTADO'
  | 'LICENCA'
  | 'FALTA_ABONADA'
  | 'HOME_OFFICE'
  | 'OUTRO';
export type DocumentoColaboradorTipo =
  | 'CONTRATO'
  | 'ASO'
  | 'RG'
  | 'CPF'
  | 'COMPROVANTE_RESIDENCIA'
  | 'CERTIFICADO'
  | 'CARTEIRA_TRABALHO'
  | 'OUTRO';
export type CicloAvaliacaoStatus = 'PLANEJAMENTO' | 'ABERTO' | 'ENCERRADO';
export type AvaliacaoStatus = 'PENDENTE' | 'RESPONDIDA' | 'REVISADA';
export type MatriculaTreinamentoStatus =
  | 'PENDENTE'
  | 'EM_ANDAMENTO'
  | 'CONCLUIDO'
  | 'REPROVADO';

export type RemuneracaoPontoTipo = 'NENHUMA' | 'VALOR_HORA' | 'MENSAL_META_HORAS';

// ─── Jornada ────────────────────────────────────────────────────────────────

export interface Jornada {
  id: number;
  usuarioId: number;
  cargaDiariaMin: number;
  cargaSemanalMin: number;
  inicioPadrao: string;
  fimPadrao: string;
  tolerAtrasoMin: number;
  almocoAutomatico: boolean;
  almocoInicio: string;
  almocoFim: string;
  diasUteis: Record<string, boolean>;
  observacao: string | null;
  /** Sem horário fixo: esperado diário = carga semanal / dias úteis; sem atraso por entrada. */
  horarioFlexivel?: boolean;
  remuneracaoPontoTipo?: RemuneracaoPontoTipo;
  valorHora?: number | string | null;
  valorMensal?: number | string | null;
  metaHorasMensalMin?: number | null;
  /**
   * Geocerca individual do colaborador. Quando os 3 campos estão preenchidos,
   * sobrescrevem a geocerca global do empregador para a batida desse usuário.
   * Quando todos são `null`, vale a regra global da unidade (ou nenhuma, se
   * a unidade também não tiver geocerca configurada).
   */
  latitudeReferencia: number | null;
  longitudeReferencia: number | null;
  raioMetros: number | null;
  /** Se false, não bate ponto nem entra no banco de horas. Default true quando omitido (API antiga). */
  controlePonto?: boolean;
}

export interface JornadaUsuario {
  usuarioId: number;
  nome: string;
  email: string;
  funcao: string | null;
  cargo: { id: number; nome: string } | null;
  jornada: Jornada | null;
  /** True se existe ao menos um RegistroPonto (histórico de batida). */
  temBatidaPonto?: boolean;
}

export async function listarJornadas(): Promise<JornadaUsuario[]> {
  const { data } = await api.get<JornadaUsuario[]>('/rh/jornada');
  return data;
}

export async function getMinhaJornada(): Promise<Jornada> {
  const { data } = await api.get<Jornada>('/rh/jornada/me');
  return data;
}

export async function atualizarJornada(usuarioId: number, payload: Partial<Jornada>): Promise<Jornada> {
  const { data } = await api.put<Jornada>(`/rh/jornada/${usuarioId}`, payload);
  return data;
}

export interface BulkControlePontoJornadaResult {
  atualizados: number;
  ignoradosComBatida: number;
  idsIgnoradosComBatida: number[];
}

export async function bulkControlePontoJornada(payload: {
  usuarioIds: number[];
  controlePonto: boolean;
}): Promise<BulkControlePontoJornadaResult> {
  const { data } = await api.put<BulkControlePontoJornadaResult>('/rh/jornada/bulk/controle-ponto', payload);
  return data;
}

// ─── Espelho de ponto ───────────────────────────────────────────────────────

export type EspelhoStatus =
  | 'PRESENTE'
  | 'INCOMPLETO'
  | 'FALTA'
  | 'NAO_UTIL'
  | 'ATESTADO'
  | 'LICENCA'
  | 'FERIAS'
  | 'FERIADO'
  | 'FALTA_ABONADA'
  | 'HOME_OFFICE';

export interface EspelhoDia {
  data: string;
  diaSemana: number;
  diaUtil: boolean;
  entrada: string | null;
  saida: string | null;
  trabalhadoMin: number;
  esperadoMin: number;
  atrasoMin: number;
  extraMin: number;
  saldoMin: number;
  status: EspelhoStatus;
  registros: number;
  almocoDeducaoMin?: number;
  almocoIntervaloInicio?: string | null;
  almocoIntervaloFim?: string | null;
  coberturaMotivo?: string | null;
}

export interface EspelhoMes {
  mes: string;
  usuarioId: number;
  totais: {
    diasUteis: number;
    diasComBatida: number;
    faltas: number;
    incompletos: number;
    trabalhadoMin: number;
    esperadoMin: number;
    atrasoMin: number;
    extraMin: number;
    saldoMin: number;
  };
  dias: EspelhoDia[];
}

export async function getEspelho(
  params: { mes?: string; usuarioId?: number; dataInicio?: string; dataFim?: string } = {},
): Promise<EspelhoMes> {
  const { data } = await api.get<EspelhoMes>('/rh/espelho', { params });
  return data;
}

export async function getJornadaColaborador(usuarioId: number): Promise<Jornada> {
  const { data } = await api.get<Jornada>(`/rh/jornada/${usuarioId}`);
  return data;
}

export async function exportarEspelhoCsv(params: { mes?: string; usuarioId?: number } = {}): Promise<void> {
  const response = await api.get('/rh/espelho/exportar', { params, responseType: 'blob' });
  baixarBlob(response.data, `espelho-${params.usuarioId ?? 'me'}-${params.mes ?? 'corrente'}.csv`);
}

// ─── Solicitações de ajuste ─────────────────────────────────────────────────

export interface SolicitacaoAjuste {
  id: number;
  usuarioId: number;
  usuario?: { id: number; nome: string; email: string };
  tipo: TipoBatida;
  dataHora: string;
  motivo: string;
  anexoUrl: string | null;
  status: SolicitacaoStatus;
  revisorId: number | null;
  revisor?: { id: number; nome: string } | null;
  comentarioRevisor: string | null;
  dataDecisao: string | null;
  dataCriacao: string;
}

export async function abrirSolicitacao(payload: {
  tipo: TipoBatida;
  dataHora: string;
  motivo: string;
  anexoUrl?: string;
}): Promise<SolicitacaoAjuste> {
  const { data } = await api.post<SolicitacaoAjuste>('/rh/solicitacoes', payload);
  return data;
}

export async function listarMinhasSolicitacoes(): Promise<SolicitacaoAjuste[]> {
  const { data } = await api.get<SolicitacaoAjuste[]>('/rh/solicitacoes/minhas');
  return data;
}

export async function listarSolicitacoes(status?: SolicitacaoStatus): Promise<SolicitacaoAjuste[]> {
  const { data } = await api.get<SolicitacaoAjuste[]>('/rh/solicitacoes', { params: { status } });
  return data;
}

export async function aprovarSolicitacao(id: number, comentario?: string): Promise<SolicitacaoAjuste> {
  const { data } = await api.post<SolicitacaoAjuste>(`/rh/solicitacoes/${id}/aprovar`, { comentario });
  return data;
}

export async function reprovarSolicitacao(id: number, comentario?: string): Promise<SolicitacaoAjuste> {
  const { data } = await api.post<SolicitacaoAjuste>(`/rh/solicitacoes/${id}/reprovar`, { comentario });
  return data;
}

export async function cancelarSolicitacao(id: number): Promise<void> {
  await api.delete(`/rh/solicitacoes/${id}`);
}

// ─── Banco de horas ─────────────────────────────────────────────────────────

export interface BancoHorasLancamento {
  id: number;
  usuarioId: number;
  competencia: string;
  data: string;
  minutosCredito: number;
  minutosDebito: number;
  /** `BATIDA_PRE` / `SALDO_PRE` só aparecem com competência em aberto (pré-fechamento). */
  origem: 'PONTO' | 'AJUSTE' | 'COMPENSACAO' | 'FECHAMENTO' | 'BATIDA_PRE' | 'SALDO_PRE';
  descricao: string | null;
  criadoEm: string;
}

export interface BancoHorasFechamento {
  id: number;
  usuarioId: number;
  competencia: string;
  saldoAnteriorMin: number;
  creditoMin: number;
  debitoMin: number;
  saldoFinalMin: number;
  fechadoPorId: number | null;
  fechadoEm: string;
}

/** Trecho de almoço da jornada do colaborador (para cálculo de ajustes por intervalo de horário). */
export interface JornadaAlmocoResumo {
  almocoAutomatico: boolean;
  almocoInicio: string;
  almocoFim: string;
}

/** Política manual (RH) para o colaborador solicitar débito de horas extras até um teto em minutos. */
export interface PoliticaUsoExtrasBancoHoras {
  permitido: boolean;
  limiteMinutos: number | null;
  comprometidoMinutos: number;
  disponivelMinutos: number | null;
}

export interface BancoHorasUsoExtrasSolicitacao {
  id: number;
  usuarioId: number;
  usuario?: { id: number; nome: string; email: string };
  minutosSolicitados: number;
  competencia: string;
  observacao: string | null;
  status: SolicitacaoStatus;
  revisorId: number | null;
  revisor?: { id: number; nome: string } | null;
  comentarioRevisor: string | null;
  dataDecisao: string | null;
  dataCriacao: string;
  lancamento?: { id: number } | null;
}

export interface BancoHorasPeriodoConsulta {
  dataInicio: string;
  dataFim: string;
}

export interface BancoHorasExtrato {
  usuarioId: number;
  competencia: string;
  /** Presente quando a consulta usa dataInicio/dataFim em vez de um único mês. */
  periodo?: BancoHorasPeriodoConsulta;
  /** false = colaborador fora do banco (jornada sem controle de ponto). */
  participaControlePonto?: boolean;
  lancamentos: BancoHorasLancamento[];
  saldoMesMin: number;
  saldoAcumuladoMin: number;
  fechamento: BancoHorasFechamento | null;
  /** Presente nas respostas atuais da API; fallback no cliente se ausente. */
  jornadaAlmoco?: JornadaAlmocoResumo;
  politicaUsoExtras?: PoliticaUsoExtrasBancoHoras;
  solicitacoesUsoExtras?: BancoHorasUsoExtrasSolicitacao[];
}

export type ParamsConsultaBancoHoras =
  | { competencia: string }
  | { dataInicio: string; dataFim: string };

export async function getMeuBancoHoras(
  params?: ParamsConsultaBancoHoras,
): Promise<BancoHorasExtrato> {
  const { data } = await api.get<BancoHorasExtrato>('/rh/banco-horas/me', { params });
  return data;
}

export async function patchPoliticaUsoExtrasBancoHoras(
  usuarioId: number,
  payload: { permitido: boolean; limiteMinutos?: number },
): Promise<BancoHorasExtrato> {
  const { data } = await api.patch<BancoHorasExtrato>(
    `/rh/banco-horas/${usuarioId}/politica-uso-extras`,
    payload,
  );
  return data;
}

export async function solicitarUsoExtrasBancoHoras(payload: {
  minutos: number;
  observacao?: string;
  competencia?: string;
}): Promise<BancoHorasUsoExtrasSolicitacao> {
  const { data } = await api.post<BancoHorasUsoExtrasSolicitacao>(
    '/rh/banco-horas/me/solicitar-uso-extras',
    payload,
  );
  return data;
}

export async function cancelarSolicitacaoUsoExtrasBancoHoras(solicitacaoId: number): Promise<void> {
  await api.delete(`/rh/banco-horas/me/solicitacoes-uso-extras/${solicitacaoId}`);
}

export async function listarSolicitacoesUsoExtrasBancoHoras(
  status?: SolicitacaoStatus,
): Promise<BancoHorasUsoExtrasSolicitacao[]> {
  const { data } = await api.get<BancoHorasUsoExtrasSolicitacao[]>('/rh/banco-horas/solicitacoes-uso-extras', {
    params: status ? { status } : {},
  });
  return data;
}

export async function aprovarSolicitacaoUsoExtrasBancoHoras(
  id: number,
  comentario?: string,
): Promise<BancoHorasUsoExtrasSolicitacao> {
  const { data } = await api.post<BancoHorasUsoExtrasSolicitacao>(
    `/rh/banco-horas/solicitacoes-uso-extras/${id}/aprovar`,
    { comentario },
  );
  return data;
}

export async function reprovarSolicitacaoUsoExtrasBancoHoras(
  id: number,
  comentario?: string,
): Promise<BancoHorasUsoExtrasSolicitacao> {
  const { data } = await api.post<BancoHorasUsoExtrasSolicitacao>(
    `/rh/banco-horas/solicitacoes-uso-extras/${id}/reprovar`,
    { comentario },
  );
  return data;
}

/** Extrato completo de um colaborador (RH com `banco_horas:ver_todos`). */
export async function getBancoHorasUsuario(
  usuarioId: number,
  params?: ParamsConsultaBancoHoras,
): Promise<BancoHorasExtrato> {
  const { data } = await api.get<BancoHorasExtrato>(`/rh/banco-horas/${usuarioId}`, {
    params,
  });
  return data;
}

export interface ResumoBancoHorasItem {
  usuarioId: number;
  nome: string;
  email: string;
  saldoMesMin: number;
  saldoAcumuladoMin: number;
  fechado: boolean;
  bloqueios?: {
    documentosVencendo: number;
    afastamentosSemAnexo: number;
    saldoNegativo: boolean;
  };
}

export async function getResumoBancoHoras(params?: ParamsConsultaBancoHoras) {
  const { data } = await api.get<{
    competencia: string | null;
    periodo?: BancoHorasPeriodoConsulta;
    usuarios: ResumoBancoHorasItem[];
  }>('/rh/banco-horas', { params });
  return data;
}

export async function fecharBancoHorasEmMassa(
  usuarioIds: number[],
  competencia?: string,
): Promise<{
  competencia: string;
  sucessos: number[];
  falhas: Array<{ usuarioId: number; motivo: string }>;
}> {
  const { data } = await api.post<{
    competencia: string;
    sucessos: number[];
    falhas: Array<{ usuarioId: number; motivo: string }>;
  }>('/rh/banco-horas/fechar-em-massa', { usuarioIds, competencia });
  return data;
}

export async function fecharBancoHoras(usuarioId: number, competencia?: string): Promise<BancoHorasExtrato> {
  const { data } = await api.post<BancoHorasExtrato>(
    `/rh/banco-horas/${usuarioId}/fechar`,
    null,
    { params: { competencia } },
  );
  return data;
}

/** Gera palavra aleatória a digitar para confirmar o desfazer do fechamento (válida ~10 min). */
export async function solicitarDesafioReabrirFechamento(
  usuarioId: number,
  competencia?: string,
): Promise<{ palavraDesafio: string }> {
  const { data } = await api.post<{ palavraDesafio: string }>(
    `/rh/banco-horas/${usuarioId}/reabrir-fechamento/desafio`,
    null,
    { params: { competencia } },
  );
  return data;
}

/** Remove o fechamento do mês após confirmar a mesma `palavraDesafio` retornada por {@link solicitarDesafioReabrirFechamento}. */
export async function reabrirFechamentoBancoHoras(
  usuarioId: number,
  palavraDesafio: string,
  competencia?: string,
): Promise<BancoHorasExtrato> {
  const { data } = await api.post<BancoHorasExtrato>(
    `/rh/banco-horas/${usuarioId}/reabrir-fechamento`,
    { palavraDesafio },
    { params: { competencia } },
  );
  return data;
}

export async function lancarBancoHoras(
  usuarioId: number,
  payload: { minutos: number; descricao: string; competencia?: string; dataReferencia?: string },
): Promise<BancoHorasLancamento> {
  const { data } = await api.post<BancoHorasLancamento>(
    `/rh/banco-horas/${usuarioId}/lancamento`,
    payload,
  );
  return data;
}

/** Exclui lançamento manual (AJUSTE/COMPENSAÇÃO). Retorna o extrato atualizado. */
export async function excluirLancamentoBancoHoras(
  usuarioId: number,
  lancamentoId: number,
): Promise<BancoHorasExtrato> {
  const { data } = await api.delete<BancoHorasExtrato>(
    `/rh/banco-horas/${usuarioId}/lancamentos/${lancamentoId}`,
  );
  return data;
}

// ─── Férias ─────────────────────────────────────────────────────────────────

export interface PeriodoAquisitivo {
  id: number;
  usuarioId: number;
  inicio: string;
  fim: string;
  diasDireito: number;
  diasUsados: number;
}

export interface FeriasSolicitacao {
  id: number;
  usuarioId: number;
  usuario?: { id: number; nome: string; email: string };
  dataInicio: string;
  dataFim: string;
  diasSolicitados: number;
  observacao: string | null;
  status: SolicitacaoStatus;
  revisor?: { id: number; nome: string } | null;
  comentarioRevisor: string | null;
  dataDecisao: string | null;
  dataCriacao: string;
}

export async function getResumoFerias() {
  const { data } = await api.get<{
    saldoDias: number;
    periodos: PeriodoAquisitivo[];
    solicitacoes: FeriasSolicitacao[];
  }>('/rh/ferias/me');
  return data;
}

export async function abrirFerias(payload: {
  dataInicio: string;
  dataFim: string;
  observacao?: string;
  periodoAquisitivoId?: number;
}): Promise<FeriasSolicitacao> {
  const { data } = await api.post<FeriasSolicitacao>('/rh/ferias', payload);
  return data;
}

export async function listarFerias(status?: SolicitacaoStatus): Promise<FeriasSolicitacao[]> {
  const { data } = await api.get<FeriasSolicitacao[]>('/rh/ferias', { params: { status } });
  return data;
}

export async function aprovarFerias(id: number, comentario?: string): Promise<FeriasSolicitacao> {
  const { data } = await api.post<FeriasSolicitacao>(`/rh/ferias/${id}/aprovar`, { comentario });
  return data;
}

export async function reprovarFerias(id: number, comentario?: string): Promise<FeriasSolicitacao> {
  const { data } = await api.post<FeriasSolicitacao>(`/rh/ferias/${id}/reprovar`, { comentario });
  return data;
}

// ─── Feriados (sem exigência de ponto) ──────────────────────────────────────

export interface Feriado {
  id: number;
  dataInicio: string;
  dataFim: string;
  nome: string;
  descricao: string | null;
  recorrenteAnual: boolean;
  criadoPor?: { id: number; nome: string } | null;
  dataCriacao: string;
}

export async function listarFeriados(ano?: number): Promise<Feriado[]> {
  const { data } = await api.get<Feriado[]>('/rh/feriados', {
    params: ano != null ? { ano } : undefined,
  });
  return data;
}

export async function criarFeriado(payload: {
  dataInicio: string;
  dataFim?: string;
  nome: string;
  descricao?: string;
  recorrenteAnual?: boolean;
}): Promise<Feriado> {
  const { data } = await api.post<Feriado>('/rh/feriados', payload);
  return data;
}

export async function atualizarFeriado(
  id: number,
  payload: Partial<{
    dataInicio: string;
    dataFim: string;
    nome: string;
    descricao: string;
    recorrenteAnual: boolean;
  }>,
): Promise<Feriado> {
  const { data } = await api.patch<Feriado>(`/rh/feriados/${id}`, payload);
  return data;
}

export async function removerFeriado(id: number): Promise<void> {
  await api.delete(`/rh/feriados/${id}`);
}

// ─── Afastamentos ───────────────────────────────────────────────────────────

export interface Afastamento {
  id: number;
  usuarioId: number;
  usuario?: { id: number; nome: string; email: string };
  tipo: AfastamentoTipo;
  dataInicio: string;
  dataFim: string;
  motivo: string | null;
  anexoUrl: string | null;
  registradoPor?: { id: number; nome: string } | null;
  dataCriacao: string;
}

export async function listarMeusAfastamentos(): Promise<Afastamento[]> {
  const { data } = await api.get<Afastamento[]>('/rh/afastamentos/me');
  return data;
}

export async function listarAfastamentos(filtros: { usuarioId?: number; tipo?: AfastamentoTipo } = {}): Promise<Afastamento[]> {
  const { data } = await api.get<Afastamento[]>('/rh/afastamentos', { params: filtros });
  return data;
}

export async function criarAfastamento(payload: {
  usuarioId: number;
  tipo: AfastamentoTipo;
  dataInicio: string;
  dataFim: string;
  motivo?: string;
  anexo?: File;
}): Promise<Afastamento> {
  const form = new FormData();
  form.append('usuarioId', String(payload.usuarioId));
  form.append('tipo', payload.tipo);
  form.append('dataInicio', payload.dataInicio);
  form.append('dataFim', payload.dataFim);
  if (payload.motivo) form.append('motivo', payload.motivo);
  if (payload.anexo) form.append('anexo', payload.anexo);
  const { data } = await api.post<Afastamento>('/rh/afastamentos', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function removerAfastamento(id: number): Promise<void> {
  await api.delete(`/rh/afastamentos/${id}`);
}

// ─── Documentos do colaborador ──────────────────────────────────────────────

export interface DocumentoColaborador {
  id: number;
  usuarioId: number;
  usuario?: { id: number; nome: string; email: string };
  tipo: DocumentoColaboradorTipo;
  titulo: string;
  arquivoUrl: string;
  dataValidade: string | null;
  observacao: string | null;
  uploadPor?: { id: number; nome: string } | null;
  dataCriacao: string;
}

export async function listarMeusDocumentos(): Promise<DocumentoColaborador[]> {
  const { data } = await api.get<DocumentoColaborador[]>('/rh/documentos/me');
  return data;
}

export async function listarDocumentosUsuario(usuarioId: number): Promise<DocumentoColaborador[]> {
  const { data } = await api.get<DocumentoColaborador[]>(`/rh/documentos/usuario/${usuarioId}`);
  return data;
}

export async function listarDocumentosVencendo(dias = 30): Promise<DocumentoColaborador[]> {
  const { data } = await api.get<DocumentoColaborador[]>('/rh/documentos/a-vencer', { params: { dias } });
  return data;
}

export async function criarDocumento(payload: {
  usuarioId: number;
  tipo: DocumentoColaboradorTipo;
  titulo: string;
  arquivo: File;
  dataValidade?: string;
  observacao?: string;
}): Promise<DocumentoColaborador> {
  const form = new FormData();
  form.append('usuarioId', String(payload.usuarioId));
  form.append('tipo', payload.tipo);
  form.append('titulo', payload.titulo);
  form.append('arquivo', payload.arquivo);
  if (payload.dataValidade) form.append('dataValidade', payload.dataValidade);
  if (payload.observacao) form.append('observacao', payload.observacao);
  const { data } = await api.post<DocumentoColaborador>('/rh/documentos', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function removerDocumento(id: number): Promise<void> {
  await api.delete(`/rh/documentos/${id}`);
}

// ─── Desempenho ─────────────────────────────────────────────────────────────

export interface CicloAvaliacao {
  id: number;
  nome: string;
  descricao: string | null;
  dataInicio: string;
  dataFim: string;
  status: CicloAvaliacaoStatus;
  roteiroJson: any;
  criador: { id: number; nome: string };
  _count: { avaliacoes: number };
}

export interface AvaliacaoDesempenho {
  id: number;
  cicloId: number;
  ciclo?: { id: number; nome: string; status: CicloAvaliacaoStatus };
  avaliado: { id: number; nome: string };
  avaliador: { id: number; nome: string };
  status: AvaliacaoStatus;
  respostasJson: any;
  notaFinal: number | null;
  comentario: string | null;
  dataResposta: string | null;
  dataCriacao: string;
}

export interface MetaIndividual {
  id: number;
  usuarioId: number;
  titulo: string;
  descricao: string | null;
  peso: number;
  status: string;
  prazo: string | null;
  dataCriacao: string;
}

export async function listarCiclos(): Promise<CicloAvaliacao[]> {
  const { data } = await api.get<CicloAvaliacao[]>('/rh/desempenho/ciclos');
  return data;
}

export async function criarCiclo(payload: {
  nome: string;
  descricao?: string;
  dataInicio: string;
  dataFim: string;
  roteiroJson?: any;
}): Promise<CicloAvaliacao> {
  const { data } = await api.post<CicloAvaliacao>('/rh/desempenho/ciclos', payload);
  return data;
}

export async function mudarStatusCiclo(id: number, status: CicloAvaliacaoStatus): Promise<CicloAvaliacao> {
  const { data } = await api.patch<CicloAvaliacao>(`/rh/desempenho/ciclos/${id}/status`, { status });
  return data;
}

export async function distribuirAvaliacoes(
  cicloId: number,
  pares: Array<{ avaliadorId: number; avaliadoId: number }>,
): Promise<AvaliacaoDesempenho[]> {
  const { data } = await api.post<AvaliacaoDesempenho[]>(
    `/rh/desempenho/ciclos/${cicloId}/distribuir`,
    { pares },
  );
  return data;
}

export async function getMinhasAvaliacoes(): Promise<{ aFazer: AvaliacaoDesempenho[]; recebidas: AvaliacaoDesempenho[] }> {
  const { data } = await api.get<{ aFazer: AvaliacaoDesempenho[]; recebidas: AvaliacaoDesempenho[] }>(
    '/rh/desempenho/me',
  );
  return data;
}

export async function responderAvaliacao(
  id: number,
  payload: { respostasJson: any; notaFinal?: number; comentario?: string },
): Promise<AvaliacaoDesempenho> {
  const { data } = await api.post<AvaliacaoDesempenho>(`/rh/desempenho/avaliacoes/${id}/responder`, payload);
  return data;
}

export async function listarMinhasMetas(): Promise<MetaIndividual[]> {
  const { data } = await api.get<MetaIndividual[]>('/rh/desempenho/metas/me');
  return data;
}

export async function listarMetasUsuario(usuarioId: number): Promise<MetaIndividual[]> {
  const { data } = await api.get<MetaIndividual[]>(`/rh/desempenho/metas/usuario/${usuarioId}`);
  return data;
}

export async function criarMeta(
  usuarioId: number,
  payload: { titulo: string; descricao?: string; peso?: number; prazo?: string },
): Promise<MetaIndividual> {
  const { data } = await api.post<MetaIndividual>(`/rh/desempenho/metas/usuario/${usuarioId}`, payload);
  return data;
}

export async function atualizarMeta(
  id: number,
  payload: { titulo?: string; descricao?: string; peso?: number; status?: string; prazo?: string | null },
): Promise<MetaIndividual> {
  const { data } = await api.patch<MetaIndividual>(`/rh/desempenho/metas/${id}`, payload);
  return data;
}

export async function removerMeta(id: number): Promise<void> {
  await api.delete(`/rh/desempenho/metas/${id}`);
}

// ─── Treinamentos ───────────────────────────────────────────────────────────

export const TREINAMENTO_QUESTAO_QTD_ALTERNATIVAS = 4;

export type TreinamentoItemTipo = 'VIDEO' | 'QUESTAO';

export interface TreinamentoQuestaoAlternativa {
  texto: string;
  correta: boolean;
}

export interface TreinamentoQuestaoJson {
  enunciado: string;
  alternativas: TreinamentoQuestaoAlternativa[];
}

export interface TreinamentoItem {
  id: number;
  treinamentoId: number;
  ordem: number;
  tipo: TreinamentoItemTipo;
  titulo: string | null;
  videoUrl: string | null;
  videoNome: string | null;
  videoTamanhoBytes: number | null;
  videoMimeType: string | null;
  questaoJson: TreinamentoQuestaoJson | null;
  dataCriacao: string;
}

export interface Treinamento {
  id: number;
  titulo: string;
  descricao: string | null;
  cargaHoraria: number;
  videoUrl: string | null;
  videoNome: string | null;
  videoTamanhoBytes: number | null;
  videoMimeType: string | null;
  anexosJson: any;
  ativo: boolean;
  criador: { id: number; nome: string } | null;
  cargosObrigatorios: Array<{ cargoId: number; cargo: { id: number; nome: string } }>;
  _count: { matriculas: number; itens?: number };
}

/** Resumo do treinamento em listagens de pendentes / matrícula. */
export type TreinamentoResumoPlayer = {
  id: number;
  titulo: string;
  cargaHoraria?: number;
  videoUrl?: string | null;
  videoNome?: string | null;
  videoTamanhoBytes?: number | null;
  videoMimeType?: string | null;
  descricao?: string | null;
};

export interface TreinamentoMatricula {
  id: number;
  treinamentoId: number;
  treinamento?: TreinamentoResumoPlayer;
  usuario?: { id: number; nome: string; email: string };
  status: MatriculaTreinamentoStatus;
  dataConclusao: string | null;
  certificadoUrl: string | null;
  notaAvaliacao: number | null;
  dataCriacao: string;
}

export async function listarTreinamentos(): Promise<Treinamento[]> {
  const { data } = await api.get<Treinamento[]>('/rh/treinamentos');
  return data;
}

export async function buscarTreinamento(id: number): Promise<Treinamento> {
  const { data } = await api.get<Treinamento>(`/rh/treinamentos/${id}`);
  return data;
}

/** URL para `<video src>` com token na query (suporta arquivos grandes com Range). */
function urlTreinamentoVideoPath(path: string): string | null {
  const token = useAuthStore.getState().token;
  if (!token) return null;
  const base = (api.defaults.baseURL ?? '').replace(/\/+$/, '');
  const q = `access_token=${encodeURIComponent(token)}`;
  if (!base || base.startsWith('http')) {
    return `${base}${path}?${q}`;
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${base}${path}?${q}`;
}

/** URL para `<video src>` do vídeo legado do treinamento. */
export function urlVideoTreinamento(treinamentoId: number): string | null {
  return urlTreinamentoVideoPath(`/rh/treinamentos/${treinamentoId}/video`);
}

/** URL para `<video src>` de um item VIDEO da trilha. */
export function urlVideoItemTreinamento(treinamentoId: number, itemId: number): string | null {
  return urlTreinamentoVideoPath(`/rh/treinamentos/${treinamentoId}/itens/${itemId}/video`);
}

export type TreinamentoTrilhaItemParticipante = {
  id: number;
  ordem: number;
  tipo: TreinamentoItemTipo;
  titulo: string | null;
  videoNome?: string | null;
  questao?: { enunciado: string; alternativas: Array<{ texto: string }> };
  progresso: {
    concluido: boolean;
    respostaCorreta: boolean | null;
    respostaIndice: number | null;
  };
};

export type TreinamentoTrilhaState = {
  matricula: {
    id: number;
    treinamentoId: number;
    status: MatriculaTreinamentoStatus;
    dataConclusao: string | null;
  };
  treinamento: TreinamentoResumoPlayer;
  itens: TreinamentoTrilhaItemParticipante[];
  indiceAtual: number;
  modoLegado: boolean;
};

export async function buscarTrilhaTreinamento(treinamentoId: number): Promise<TreinamentoTrilhaState> {
  const { data } = await api.get<TreinamentoTrilhaState>(`/rh/treinamentos/${treinamentoId}/trilha`);
  return data;
}

export async function concluirVideoItemTreinamento(
  treinamentoId: number,
  itemId: number,
): Promise<TreinamentoMatricula> {
  const { data } = await api.post<TreinamentoMatricula>(
    `/rh/treinamentos/${treinamentoId}/itens/${itemId}/concluir-video`,
  );
  return data;
}

export async function responderQuestaoItemTreinamento(
  treinamentoId: number,
  itemId: number,
  respostaIndice: number,
): Promise<{ correta: boolean; concluido: boolean; matricula: TreinamentoMatricula }> {
  const { data } = await api.post<{ correta: boolean; concluido: boolean; matricula: TreinamentoMatricula }>(
    `/rh/treinamentos/${treinamentoId}/itens/${itemId}/responder`,
    { respostaIndice },
  );
  return data;
}

export async function uploadVideoTreinamento(
  treinamentoId: number,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<Treinamento> {
  const form = new FormData();
  form.append('video', file);
  const { data } = await api.post<Treinamento>(`/rh/treinamentos/${treinamentoId}/video`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 0,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    onUploadProgress: (ev) => {
      if (!onProgress || !ev.total) return;
      onProgress(Math.round((ev.loaded * 100) / ev.total));
    },
  });
  return data;
}

export async function removerVideoTreinamento(treinamentoId: number): Promise<Treinamento> {
  const { data } = await api.delete<Treinamento>(`/rh/treinamentos/${treinamentoId}/video`);
  return data;
}

export async function listarItensTreinamento(treinamentoId: number): Promise<TreinamentoItem[]> {
  const { data } = await api.get<TreinamentoItem[]>(`/rh/treinamentos/${treinamentoId}/itens`);
  return data;
}

export async function criarItemVideoTreinamento(
  treinamentoId: number,
  titulo?: string,
): Promise<TreinamentoItem> {
  const { data } = await api.post<TreinamentoItem>(`/rh/treinamentos/${treinamentoId}/itens/video`, {
    titulo,
  });
  return data;
}

export async function criarItemQuestaoTreinamento(
  treinamentoId: number,
  payload: { titulo?: string; questao: TreinamentoQuestaoJson },
): Promise<TreinamentoItem> {
  const { data } = await api.post<TreinamentoItem>(
    `/rh/treinamentos/${treinamentoId}/itens/questao`,
    payload,
  );
  return data;
}

export async function atualizarItemQuestaoTreinamento(
  treinamentoId: number,
  itemId: number,
  payload: { titulo?: string; questao: TreinamentoQuestaoJson },
): Promise<TreinamentoItem> {
  const { data } = await api.patch<TreinamentoItem>(
    `/rh/treinamentos/${treinamentoId}/itens/${itemId}`,
    payload,
  );
  return data;
}

export async function reordenarItensTreinamento(
  treinamentoId: number,
  itemIds: number[],
): Promise<TreinamentoItem[]> {
  const { data } = await api.patch<TreinamentoItem[]>(
    `/rh/treinamentos/${treinamentoId}/itens/ordem`,
    { itemIds },
  );
  return data;
}

export async function removerItemTreinamento(treinamentoId: number, itemId: number): Promise<void> {
  await api.delete(`/rh/treinamentos/${treinamentoId}/itens/${itemId}`);
}

export async function uploadVideoItemTreinamento(
  treinamentoId: number,
  itemId: number,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<TreinamentoItem> {
  const form = new FormData();
  form.append('video', file);
  const { data } = await api.post<TreinamentoItem>(
    `/rh/treinamentos/${treinamentoId}/itens/${itemId}/video`,
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 0,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      onUploadProgress: (ev) => {
        if (!onProgress || !ev.total) return;
        onProgress(Math.round((ev.loaded * 100) / ev.total));
      },
    },
  );
  return data;
}

export async function removerVideoItemTreinamento(
  treinamentoId: number,
  itemId: number,
): Promise<TreinamentoItem> {
  const { data } = await api.delete<TreinamentoItem>(
    `/rh/treinamentos/${treinamentoId}/itens/${itemId}/video`,
  );
  return data;
}

export async function criarTreinamento(payload: {
  titulo: string;
  descricao?: string;
  cargaHoraria?: number;
  cargosObrigatoriosIds?: number[];
}): Promise<Treinamento> {
  const { data } = await api.post<Treinamento>('/rh/treinamentos', payload);
  return data;
}

export async function atualizarTreinamento(
  id: number,
  payload: {
    titulo?: string;
    descricao?: string;
    cargaHoraria?: number;
    ativo?: boolean;
    cargosObrigatoriosIds?: number[];
  },
): Promise<Treinamento> {
  const { data } = await api.patch<Treinamento>(`/rh/treinamentos/${id}`, payload);
  return data;
}

export async function removerTreinamento(id: number): Promise<void> {
  await api.delete(`/rh/treinamentos/${id}`);
}

export async function listarMinhasMatriculas(): Promise<TreinamentoMatricula[]> {
  const { data } = await api.get<TreinamentoMatricula[]>('/rh/treinamentos/me');
  return data;
}

export type TreinamentoPendenteObrigatorio = {
  treinamento: TreinamentoResumoPlayer;
  matricula: TreinamentoMatricula | null;
};

export async function listarPendentesObrigatorios(): Promise<TreinamentoPendenteObrigatorio[]> {
  const { data } = await api.get<TreinamentoPendenteObrigatorio[]>('/rh/treinamentos/me/pendentes');
  return data;
}

/** Garante matrícula e retorna dados completos para abrir o player. */
export async function ingressarTreinamento(treinamentoId: number): Promise<TreinamentoMatricula> {
  const { data } = await api.post<TreinamentoMatricula>(`/rh/treinamentos/${treinamentoId}/ingressar`);
  return data;
}

export async function listarMatriculasTreinamento(id: number): Promise<TreinamentoMatricula[]> {
  const { data } = await api.get<TreinamentoMatricula[]>(`/rh/treinamentos/${id}/matriculas`);
  return data;
}

export async function matricularUsuarios(treinamentoId: number, usuarioIds: number[]): Promise<TreinamentoMatricula[]> {
  const { data } = await api.post<TreinamentoMatricula[]>(`/rh/treinamentos/${treinamentoId}/matriculas`, {
    usuarioIds,
  });
  return data;
}

export async function atualizarMatricula(
  id: number,
  payload: { status?: MatriculaTreinamentoStatus; certificadoUrl?: string; notaAvaliacao?: number },
): Promise<TreinamentoMatricula> {
  const { data } = await api.patch<TreinamentoMatricula>(`/rh/treinamentos/matriculas/${id}`, payload);
  return data;
}

// ─── Analytics + Folha ──────────────────────────────────────────────────────

export interface IndicadoresRh {
  mes: string;
  /** Ex.: 01/05/2026 – 04/05/2026 (fuso do servidor; alinhado ao corte em “hoje” no backend). */
  periodoDescricao?: string;
  totalUsuariosAtivos: number;
  trabalhadoMin: number;
  extraMin: number;
  atrasoMin: number;
  faltas: number;
  diasUteis: number;
  absenteismoPct: number;
  afastamentosNoMes: number;
  feriasPendentes: number;
  documentosVencendo: number;
  porCargo: Array<{ cargoId: number; nome: string; total: number }>;
}

export async function getIndicadoresRh(
  mes?: string,
  usuarioId?: number,
  dataInicio?: string,
  dataFim?: string,
): Promise<IndicadoresRh> {
  const params: Record<string, string | number> = {};
  if (mes) params.mes = mes;
  if (usuarioId != null) params.usuarioId = usuarioId;
  if (dataInicio) params.dataInicio = dataInicio;
  if (dataFim) params.dataFim = dataFim;
  const { data } = await api.get<IndicadoresRh>('/rh/indicadores', { params });
  return data;
}

export async function exportarFolhaCsv(mes?: string): Promise<void> {
  const response = await api.get('/rh/folha/exportar', { params: { mes }, responseType: 'blob' });
  baixarBlob(response.data, `folha-${mes ?? 'corrente'}.csv`);
}

// ─── Recibo do mês (REP-P) ─────────────────────────────────────────────────

export interface ReciboFechamento {
  fechamento: {
    id: number;
    competencia: string;
    saldoAnteriorMin: number;
    creditoMin: number;
    debitoMin: number;
    saldoFinalMin: number;
    fechadoEm: string;
    nsrInicial: number | null;
    nsrFinal: number | null;
    reciboHash: string | null;
    aceiteEm: string | null;
    aceiteIp: string | null;
    usuario: { id: number; nome: string; email: string; cpf: string | null };
    fechadoPor?: { id: number; nome: string } | null;
  };
  espelho: EspelhoMes;
  empregador: {
    id: number;
    razaoSocial: string;
    identificador: string;
    cei: string | null;
    endereco: string | null;
  } | null;
}

export async function getMeuRecibo(competencia?: string): Promise<ReciboFechamento> {
  const { data } = await api.get<ReciboFechamento>('/rh/banco-horas/me/recibo', {
    params: competencia ? { competencia } : {},
  });
  return data;
}

export async function aceitarMeuRecibo(competencia?: string): Promise<{ jaAceito: boolean; aceiteEm: string }> {
  const { data } = await api.post<{ jaAceito: boolean; aceiteEm: string }>(
    '/rh/banco-horas/me/recibo/aceitar',
    {},
    { params: competencia ? { competencia } : {} },
  );
  return data;
}

export async function getReciboPorUsuario(usuarioId: number, competencia?: string): Promise<ReciboFechamento> {
  const { data } = await api.get<ReciboFechamento>(`/rh/banco-horas/${usuarioId}/recibo`, {
    params: competencia ? { competencia } : {},
  });
  return data;
}

// ─── Empregador (REP-P) ────────────────────────────────────────────────────

export interface Empregador {
  id: number;
  tipoIdentificador: number;
  identificador: string;
  razaoSocial: string;
  cei: string | null;
  endereco: string | null;
  principal: boolean;
  /** Geocerca usada para validar a batida de ponto (todos os 3 campos juntos). */
  latitudeReferencia: number | null;
  longitudeReferencia: number | null;
  raioMetros: number | null;
  dataCriacao: string;
  dataAtualizacao: string;
}

export async function listarEmpregadores(): Promise<Empregador[]> {
  const { data } = await api.get<Empregador[]>('/rh/empregadores');
  return data;
}

export async function obterEmpregadorPrincipal(): Promise<Empregador | null> {
  const { data } = await api.get<Empregador | null>('/rh/empregadores/principal');
  return data;
}

export async function criarEmpregador(payload: {
  tipoIdentificador?: number;
  identificador: string;
  razaoSocial: string;
  cei?: string | null;
  endereco?: string | null;
  principal?: boolean;
  latitudeReferencia?: number | null;
  longitudeReferencia?: number | null;
  raioMetros?: number | null;
}): Promise<Empregador> {
  const { data } = await api.post<Empregador>('/rh/empregadores', payload);
  return data;
}

export async function atualizarEmpregador(
  id: number,
  payload: Partial<Omit<Empregador, 'id' | 'dataCriacao' | 'dataAtualizacao'>>,
): Promise<Empregador> {
  const { data } = await api.patch<Empregador>(`/rh/empregadores/${id}`, payload);
  return data;
}

export async function removerEmpregador(id: number): Promise<{ ok: true }> {
  const { data } = await api.delete<{ ok: true }>(`/rh/empregadores/${id}`);
  return data;
}

// ─── AFD (Portaria 671/2021) ───────────────────────────────────────────────

export async function exportarAfd(params: {
  inicio?: string;
  fim?: string;
  nsrInicial?: number;
  nsrFinal?: number;
}): Promise<void> {
  const response = await api.get('/rh/afd/exportar', { params, responseType: 'blob' });
  const ts = params.inicio ?? new Date().toISOString().slice(0, 10);
  baixarBlob(response.data, `AFD_${ts}.txt`, 'text/plain;charset=utf-8');
}

// ─── util ───────────────────────────────────────────────────────────────────

function baixarBlob(
  blobData: any,
  filename: string,
  mimeType: string = 'text/csv;charset=utf-8',
) {
  const blob = new Blob([blobData], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
