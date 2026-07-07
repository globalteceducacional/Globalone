import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { ChecklistItem, ChecklistItemEntrega } from '../types';
import { AttachmentList } from '../components/files/AttachmentList';
import { LinkifiedText } from '../components/common/LinkifiedText';
import { ReviewerCommentBox } from '../components/projects/ReviewerCommentBox';
import {
  getStatusColor,
  getStatusLabel,
  getChecklistItemStatusLabel,
} from '../utils/statusStyles';
import {
  getChecklistUnitWorkflowStatus,
  type ChecklistUnitWorkflowStatus,
  type EtapaEntregaCount,
  countTopLevelChecklistRowsFeitas,
  aggregateChecklistEntregaForEtapas,
  findChecklistEntregaForUnit,
} from '../utils/etapaChecklistStatus';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Usuario {
  id: number;
  nome: string;
}

interface EtapaEntregaLocal {
  id: number;
  descricao: string;
  status: 'EM_ANALISE' | 'APROVADA' | 'RECUSADA';
  dataEnvio: string;
  executor: Usuario;
  avaliadoPor?: Usuario | null;
  dataAvaliacao?: string | null;
  comentario?: string | null;
  imagemUrl?: string | null;
}

interface EtapaLocal {
  id: number;
  ordem?: number;
  nome: string;
  descricao?: string | null;
  status: 'PENDENTE' | 'EM_ANDAMENTO' | 'EM_ANALISE' | 'APROVADA' | 'REPROVADA';
  dataInicio?: string | null;
  dataFim?: string | null;
  sessaoId?: number | null;
  aba?: string | null;
  checklistJson?: ChecklistItem[] | null;
  checklistEntregas?: ChecklistItemEntrega[];
  entregas?: EtapaEntregaLocal[];
  executorId?: number;
  executor?: Usuario | null;
  integrantes?: Array<{ usuario: Usuario }>;
}

interface AbaWiki {
  nome: string;
  etapas: EtapaLocal[];
}

interface SessaoWiki {
  id: number | null;
  nome: string;
  ordem: number;
  abas: AbaWiki[];
}

interface TocEtapa {
  id: number;
  nome: string;
  numero: number;
  sessaoId: number | null;
  sessaoNome: string;
  abaNome: string;
}

interface WikiEntregaContext {
  entrega: ChecklistItemEntrega | undefined;
  arquivos: string[];
  descricaoEntrega: string | null;
  notaHeranca?: string;
  statusAuto?: string | null;
}

const AUTO_PARENT_MARK = 'Aprovado automaticamente junto com o item pai';
const AUTO_ETAPA_MARK = 'Aprovado automaticamente via entrega da etapa';

interface ProjectWikiData {
  id: number;
  nome: string;
  resumo?: string | null;
  objetivo?: string | null;
  status: 'EM_ANDAMENTO' | 'FINALIZADO';
  dataCriacao: string;
  supervisor?: Usuario | null;
  setores?: { id: number; nome: string }[];
  responsaveis: { usuario: Usuario }[];
  sessoes?: { id: number; nome: string; ordem?: number }[];
  etapas: EtapaLocal[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(date: string | null | undefined) {
  if (!date) return null;
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function fmtDatetime(date: string | null | undefined) {
  if (!date) return null;
  return new Date(date).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function resolveEntregaArquivos(entrega: ChecklistItemEntrega | EtapaEntregaLocal): string[] {
  if ('imagensUrls' in entrega) {
    const e = entrega as ChecklistItemEntrega;
    const imgs =
      Array.isArray(e.imagensUrls) && e.imagensUrls.length > 0
        ? e.imagensUrls
        : e.imagemUrl
          ? [e.imagemUrl]
          : [];
    const docs =
      Array.isArray(e.documentosUrls) && e.documentosUrls.length > 0
        ? e.documentosUrls
        : e.documentoUrl
          ? [e.documentoUrl]
          : [];
    return [...imgs, ...docs];
  }
  const etapa = entrega as EtapaEntregaLocal;
  return etapa.imagemUrl ? [etapa.imagemUrl] : [];
}

function getLatestEntrega(
  etapa: Pick<EtapaLocal, 'checklistJson' | 'checklistEntregas'>,
  checklistIndex: number,
  subitemIndex?: number | null,
): ChecklistItemEntrega | undefined {
  return findChecklistEntregaForUnit(etapa, checklistIndex, subitemIndex);
}

function isAutoInheritedDescricao(desc?: string | null): boolean {
  if (!desc) return false;
  return desc.includes(AUTO_PARENT_MARK) || desc.includes(AUTO_ETAPA_MARK);
}

function getLatestEtapaEntregaComArquivos(etapa: EtapaLocal): EtapaEntregaLocal | undefined {
  const entregas = etapa.entregas ?? [];
  if (entregas.length === 0) return undefined;
  const sorted = [...entregas].sort(
    (a, b) => new Date(b.dataEnvio).getTime() - new Date(a.dataEnvio).getTime(),
  );
  return sorted.find((e) => resolveEntregaArquivos(e).length > 0) ?? sorted[0];
}

/** Resolve entrega exibida na wiki, herdando arquivos/descrição do item pai ou da etapa quando aplicável. */
function resolveWikiEntregaContext(
  etapa: EtapaLocal,
  checklistIndex: number,
  subitemIndex?: number | null,
): WikiEntregaContext {
  const entregaPai = getLatestEntrega(etapa, checklistIndex, null);
  const entregaEtapa = getLatestEtapaEntregaComArquivos(etapa);
  const arquivosEtapa = entregaEtapa ? resolveEntregaArquivos(entregaEtapa) : [];

  const applyHerancaEtapa = (
    arquivosAtuais: string[],
    descricaoAtual: string | null,
    nota?: string,
  ): { arquivos: string[]; descricaoEntrega: string | null; notaHeranca?: string } => {
    if (arquivosAtuais.length > 0 || arquivosEtapa.length === 0) {
      return { arquivos: arquivosAtuais, descricaoEntrega: descricaoAtual, notaHeranca: nota };
    }
    return {
      arquivos: arquivosEtapa,
      descricaoEntrega: entregaEtapa?.descricao ?? descricaoAtual,
      notaHeranca: nota ?? 'Arquivos da entrega da etapa.',
    };
  };

  if (subitemIndex == null) {
    const entrega = entregaPai;
    let arquivos = entrega ? resolveEntregaArquivos(entrega) : [];
    let descricaoEntrega = entrega?.descricao ?? null;
    let notaHeranca: string | undefined;
    const statusAuto =
      descricaoEntrega && isAutoInheritedDescricao(descricaoEntrega) ? descricaoEntrega : null;

    if (isAutoInheritedDescricao(descricaoEntrega) && descricaoEntrega?.includes(AUTO_ETAPA_MARK)) {
      const heranca = applyHerancaEtapa(arquivos, descricaoEntrega);
      arquivos = heranca.arquivos;
      descricaoEntrega = heranca.descricaoEntrega;
      notaHeranca = heranca.notaHeranca;
    }

    return { entrega, arquivos, descricaoEntrega, notaHeranca, statusAuto };
  }

  const entregaSub = getLatestEntrega(etapa, checklistIndex, subitemIndex);
  const arquivosSub = entregaSub ? resolveEntregaArquivos(entregaSub) : [];
  const arquivosPai = entregaPai ? resolveEntregaArquivos(entregaPai) : [];
  let arquivos = arquivosSub.length > 0 ? arquivosSub : arquivosPai;

  const statusAuto = entregaSub?.descricao && isAutoInheritedDescricao(entregaSub.descricao)
    ? entregaSub.descricao
    : null;

  let descricaoEntrega = entregaSub?.descricao ?? null;
  let notaHeranca: string | undefined;

  if (isAutoInheritedDescricao(descricaoEntrega) && descricaoEntrega?.includes(AUTO_PARENT_MARK)) {
    if (entregaPai?.descricao) {
      notaHeranca = 'Documentos e relato herdados da entrega do item pai.';
      descricaoEntrega = entregaPai.descricao;
    }
  } else if (isAutoInheritedDescricao(descricaoEntrega) && descricaoEntrega?.includes(AUTO_ETAPA_MARK)) {
    const heranca = applyHerancaEtapa(arquivos, descricaoEntrega);
    arquivos = heranca.arquivos;
    descricaoEntrega = heranca.descricaoEntrega;
    notaHeranca = heranca.notaHeranca;
  } else if (arquivosSub.length === 0 && arquivosPai.length > 0) {
    notaHeranca = 'Arquivos da entrega do item pai.';
    if (!descricaoEntrega || isAutoInheritedDescricao(descricaoEntrega)) {
      descricaoEntrega = entregaPai?.descricao ?? descricaoEntrega;
    }
  } else if (arquivosSub.length === 0 && arquivosEtapa.length > 0) {
    const heranca = applyHerancaEtapa(arquivos, descricaoEntrega);
    arquivos = heranca.arquivos;
    descricaoEntrega = heranca.descricaoEntrega;
    notaHeranca = heranca.notaHeranca;
  }

  return {
    entrega: entregaSub ?? entregaPai,
    arquivos,
    descricaoEntrega,
    notaHeranca,
    statusAuto,
  };
}

function normalizarRelatoEntrega(desc?: string | null): string {
  return (desc ?? '').trim();
}

function entregasTemMesmosArquivos(
  a: ChecklistItemEntrega | undefined,
  b: ChecklistItemEntrega | undefined,
): boolean {
  if (!a || !b) return false;
  const arqA = resolveEntregaArquivos(a).slice().sort().join('|');
  const arqB = resolveEntregaArquivos(b).slice().sort().join('|');
  return arqA === arqB;
}

function entregasTemMesmoRelato(
  a: ChecklistItemEntrega | undefined,
  b: ChecklistItemEntrega | undefined,
): boolean {
  if (!a || !b) return false;
  const relatoA = normalizarRelatoEntrega(a.descricao);
  const relatoB = normalizarRelatoEntrega(b.descricao);
  if (isAutoInheritedDescricao(relatoA) || isAutoInheritedDescricao(relatoB)) return true;
  if (!relatoA && !relatoB) return true;
  return relatoA === relatoB;
}

function entregasSaoEquivalentes(
  a: ChecklistItemEntrega | undefined,
  b: ChecklistItemEntrega | undefined,
): boolean {
  if (!a || !b) return false;
  if (a.comentario?.trim() || b.comentario?.trim()) return false;
  return (
    entregasTemMesmosArquivos(a, b) &&
    entregasTemMesmoRelato(a, b)
  );
}

/** Entrega de referência do item: pai, ou primeira subtarefa com envio. */
function getEntregaCanonicaChecklistItem(
  etapa: EtapaLocal,
  checklistIndex: number,
  subitemCount: number,
): ChecklistItemEntrega | undefined {
  const pai = getLatestEntrega(etapa, checklistIndex, null);
  if (pai) return pai;
  for (let i = 0; i < subitemCount; i++) {
    const sub = getLatestEntrega(etapa, checklistIndex, i);
    if (sub) return sub;
  }
  return undefined;
}

function checklistItemTemEntregaWiki(
  etapa: EtapaLocal,
  checklistIndex: number,
  subitemCount: number,
): boolean {
  return Boolean(getEntregaCanonicaChecklistItem(etapa, checklistIndex, subitemCount));
}

function resolveWikiEntregaContextItemConsolidado(
  etapa: EtapaLocal,
  checklistIndex: number,
  subitemCount: number,
): WikiEntregaContext {
  const pai = getLatestEntrega(etapa, checklistIndex, null);
  if (pai) return resolveWikiEntregaContext(etapa, checklistIndex, null);
  for (let i = 0; i < subitemCount; i++) {
    if (getLatestEntrega(etapa, checklistIndex, i)) {
      return resolveWikiEntregaContext(etapa, checklistIndex, i);
    }
  }
  return resolveWikiEntregaContext(etapa, checklistIndex, null);
}

/** Subtarefa com entrega realmente independente da do item pai (vale exibir na wiki). */
function entregaSubtemEnvioProprioDistinto(
  entregaSub: ChecklistItemEntrega,
  entregaPai: ChecklistItemEntrega,
): boolean {
  if (isAutoInheritedDescricao(entregaSub.descricao)) {
    return resolveEntregaArquivos(entregaSub).length > 0;
  }

  const arquivosSub = resolveEntregaArquivos(entregaSub);
  const arquivosPai = resolveEntregaArquivos(entregaPai);
  if (arquivosSub.length > 0 && !entregasTemMesmosArquivos(entregaSub, entregaPai)) {
    return true;
  }

  const relatoSub = normalizarRelatoEntrega(entregaSub.descricao);
  const relatoPai = normalizarRelatoEntrega(entregaPai.descricao);
  if (relatoSub && relatoPai && relatoSub !== relatoPai) {
    return true;
  }

  const comentarioSub = (entregaSub.comentario ?? '').trim();
  const comentarioPai = (entregaPai.comentario ?? '').trim();
  if (comentarioSub && comentarioSub !== comentarioPai) {
    return true;
  }

  return false;
}

/** Oculta subtarefa quando a entrega foi feita pelo item pai ou é duplicata da canônica. */
function deveOcultarSubtarefaWiki(
  etapa: EtapaLocal,
  checklistIndex: number,
  subitemIndex: number,
  subitemCount: number,
): boolean {
  const entregaPai = getLatestEntrega(etapa, checklistIndex, null);
  const entregaSub = getLatestEntrega(etapa, checklistIndex, subitemIndex);

  // Entrega pela tarefa pai → só exibir subtarefas com envio próprio distinto
  if (entregaPai) {
    if (!entregaSub) return true;
    return !entregaSubtemEnvioProprioDistinto(entregaSub, entregaPai);
  }

  const canonica = getEntregaCanonicaChecklistItem(etapa, checklistIndex, subitemCount);
  if (!entregaSub || !canonica) return false;
  if (entregaSub.comentario?.trim()) return false;

  const arquivosSub = resolveEntregaArquivos(entregaSub);
  if (isAutoInheritedDescricao(entregaSub.descricao) && arquivosSub.length === 0) {
    return true;
  }

  return entregasSaoEquivalentes(entregaSub, canonica);
}

function groupEtapasByAba(etapas: EtapaLocal[]): AbaWiki[] {
  const map = new Map<string, EtapaLocal[]>();
  for (const e of etapas) {
    const nome = (e.aba && e.aba.trim()) || 'Geral';
    if (!map.has(nome)) map.set(nome, []);
    map.get(nome)!.push(e);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => {
      if (a === 'Geral') return -1;
      if (b === 'Geral') return 1;
      return a.localeCompare(b, 'pt-BR');
    })
    .map(([nome, list]) => ({ nome, etapas: list }));
}

function workflowStatusMeta(status: ChecklistUnitWorkflowStatus): {
  label: string;
  badgeClass: string;
  dotClass: string;
} {
  switch (status) {
    case 'APROVADO':
      return {
        label: 'Entregue',
        badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        dotClass: 'bg-emerald-400',
      };
    case 'MARCADO_CADASTRO':
      return {
        label: 'Concluído (cadastro)',
        badgeClass: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
        dotClass: 'bg-teal-400',
      };
    case 'EM_ANALISE':
      return {
        label: 'Em análise',
        badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
        dotClass: 'bg-sky-400',
      };
    case 'REPROVADO':
      return {
        label: 'Reprovada',
        badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
        dotClass: 'bg-rose-400',
      };
    case 'FAZENDO':
      return {
        label: 'Em andamento',
        badgeClass: 'bg-amber-500/10 text-amber-200/80 border-amber-500/25',
        dotClass: 'bg-amber-400/70',
      };
    default:
      return {
        label: 'Em andamento',
        badgeClass: 'bg-white/5 text-white/45 border-white/15',
        dotClass: 'bg-white/30',
      };
  }
}

/** Container com scroll do AppLayout (section principal). */
function getAppScrollRoot(from: HTMLElement | null): HTMLElement | null {
  let node = from?.parentElement ?? null;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

// ─── Índice lateral (navegação rápida) ────────────────────────────────────────

function WikiTableOfContents({
  toc,
  activeEtapaId,
  onNavigate,
  mobileOpen,
  onCloseMobile,
}: {
  toc: TocEtapa[];
  activeEtapaId: number | null;
  onNavigate: (etapaId: number) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const bySessao = useMemo(() => {
    const map = new Map<string, TocEtapa[]>();
    for (const item of toc) {
      const key = item.sessaoNome;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries());
  }, [toc]);

  // Mantém o item ativo visível dentro do painel (sem animação — evita “travar” o scroll).
  useEffect(() => {
    if (activeEtapaId == null) return;
    const panels = document.querySelectorAll<HTMLElement>('[data-wiki-toc-panel]');
    for (const panel of panels) {
      if (panel.offsetParent === null && panel.getClientRects().length === 0) continue;
      const btn = panel.querySelector<HTMLElement>(
        `[data-wiki-toc-item="${activeEtapaId}"]`,
      );
      if (btn) {
        btn.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        break;
      }
    }
  }, [activeEtapaId]);

  const tocScrollClass =
    'flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1 pb-3 overscroll-contain ' +
    '[scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.25)_transparent] ' +
    '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent ' +
    '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/25 ' +
    'hover:[&::-webkit-scrollbar-thumb]:bg-white/40';

  const navContent = (
    <nav className="space-y-5 py-1">
      {bySessao.map(([sessaoNome, etapas]) => {
        const abasUnicas = new Set(etapas.map((e) => e.abaNome));
        const mostrarAba = abasUnicas.size > 1;
        let abaAtual = '';

        return (
          <div key={sessaoNome}>
            <p
              className="text-[10px] font-semibold uppercase tracking-wide text-white/30 mb-2 px-2 leading-snug line-clamp-2"
              title={sessaoNome}
            >
              {sessaoNome}
            </p>
            <ul className="space-y-0.5 border-l border-white/10 ml-2">
              {etapas.map((e) => {
                const showAbaHeader = mostrarAba && e.abaNome !== abaAtual;
                if (showAbaHeader) abaAtual = e.abaNome;
                const isActive = activeEtapaId === e.id;
                return (
                  <li key={e.id}>
                    {showAbaHeader && (
                      <p className="text-[9px] uppercase tracking-wide text-sky-400/45 pl-3 pt-2 pb-0.5">
                        {e.abaNome}
                      </p>
                    )}
                    <button
                      data-wiki-toc-item={e.id}
                      type="button"
                      onClick={() => {
                        onNavigate(e.id);
                        onCloseMobile();
                      }}
                      className={`w-full text-left pl-3 pr-2 py-1.5 text-[13px] leading-snug transition-colors border-l-2 -ml-px ${
                        isActive
                          ? 'border-primary text-white bg-primary/10'
                          : 'border-transparent text-white/55 hover:text-white/90 hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className="font-semibold text-white/90">Etapa {e.numero}</span>
                      <span className="text-white/40"> — </span>
                      <span className={isActive ? 'text-white/85' : 'text-white/55'}>
                        {e.nome}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  const tocPanel = (
    <>
      <div className="sticky top-0 z-10 shrink-0 bg-slate-900/95 backdrop-blur-md px-3 pt-3 pb-2 border-b border-white/10">
        <p className="text-[11px] font-bold uppercase tracking-widest text-white/45">
          Índice
        </p>
      </div>
      <div
        data-wiki-toc-panel
        className={tocScrollClass}
      >
        {navContent}
      </div>
    </>
  );

  const desktopPanelClass =
    'flex flex-col rounded-xl border border-white/10 bg-slate-900/80 shadow-lg shadow-black/25 backdrop-blur-md overflow-hidden';

  return (
    <>
      {/* Desktop: coluna lateral sticky — não sobrepõe o cabeçalho do projeto */}
      <aside
        className="hidden lg:block w-60 xl:w-72 shrink-0 self-start sticky top-4 z-10"
        aria-label="Índice do documento"
      >
        <div
          className={`${desktopPanelClass} flex flex-col max-h-[calc(100dvh-5.5rem)]`}
          style={{ height: 'calc(100dvh - 5.5rem)' }}
        >
          {tocPanel}
        </div>
      </aside>

      {/* Mobile: drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={onCloseMobile}
            aria-hidden
          />
          <div className="relative ml-auto w-80 max-w-[90vw] h-full bg-neutral border-l border-white/15 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
              <span className="text-sm font-semibold text-white">Índice</span>
              <button
                type="button"
                onClick={onCloseMobile}
                className="text-white/50 hover:text-white text-xl leading-none"
                aria-label="Fechar índice"
              >
                ✕
              </button>
            </div>
            <div
              data-wiki-toc-panel
              className={`flex-1 min-h-0 ${tocScrollClass}`}
            >
              {navContent}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Bloco de documentação da entrega (conteúdo expandido) ───────────────────

function EntregaDocBlock({
  titulo,
  descricaoEntrega,
  descricaoTarefa,
  arquivos,
  executor,
  dataEnvio,
  status,
  avaliadoPor,
  dataAvaliacao,
  comentario,
  notaHeranca,
  statusAuto,
}: {
  titulo?: string;
  descricaoEntrega?: string | null;
  descricaoTarefa?: string | null;
  arquivos: string[];
  executor?: string | null;
  dataEnvio?: string | null;
  status?: string;
  avaliadoPor?: string | null;
  dataAvaliacao?: string | null;
  comentario?: string | null;
  notaHeranca?: string;
  statusAuto?: string | null;
}) {
  const hasContent =
    descricaoTarefa ||
    descricaoEntrega ||
    arquivos.length > 0 ||
    comentario ||
    statusAuto;

  if (!hasContent && !executor) {
    return (
      <p className="text-xs text-white/35 italic py-2">Nenhuma documentação registrada ainda.</p>
    );
  }

  return (
    <div className="wiki-doc-block border border-white/10 rounded-lg overflow-hidden bg-slate-950/40">
      {/* Cabeçalho da tabela doc */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] border-b border-white/10 bg-slate-900/50 text-[10px] uppercase tracking-wide font-semibold text-white/40">
        <div className="px-4 py-2 border-b md:border-b-0 md:border-r border-white/10">
          Descrição
        </div>
        <div className="px-4 py-2">Documentos</div>
      </div>

      {/* Corpo: descrição | arquivos */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] divide-y md:divide-y-0 md:divide-x divide-white/10 min-w-0">
        <div className="px-4 py-3 space-y-3 min-w-0 overflow-hidden">
          {titulo && (
            <p className="text-[11px] font-semibold text-white/50 uppercase tracking-wide">
              {titulo}
            </p>
          )}
          {descricaoTarefa && (
            <div>
              <p className="text-[10px] uppercase text-white/35 mb-1">Especificação da tarefa</p>
              <LinkifiedText
                text={descricaoTarefa}
                className="text-sm text-white/75 whitespace-pre-wrap leading-relaxed"
              />
            </div>
          )}
          {statusAuto && (
            <div className="rounded-md bg-sky-500/10 border border-sky-500/20 px-3 py-2">
              <p className="text-xs text-sky-200/90">{statusAuto}</p>
            </div>
          )}
          {notaHeranca && (
            <p className="text-[11px] text-primary/80 italic">{notaHeranca}</p>
          )}
          {descricaoEntrega ? (
            <div>
              <p className="text-[10px] uppercase text-white/35 mb-1">Relato da entrega</p>
              <LinkifiedText
                text={descricaoEntrega}
                className="text-sm text-white/85 whitespace-pre-wrap leading-relaxed"
              />
            </div>
          ) : !descricaoTarefa && !statusAuto ? (
            <p className="text-sm text-white/40 italic">Sem descrição informada.</p>
          ) : null}
          {comentario && <ReviewerCommentBox text={comentario} />}
        </div>

        <div className="px-4 py-3 min-w-0">
          {arquivos.length > 0 ? (
            <AttachmentList raw={arquivos} title="" variant="grid" />
          ) : (
            <p className="text-sm text-white/35 italic">Nenhum arquivo anexado.</p>
          )}
        </div>
      </div>

      {/* Rodapé meta */}
      {(executor || dataEnvio || status) && (
        <div className="px-4 py-2 border-t border-white/10 bg-slate-900/30 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/45">
          {executor && (
            <span>
              Por <span className="text-white/70">{executor}</span>
            </span>
          )}
          {dataEnvio && (
            <span>
              em <span className="text-white/70">{fmtDatetime(dataEnvio)}</span>
            </span>
          )}
          {status && (
            <span className="text-white/55">{getChecklistItemStatusLabel(status)}</span>
          )}
          {avaliadoPor && (
            <span>
              Avaliado por <span className="text-white/70">{avaliadoPor}</span>
              {dataAvaliacao && <> em {fmtDatetime(dataAvaliacao)}</>}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Linha de tarefa (accordion estilo documentação) ─────────────────────────

function WikiTaskDocRow({
  numero,
  label,
  descricaoTarefa,
  workflowStatus,
  entregaCtx,
  subitem = false,
  defaultOpen,
}: {
  numero: string;
  label: string;
  descricaoTarefa?: string | null;
  workflowStatus: ChecklistUnitWorkflowStatus;
  entregaCtx: WikiEntregaContext;
  subitem?: boolean;
  defaultOpen?: boolean;
}) {
  const meta = workflowStatusMeta(workflowStatus);
  const { entrega, arquivos, descricaoEntrega, notaHeranca, statusAuto } = entregaCtx;
  const hasDoc =
    Boolean(descricaoTarefa) ||
    Boolean(descricaoEntrega) ||
    arquivos.length > 0 ||
    Boolean(entrega?.comentario) ||
    Boolean(statusAuto);

  const [open, setOpen] = useState(defaultOpen ?? hasDoc);

  return (
    <div
      className={`border border-white/10 rounded-lg overflow-hidden ${
        subitem ? 'ml-4 md:ml-6' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left bg-slate-900/30 hover:bg-slate-900/50 transition-colors"
      >
        <ChevronIcon open={open} />
        <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dotClass}`} aria-hidden />
        <span className="text-[11px] tabular-nums text-white/35 shrink-0">{numero}</span>
        <span className="text-sm text-white/85 flex-1 min-w-0 truncate">{label}</span>
        <span
          className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold border ${meta.badgeClass}`}
        >
          {meta.label}
        </span>
        {arquivos.length > 0 && (
          <span className="shrink-0 text-[10px] text-white/40 tabular-nums">
            {arquivos.length} arquivo{arquivos.length !== 1 ? 's' : ''}
          </span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-white/10 bg-slate-950/20">
          <EntregaDocBlock
            descricaoTarefa={descricaoTarefa}
            descricaoEntrega={descricaoEntrega}
            arquivos={arquivos}
            executor={entrega?.executor?.nome}
            dataEnvio={entrega?.dataEnvio}
            status={entrega?.status}
            avaliadoPor={entrega?.avaliadoPor?.nome}
            dataAvaliacao={entrega?.dataAvaliacao}
            comentario={entrega?.comentario}
            notaHeranca={notaHeranca}
            statusAuto={statusAuto}
          />
        </div>
      )}
    </div>
  );
}

// ─── Entrega da etapa (fora do checklist) ────────────────────────────────────

function WikiEtapaEntregaRow({ entrega, index }: { entrega: EtapaEntregaLocal; index: number }) {
  const arquivos = resolveEntregaArquivos(entrega);
  const statusMap: Record<string, string> = {
    APROVADA: 'APROVADO',
    EM_ANALISE: 'EM_ANALISE',
    RECUSADA: 'REPROVADO',
  };
  const [open, setOpen] = useState(true);

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left bg-slate-900/30 hover:bg-slate-900/50 transition-colors"
      >
        <ChevronIcon open={open} />
        <span className="text-[11px] tabular-nums text-white/35">E{index + 1}</span>
        <span className="text-sm text-white/85 flex-1 min-w-0 truncate">{entrega.descricao}</span>
        <span className="text-[10px] text-white/45 shrink-0">{fmt(entrega.dataEnvio)}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-white/10">
          <EntregaDocBlock
            descricaoEntrega={entrega.descricao}
            arquivos={arquivos}
            executor={entrega.executor?.nome}
            dataEnvio={entrega.dataEnvio}
            status={statusMap[entrega.status] ?? entrega.status}
            avaliadoPor={entrega.avaliadoPor?.nome}
            dataAvaliacao={entrega.dataAvaliacao}
            comentario={entrega.comentario}
          />
        </div>
      )}
    </div>
  );
}

// ─── Seção de etapa (accordion + âncora) ──────────────────────────────────────

function WikiEtapaSection({
  etapa,
  numero,
  abaNome,
  showAbaBadge = false,
  defaultOpen = true,
}: {
  etapa: EtapaLocal;
  numero: number;
  abaNome?: string;
  showAbaBadge?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const checklist = Array.isArray(etapa.checklistJson) ? etapa.checklistJson : [];
  const { feitas, total } = countTopLevelChecklistRowsFeitas(etapa);
  const progressPct = total > 0 ? Math.round((feitas / total) * 100) : null;

  return (
    <article
      id={`wiki-etapa-${etapa.id}`}
      className="scroll-mt-24 border border-white/15 rounded-xl overflow-hidden bg-slate-800/30"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 px-4 py-4 text-left bg-slate-900/40 hover:bg-slate-900/60 transition-colors border-b border-white/10"
      >
        <ChevronIcon open={open} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-white/30 tabular-nums">{numero}.</span>
            <h3 className="text-base font-semibold text-white">{etapa.nome}</h3>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getStatusColor(etapa.status)}`}
            >
              {getStatusLabel(etapa.status)}
            </span>
            {showAbaBadge && abaNome && abaNome !== 'Geral' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-medium border border-sky-500/30 bg-sky-500/10 text-sky-300">
                {abaNome}
              </span>
            )}
          </div>
          {etapa.descricao && (
            <p className="mt-1 text-xs text-white/55 line-clamp-2">{etapa.descricao}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/45">
            {etapa.executor && <span>Executor: {etapa.executor.nome}</span>}
            {etapa.dataFim && <span>Prazo: {fmt(etapa.dataFim)}</span>}
            {progressPct !== null && (
              <span className="text-emerald-400/80">
                {feitas}/{total} tarefas ({progressPct}%)
              </span>
            )}
          </div>
        </div>
      </button>

      {open && (
        <div className="p-4 space-y-3">
          {etapa.descricao && (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-white/35 font-semibold mb-1">
                Sobre esta etapa
              </p>
              <p className="text-sm text-white/75 whitespace-pre-wrap leading-relaxed">
                {etapa.descricao}
              </p>
            </div>
          )}

          {checklist.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-white/35 font-semibold">
                Tarefas e entregas
              </p>
              {checklist.map((item, idx) => {
                const hasSubitens = Array.isArray(item.subitens) && item.subitens.length > 0;
                const wfStatus = getChecklistUnitWorkflowStatus(etapa, { checklistIndex: idx });

                if (hasSubitens) {
                  const subCount = item.subitens!.length;
                  const entregaPai = getLatestEntrega(etapa, idx, null);
                  const ctxConsolidado = resolveWikiEntregaContextItemConsolidado(etapa, idx, subCount);
                  const temEntregaConsolidada = checklistItemTemEntregaWiki(etapa, idx, subCount);

                  const subitensVisiveis = item.subitens!
                    .map((sub, subIdx) => ({ sub, subIdx }))
                    .filter(
                      ({ subIdx }) => !deveOcultarSubtarefaWiki(etapa, idx, subIdx, subCount),
                    );

                  const mostrarEntregaUnica =
                    Boolean(entregaPai) ||
                    (temEntregaConsolidada && subitensVisiveis.length === 0);

                  return (
                    <div key={idx} className="space-y-2">
                      {mostrarEntregaUnica && (
                        <WikiTaskDocRow
                          numero={`${numero}.${idx + 1}`}
                          label={item.texto}
                          descricaoTarefa={item.descricao}
                          workflowStatus={wfStatus}
                          entregaCtx={ctxConsolidado}
                          defaultOpen={
                            ctxConsolidado.arquivos.length > 0 ||
                            Boolean(ctxConsolidado.descricaoEntrega)
                          }
                        />
                      )}
                      {!mostrarEntregaUnica && (
                        <div className="flex items-center gap-2 px-1 py-1">
                          <span className="text-[11px] tabular-nums text-white/35">
                            {numero}.{idx + 1}
                          </span>
                          <span className="text-sm font-medium text-white/70">{item.texto}</span>
                          {item.descricao && (
                            <span className="text-xs text-white/40 truncate hidden sm:inline">
                              — {item.descricao.slice(0, 60)}
                              {item.descricao.length > 60 ? '…' : ''}
                            </span>
                          )}
                        </div>
                      )}
                      {subitensVisiveis.length > 0 && (
                        <div className="space-y-2 pl-2 border-l-2 border-white/10">
                          {subitensVisiveis.map(({ sub, subIdx }) => {
                            const subWf = getChecklistUnitWorkflowStatus(etapa, {
                              checklistIndex: idx,
                              subitemIndex: subIdx,
                            });
                            const subCtx = resolveWikiEntregaContext(etapa, idx, subIdx);
                            return (
                              <WikiTaskDocRow
                                key={subIdx}
                                numero={`${numero}.${idx + 1}.${subIdx + 1}`}
                                label={sub.texto}
                                descricaoTarefa={sub.descricao}
                                workflowStatus={subWf}
                                entregaCtx={subCtx}
                                subitem
                                defaultOpen={
                                  subWf === 'APROVADO' ||
                                  subWf === 'EM_ANALISE' ||
                                  subCtx.arquivos.length > 0 ||
                                  Boolean(subCtx.entrega)
                                }
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                const itemCtx = resolveWikiEntregaContext(etapa, idx, null);
                return (
                  <WikiTaskDocRow
                    key={idx}
                    numero={`${numero}.${idx + 1}`}
                    label={item.texto}
                    descricaoTarefa={item.descricao}
                    workflowStatus={wfStatus}
                    entregaCtx={itemCtx}
                    defaultOpen={
                      wfStatus === 'APROVADO' ||
                      wfStatus === 'EM_ANALISE' ||
                      itemCtx.arquivos.length > 0 ||
                      Boolean(itemCtx.entrega)
                    }
                  />
                );
              })}
            </div>
          )}

          {(etapa.entregas ?? []).length > 0 && (
            <div className="space-y-2 pt-2 border-t border-white/10">
              <p className="text-[10px] uppercase tracking-widest text-white/35 font-semibold">
                Entregas da etapa
              </p>
              {etapa.entregas!.map((e, i) => (
                <WikiEtapaEntregaRow key={e.id} entrega={e} index={i} />
              ))}
            </div>
          )}

          {checklist.length === 0 && (etapa.entregas ?? []).length === 0 && (
            <p className="text-xs text-white/35 italic">Nenhuma tarefa cadastrada nesta etapa.</p>
          )}
        </div>
      )}
    </article>
  );
}

// ─── Seção de sessão ─────────────────────────────────────────────────────────

function WikiSessaoSection({
  sessao,
  startNumero,
  defaultOpen = true,
}: {
  sessao: SessaoWiki;
  startNumero: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  let counter = startNumero;
  const totalEtapas = sessao.abas.reduce((n, a) => n + a.etapas.length, 0);
  const multiplasAbas = sessao.abas.length > 1;

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 group"
      >
        <ChevronIcon open={open} />
        <h2 className="text-sm font-bold uppercase tracking-widest text-white/55 group-hover:text-white/75 transition-colors">
          {sessao.nome}
        </h2>
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-[10px] text-white/35 tabular-nums">
          {totalEtapas} etapa{totalEtapas !== 1 ? 's' : ''}
        </span>
      </button>

      {open && (
        <div className="space-y-5 pl-2">
          {sessao.abas.map((aba) => (
            <div key={aba.nome} className="space-y-3">
              {multiplasAbas && (
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-sky-400/70 px-1 flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-sky-400/60 shrink-0" />
                  Aba: {aba.nome}
                </h3>
              )}
              {aba.etapas.map((etapa) => {
                const num = counter++;
                return (
                  <WikiEtapaSection
                    key={etapa.id}
                    etapa={etapa}
                    numero={num}
                    abaNome={aba.nome}
                    showAbaBadge={multiplasAbas}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function ProjectWiki() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<ProjectWikiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const [activeEtapaId, setActiveEtapaId] = useState<number | null>(null);
  const [introOpen, setIntroOpen] = useState(true);
  const pageRef = useRef<HTMLDivElement>(null);
  const scrollSpyPausedRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get<ProjectWikiData>(`/projects/${id}`)
      .then((res) => setProject(res.data))
      .catch((err) => {
        setError(String(err?.response?.data?.message ?? 'Erro ao carregar o projeto.'));
      })
      .finally(() => setLoading(false));
  }, [id]);

  const sessoesMapeadas = useMemo((): SessaoWiki[] => {
    if (!project) return [];
    const sessaoMap = new Map<string, SessaoWiki>();

    (project.sessoes ?? [])
      .slice()
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .forEach((s) => {
        sessaoMap.set(String(s.id), {
          id: s.id,
          nome: s.nome,
          ordem: s.ordem ?? 0,
          abas: [],
        });
      });

    const etapasOrdenadas = [...project.etapas].sort(
      (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.id - b.id,
    );

    const etapasPorSessao = new Map<string, EtapaLocal[]>();

    for (const etapa of etapasOrdenadas) {
      const key = etapa.sessaoId != null ? String(etapa.sessaoId) : '__sem_sessao__';
      if (!sessaoMap.has(key)) {
        sessaoMap.set(key, {
          id: etapa.sessaoId ?? null,
          nome: 'Sem sessão',
          ordem: 9999,
          abas: [],
        });
      }
      if (!etapasPorSessao.has(key)) etapasPorSessao.set(key, []);
      etapasPorSessao.get(key)!.push(etapa);
    }

    return Array.from(sessaoMap.values())
      .map((s) => {
        const key = s.id != null ? String(s.id) : '__sem_sessao__';
        const etapas = etapasPorSessao.get(key) ?? [];
        return { ...s, abas: groupEtapasByAba(etapas) };
      })
      .filter((s) => s.abas.some((a) => a.etapas.length > 0));
  }, [project]);

  const toc = useMemo((): TocEtapa[] => {
    const items: TocEtapa[] = [];
    let num = 0;
    for (const sessao of sessoesMapeadas) {
      for (const aba of sessao.abas) {
        for (const etapa of aba.etapas) {
          num++;
          items.push({
            id: etapa.id,
            nome: etapa.nome,
            numero: num,
            sessaoId: sessao.id,
            sessaoNome: sessao.nome,
            abaNome: aba.nome,
          });
        }
      }
    }
    return items;
  }, [sessoesMapeadas]);

  const progressoGeral = useMemo(() => {
    if (!project) return { total: 0, feitas: 0 };
    const etapasForCount: EtapaEntregaCount[] = project.etapas.map((e) => ({
      ...e,
      executorId: e.executorId ?? e.executor?.id ?? 0,
    }));
    const agg = aggregateChecklistEntregaForEtapas(etapasForCount);
    return { total: agg.total, feitas: agg.aprovados };
  }, [project]);

  const progressoPct =
    progressoGeral.total > 0
      ? Math.round((progressoGeral.feitas / progressoGeral.total) * 100)
      : null;

  const scrollToEtapa = useCallback((etapaId: number) => {
    scrollSpyPausedRef.current = true;
    setActiveEtapaId(etapaId);
    const target = document.getElementById(`wiki-etapa-${etapaId}`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      scrollSpyPausedRef.current = false;
    }, 800);
  }, []);

  // Destaca no índice a etapa visível enquanto o usuário rola o documento.
  useEffect(() => {
    if (!project || toc.length === 0) return;

    const scrollRoot = getAppScrollRoot(pageRef.current);
    if (!scrollRoot) return;

    const updateActiveFromScroll = () => {
      if (scrollSpyPausedRef.current) return;

      const rootTop = scrollRoot.getBoundingClientRect().top;
      const anchor = rootTop + 96;

      let currentId: number | null = null;
      for (const item of toc) {
        const el = document.getElementById(`wiki-etapa-${item.id}`);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= anchor) {
          currentId = item.id;
        }
      }

      if (currentId != null) {
        setActiveEtapaId((prev) => (prev === currentId ? prev : currentId));
      }
    };

    updateActiveFromScroll();
    scrollRoot.addEventListener('scroll', updateActiveFromScroll, { passive: true });
    window.addEventListener('resize', updateActiveFromScroll);

    return () => {
      scrollRoot.removeEventListener('scroll', updateActiveFromScroll);
      window.removeEventListener('resize', updateActiveFromScroll);
    };
  }, [project, toc]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-white/60">
        Carregando documentação…
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-lg bg-red-500/20 border border-red-500/40 text-red-200 px-5 py-4 text-sm">
          {error ?? 'Projeto não encontrado.'}
        </div>
        <button
          type="button"
          onClick={() => navigate('/projects')}
          className="mt-4 text-sm text-primary hover:underline"
        >
          ← Voltar aos projetos
        </button>
      </div>
    );
  }

  return (
    <div ref={pageRef} className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex gap-6 xl:gap-10 items-start">
        <WikiTableOfContents
          toc={toc}
          activeEtapaId={activeEtapaId}
          onNavigate={scrollToEtapa}
          mobileOpen={mobileTocOpen}
          onCloseMobile={() => setMobileTocOpen(false)}
        />

        <div className="flex-1 min-w-0">
          {/* Cabeçalho — coluna direita, sem sobreposição do índice */}
          <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => navigate(`/projects/${project.id}`)}
                className="text-sm text-white/50 hover:text-white shrink-0"
              >
                ← Projeto
              </button>
              <div className="min-w-0 border-l border-white/15 pl-3">
                <h1 className="text-xl md:text-2xl font-bold text-white">{project.nome}</h1>
                <p className="text-xs text-white/45 mt-0.5">
                  Documentação do projeto · {fmt(project.dataCriacao)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileTocOpen(true)}
                className="lg:hidden px-3 py-1.5 rounded-md text-xs font-semibold border border-white/20 bg-white/5 text-white/70"
              >
                Índice
              </button>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  project.status === 'FINALIZADO'
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                }`}
              >
                {project.status === 'FINALIZADO' ? 'Finalizado' : 'Em andamento'}
              </span>
            </div>
          </header>

          <main className="space-y-8">
          {/* Introdução (colapsável) */}
          <section className="border border-white/15 rounded-xl overflow-hidden bg-slate-800/25">
            <button
              type="button"
              onClick={() => setIntroOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-4 py-3 text-left bg-slate-900/30 hover:bg-slate-900/50"
            >
              <ChevronIcon open={introOpen} />
              <span className="text-sm font-semibold text-white/80">Visão geral do projeto</span>
            </button>
            {introOpen && (
              <div className="px-4 pb-4 pt-2 space-y-4 border-t border-white/10">
                {(project.objetivo || project.resumo) && (
                  <p className="text-sm text-white/75 whitespace-pre-line leading-relaxed">
                    {project.objetivo || project.resumo}
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-[10px] uppercase text-white/35 mb-0.5">Supervisor</p>
                    <p className="text-white/80">{project.supervisor?.nome ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-white/35 mb-0.5">Responsáveis</p>
                    <p className="text-white/80">
                      {project.responsaveis.map((r) => r.usuario.nome).join(', ') || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-white/35 mb-0.5">Setores</p>
                    <p className="text-white/80">
                      {(project.setores ?? []).map((s) => s.nome).join(', ') || '—'}
                    </p>
                  </div>
                </div>
                {progressoPct !== null && (
                  <div>
                    <div className="flex items-center justify-between text-xs text-white/50 mb-1">
                      <span>Progresso das tarefas</span>
                      <span className="tabular-nums font-semibold text-white/70">
                        {progressoGeral.feitas}/{progressoGeral.total} ({progressoPct}%)
                      </span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${progressoPct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Conteúdo por sessão */}
          {sessoesMapeadas.length === 0 ? (
            <p className="text-center py-12 text-white/40 text-sm italic">
              Nenhuma etapa cadastrada.
            </p>
          ) : (
            <div className="space-y-8">
              {(() => {
                let startNum = 0;
                return sessoesMapeadas.map((sessao) => {
                  const start = startNum;
                  startNum += sessao.abas.reduce((n, a) => n + a.etapas.length, 0);
                  return (
                    <WikiSessaoSection
                      key={sessao.id ?? '__sem__'}
                      sessao={sessao}
                      startNumero={start + 1}
                    />
                  );
                });
              })()}
            </div>
          )}

          <footer className="border-t border-white/10 pt-4 text-center text-xs text-white/25">
            Documentação gerada automaticamente · ERP Globaltec
          </footer>
          </main>
        </div>
      </div>
    </div>
  );
}
