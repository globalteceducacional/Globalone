import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/auth';
import type { ChecklistItem, ChecklistItemEntrega } from '../../types';
import { btn } from '../../utils/buttonStyles';
import { toast } from '../../utils/toast';
import {
  userCanReviewDeliveriesInEtapaContext,
  userMayReviewDeliveryAsNonExecutor,
} from '../../utils/projectAccess';
import {
  getChecklistItemStatusColor,
  getChecklistItemStatusLabel,
  getEntregaStatusColor,
  getEntregaStatusLabel,
} from '../../utils/statusStyles';
import { AppSelect } from '../ui/AppSelect';
import { AttachmentList } from '../files/AttachmentList';
import { LinkifiedText } from '../common/LinkifiedText';
import { ReviewerCommentBox } from './ReviewerCommentBox';

export type ReviewEntregaPopupTarget =
  | {
      mode: 'checklist';
      projetoId: number;
      etapaId: number;
      checklistIndex: number;
      subitemIndex: number | null;
    }
  | { mode: 'etapa_entrega'; projetoId: number; etapaId: number; entregaId: number };

interface EtapaApi {
  id: number;
  nome: string;
  ordem?: number;
  responsavelId?: number | null;
  responsavel?: { id: number; nome?: string } | null;
  executor: { id: number; nome: string };
  integrantes?: Array<{ usuario: { id: number; nome?: string } }>;
  checklistJson?: ChecklistItem[] | null;
  checklistEntregas?: ChecklistItemEntrega[];
  entregas?: Array<{
    id: number;
    descricao: string;
    imagemUrl?: string | null;
    status: string;
    dataEnvio: string;
    comentario?: string | null;
    executorId?: number;
    executor?: { id: number; nome: string };
    avaliadoPor?: { nome: string } | null;
    foiEditada?: boolean;
    editadoPor?: { nome: string } | null;
    dataEdicao?: string | null;
  }>;
}

interface ProjectApi {
  nome: string;
  supervisor?: { id?: number } | null;
  responsaveis?: Array<{ usuario: { id: number; nome?: string } }>;
  etapas: EtapaApi[];
}

/** Prioriza entrega EM_ANALISE mais recente na unidade (alinha a ProjectDetails). */
function pickChecklistEntregaForUnit(
  etapa: EtapaApi,
  checklistIndex: number,
  subitemIndex: number | null,
): ChecklistItemEntrega | undefined {
  const entregas = etapa.checklistEntregas;
  if (!Array.isArray(entregas)) return undefined;
  const matches = entregas.filter((e) => {
    if (Number(e.checklistIndex) !== checklistIndex) return false;
    if (subitemIndex == null) return e.subitemIndex == null;
    return e.subitemIndex != null && Number(e.subitemIndex) === subitemIndex;
  });
  if (matches.length === 0) return undefined;
  const byDateDesc = (a: ChecklistItemEntrega, b: ChecklistItemEntrega) =>
    new Date(b.dataEnvio).getTime() - new Date(a.dataEnvio).getTime();
  const emAnalise = matches
    .filter((e) => String(e.status || '').toUpperCase() === 'EM_ANALISE')
    .sort(byDateDesc);
  return emAnalise[0] ?? [...matches].sort(byDateDesc)[0];
}

function etapaNumeroGlobal(etapas: EtapaApi[], etapaId: number): number {
  const sorted = [...etapas].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const i = sorted.findIndex((e) => e.id === etapaId);
  return i >= 0 ? i + 1 : 1;
}

type Props = {
  open: boolean;
  target: ReviewEntregaPopupTarget | null;
  onClose: () => void;
  /** Chamado após aprovar/recusar/salvar avaliação com sucesso */
  onReviewed?: () => void;
};

export function ReviewEntregaPopup({ open, target, onClose, onReviewed }: Props) {
  const user = useAuthStore((s) => s.user);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const [loadMessage, setLoadMessage] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectApi | null>(null);

  /** Checklist já resolvido */
  const [ctxChecklist, setCtxChecklist] = useState<{
    etapa: EtapaApi;
    index: number;
    entrega: ChecklistItemEntrega;
    etapaNumero: number;
  } | null>(null);

  /** Entrega geral da etapa */
  const [ctxEtapa, setCtxEtapa] = useState<{
    etapa: EtapaApi;
    entrega: NonNullable<EtapaApi['entregas']>[number];
  } | null>(null);

  const [modalReviewComment, setModalReviewComment] = useState('');
  const [viewEntregaStatusDraft, setViewEntregaStatusDraft] = useState<'APROVADO' | 'REPROVADO'>('APROVADO');
  const [modalReviewLoading, setModalReviewLoading] = useState(false);
  const [etapaReviewNotes, setEtapaReviewNotes] = useState('');
  const [etapaReviewLoading, setEtapaReviewLoading] = useState(false);

  const resetState = useCallback(() => {
    setLoadState('idle');
    setLoadMessage(null);
    setProject(null);
    setCtxChecklist(null);
    setCtxEtapa(null);
    setModalReviewComment('');
    setViewEntregaStatusDraft('APROVADO');
    setModalReviewLoading(false);
    setEtapaReviewNotes('');
    setEtapaReviewLoading(false);
  }, []);

  const canUserReviewDeliveries = useCallback(
    (p: ProjectApi, etapa?: EtapaApi) =>
      userCanReviewDeliveriesInEtapaContext(user, etapa ?? {}, {
        supervisor: p.supervisor,
        responsaveis: p.responsaveis?.map((r) => ({ usuario: { id: r.usuario.id } })),
      }),
    [user],
  );

  const mayReviewExecutor = useCallback(
    (executorId: number | null | undefined) => userMayReviewDeliveryAsNonExecutor(user, executorId),
    [user],
  );

  useEffect(() => {
    if (!open || !target) {
      resetState();
      return;
    }

    const cap = target;

    let cancelled = false;
    async function load() {
      setLoadState('loading');
      setLoadMessage(null);
      setCtxChecklist(null);
      setCtxEtapa(null);

      try {
        const { data } = await api.get<ProjectApi>(`/projects/${cap.projetoId}`);
        if (cancelled) return;

        const etapas = Array.isArray(data.etapas) ? data.etapas : [];
        const etapa = etapas.find((e) => e.id === cap.etapaId);
        if (!etapa) {
          setLoadState('error');
          setLoadMessage('Etapa não encontrada neste projeto.');
          return;
        }

        setProject(data);

        if (cap.mode === 'checklist') {
          const entrega = pickChecklistEntregaForUnit(etapa, cap.checklistIndex, cap.subitemIndex);
          if (!entrega || String(entrega.status).toUpperCase() !== 'EM_ANALISE') {
            setLoadState('error');
            setLoadMessage('Não há entrega «em análise» nesta tarefa. Atualize a lista.');
            return;
          }
          setCtxChecklist({
            etapa,
            index: cap.checklistIndex,
            entrega,
            etapaNumero: etapaNumeroGlobal(etapas, etapa.id),
          });
          const st = entrega.status;
          setViewEntregaStatusDraft(st === 'REPROVADO' ? 'REPROVADO' : 'APROVADO');
          setModalReviewComment(entrega.comentario ?? '');
        } else {
          const entrega = etapa.entregas?.find((en) => en.id === cap.entregaId);
          if (!entrega || String(entrega.status).toUpperCase() !== 'EM_ANALISE') {
            setLoadState('error');
            setLoadMessage('Não há esta entrega «em análise». Atualize a lista.');
            return;
          }
          setCtxEtapa({ etapa, entrega });
          setEtapaReviewNotes('');
        }

        setLoadState('ready');
      } catch (err: any) {
        if (cancelled) return;
        setLoadState('error');
        setLoadMessage(err.response?.data?.message ?? 'Não foi possível carregar o projeto.');
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [open, target, resetState]);

  const checklistSubQuery = useMemo(() => {
    if (!ctxChecklist) return {};
    const sub = ctxChecklist.entrega.subitemIndex;
    return sub != null ? { params: { subitemIndex: Number(sub) } } : {};
  }, [ctxChecklist]);

  if (!open || !target) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-lg min-w-0 overflow-y-auto overflow-x-hidden rounded-xl border border-white/20 bg-neutral shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/20 px-6 py-4 min-w-0">
          <div className="min-w-0 flex-1 pr-2">
            <h2 className="text-xl font-semibold text-white">
              {target.mode === 'checklist' ? 'Detalhes da Entrega' : 'Entrega da etapa'}
            </h2>
            {loadState === 'ready' && project && (
              <p className="mt-1 break-words text-sm text-white/60 [overflow-wrap:anywhere]">
                {project.nome}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-2xl text-white/50 transition-colors hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 p-6 min-w-0 overflow-x-hidden">
          {loadState === 'loading' && (
            <p className="py-12 text-center text-white/65">Carregando entrega…</p>
          )}

          {loadState === 'error' && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-danger">
              {loadMessage ?? 'Erro ao carregar.'}
            </div>
          )}

          {loadState === 'ready' && project && ctxChecklist && (
            <>
              {(() => {
                const selectedViewEntrega = ctxChecklist;
                const checklistItem =
                  selectedViewEntrega.etapa.checklistJson?.[selectedViewEntrega.index];
                const subIdx = selectedViewEntrega.entrega.subitemIndex;
                const isSubitem = subIdx != null && Number(subIdx) >= 0;
                const subitemLabel =
                  isSubitem && checklistItem?.subitens?.[Number(subIdx)]
                    ? `${selectedViewEntrega.etapaNumero}.${selectedViewEntrega.index + 1}.${Number(subIdx) + 1}. ${checklistItem.subitens[Number(subIdx)].texto}`
                    : null;
                const mainLabel = checklistItem
                  ? `${selectedViewEntrega.etapaNumero}.${selectedViewEntrega.index + 1}. ${checklistItem.texto}`
                  : `Tarefa #${selectedViewEntrega.index + 1}`;
                return (
                  <div className="min-w-0">
                    <p className="break-words text-sm text-white/75 [overflow-wrap:anywhere]">
                      {selectedViewEntrega.etapa.nome} • {subitemLabel ?? mainLabel}
                    </p>
                    {subitemLabel && checklistItem?.texto && (
                      <p className="mt-1 break-words text-xs text-white/45 [overflow-wrap:anywhere]">
                        Subtarefa de: {checklistItem.texto}
                      </p>
                    )}
                  </div>
                );
              })()}

              <div className="min-w-0">
                <label className="mb-2 block text-sm font-medium text-white/90">Descrição</label>
                <div className="min-h-[100px] w-full max-w-full min-w-0 rounded-md border border-white/30 bg-white/10 px-4 py-3 whitespace-pre-wrap break-words text-white [overflow-wrap:anywhere]">
                  {ctxChecklist.entrega.descricao || 'Não informada'}
                </div>
              </div>

              {(() => {
                const imagens =
                  ctxChecklist.entrega.imagensUrls &&
                  Array.isArray(ctxChecklist.entrega.imagensUrls) &&
                  ctxChecklist.entrega.imagensUrls.length > 0
                    ? ctxChecklist.entrega.imagensUrls
                    : ctxChecklist.entrega.imagemUrl
                      ? [ctxChecklist.entrega.imagemUrl]
                      : [];
                const documentos =
                  ctxChecklist.entrega.documentosUrls &&
                  Array.isArray(ctxChecklist.entrega.documentosUrls) &&
                  ctxChecklist.entrega.documentosUrls.length > 0
                    ? ctxChecklist.entrega.documentosUrls
                    : ctxChecklist.entrega.documentoUrl
                      ? [ctxChecklist.entrega.documentoUrl]
                      : [];
                const arquivos = [...imagens, ...documentos];
                if (arquivos.length === 0) return null;
                return (
                  <AttachmentList
                    raw={arquivos}
                    title={`Arquivos da entrega (${arquivos.length})`}
                    variant="grid"
                  />
                );
              })()}

              <div className="grid grid-cols-2 gap-4 border-t border-white/20 pt-4">
                <div>
                  <label className="mb-1 block text-xs text-white/60">Enviado por</label>
                  <p className="text-sm text-white/90">
                    {ctxChecklist.entrega.executor?.nome ?? 'Usuário'}
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-white/60">Data de envio</label>
                  <p className="text-sm text-white/90">
                    {new Date(ctxChecklist.entrega.dataEnvio).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-white/60">Situação atual</label>
                  <span
                    className={`inline-block rounded-md px-3 py-1.5 text-xs font-semibold ${getChecklistItemStatusColor(
                      ctxChecklist.entrega.status || 'PENDENTE',
                    )}`}
                  >
                    {getChecklistItemStatusLabel(ctxChecklist.entrega.status || 'PENDENTE')}
                  </span>
                </div>
                {ctxChecklist.entrega.avaliadoPor && (
                  <div>
                    <label className="mb-1 block text-xs text-white/60">Avaliado por</label>
                    <p className="text-sm text-white/90">{ctxChecklist.entrega.avaliadoPor.nome}</p>
                  </div>
                )}
              </div>

              {ctxChecklist.entrega.comentario && (
                <ReviewerCommentBox
                  text={ctxChecklist.entrega.comentario}
                  label="Comentário da avaliação"
                  variant="warning"
                />
              )}

              {(() => {
                const statusEntrega = (ctxChecklist.entrega.status as string) || 'PENDENTE';
                const podeAlterarDecisao =
                  (statusEntrega === 'EM_ANALISE' ||
                    statusEntrega === 'APROVADO' ||
                    statusEntrega === 'REPROVADO') &&
                  canUserReviewDeliveries(project, ctxChecklist.etapa) &&
                  mayReviewExecutor(
                    ctxChecklist.entrega.executorId ?? ctxChecklist.entrega.executor?.id,
                  );
                if (!podeAlterarDecisao) return null;
                return (
                  <div className="space-y-3 border-t border-white/20 pt-4">
                    <p className="text-xs text-amber-200/90">
                      Aprovar ou reprovar esta entrega. Pontos e progresso são ajustados no servidor.
                    </p>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-white/90">Decisão</label>
                      <AppSelect
                        value={viewEntregaStatusDraft}
                        onChange={(v) => setViewEntregaStatusDraft(v as 'APROVADO' | 'REPROVADO')}
                        options={[
                          { value: 'APROVADO', label: 'Aprovado' },
                          { value: 'REPROVADO', label: 'Reprovado' },
                        ]}
                        selectClassName="w-full"
                      />
                    </div>
                    <label className="block text-sm font-medium text-white/90">Comentário (opcional)</label>
                    <textarea
                      value={modalReviewComment}
                      onChange={(e) => setModalReviewComment(e.target.value)}
                      rows={4}
                      maxLength={4000}
                      placeholder="Comentário da avaliação"
                      disabled={modalReviewLoading}
                      className="w-full min-h-[5rem] resize-y rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 focus:ring-1 focus:ring-primary focus:outline-none disabled:opacity-50"
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={modalReviewLoading}
                        onClick={async () => {
                          setModalReviewLoading(true);
                          try {
                            await api.patch(
                              `/tasks/${ctxChecklist.etapa.id}/checklist/${ctxChecklist.index}/review`,
                              {
                                status: viewEntregaStatusDraft,
                                comentario: modalReviewComment.trim() || undefined,
                              },
                              checklistSubQuery,
                            );
                            toast.success('Avaliação registrada.');
                            onReviewed?.();
                          } catch (err: any) {
                            toast.error(err.response?.data?.message ?? 'Falha ao salvar a avaliação.');
                          } finally {
                            setModalReviewLoading(false);
                          }
                        }}
                        className={btn.primary}
                      >
                        {modalReviewLoading ? 'Salvando…' : 'Salvar avaliação'}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {loadState === 'ready' && project && ctxEtapa && (
            <>
              <p className="break-words text-sm text-white/75 [overflow-wrap:anywhere]">{ctxEtapa.etapa.nome}</p>

              <div className="flex flex-wrap items-start justify-between gap-3 border-t border-white/10 pt-3">
                <div>
                  <span className="block text-xs text-white/60">Situação</span>
                  <span
                    className={`mt-1 inline-block rounded px-2 py-1 text-xs ${getEntregaStatusColor(ctxEtapa.entrega.status)}`}
                  >
                    {getEntregaStatusLabel(ctxEtapa.entrega.status)}
                  </span>
                </div>
                <div className="text-right text-sm text-white/80">
                  {new Date(ctxEtapa.entrega.dataEnvio).toLocaleString('pt-BR')}
                </div>
              </div>
              {ctxEtapa.entrega.executor && (
                <p className="text-xs text-white/60">Enviado por {ctxEtapa.entrega.executor.nome}</p>
              )}
              <LinkifiedText
                text={ctxEtapa.entrega.descricao}
                className="whitespace-pre-wrap text-sm text-white/85"
              />
              {ctxEtapa.entrega.imagemUrl && (
                <AttachmentList raw={[ctxEtapa.entrega.imagemUrl]} title="Arquivo da entrega" variant="grid" />
              )}
              {ctxEtapa.entrega.comentario && (
                <ReviewerCommentBox text={ctxEtapa.entrega.comentario} variant="inline" />
              )}

              {String(ctxEtapa.entrega.status).toUpperCase() === 'EM_ANALISE' &&
                canUserReviewDeliveries(project, ctxEtapa.etapa) &&
                mayReviewExecutor(ctxEtapa.entrega.executorId ?? ctxEtapa.entrega.executor?.id) && (
                  <div className="space-y-3 border-t border-white/20 pt-4">
                    <label className="block text-sm font-medium text-white/80">Comentário (opcional)</label>
                    <textarea
                      value={etapaReviewNotes}
                      onChange={(e) => setEtapaReviewNotes(e.target.value)}
                      rows={3}
                      placeholder="Observação na aprovação ou motivo da recusa"
                      disabled={etapaReviewLoading}
                      className="w-full rounded-md border border-white/30 bg-white/10 px-3 py-2 text-white placeholder:text-white/50 focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        disabled={etapaReviewLoading}
                        onClick={async () => {
                          setEtapaReviewLoading(true);
                          try {
                            await api.post(`/tasks/${ctxEtapa.etapa.id}/reject`, {
                              reason: etapaReviewNotes.trim() || undefined,
                            });
                            toast.success('Entrega recusada.');
                            onReviewed?.();
                          } catch (err: any) {
                            toast.error(err.response?.data?.message ?? 'Falha ao recusar.');
                          } finally {
                            setEtapaReviewLoading(false);
                          }
                        }}
                        className={btn.danger}
                      >
                        {etapaReviewLoading ? '…' : 'Recusar'}
                      </button>
                      <button
                        type="button"
                        disabled={etapaReviewLoading}
                        onClick={async () => {
                          setEtapaReviewLoading(true);
                          try {
                            await api.post(`/tasks/${ctxEtapa.etapa.id}/approve`, {
                              comentario: etapaReviewNotes.trim() || undefined,
                            });
                            toast.success('Entrega aprovada.');
                            onReviewed?.();
                          } catch (err: any) {
                            toast.error(err.response?.data?.message ?? 'Falha ao aprovar.');
                          } finally {
                            setEtapaReviewLoading(false);
                          }
                        }}
                        className={btn.success}
                      >
                        {etapaReviewLoading ? '…' : 'Aprovar'}
                      </button>
                    </div>
                  </div>
                )}
            </>
          )}

          {(loadState === 'error' || loadState === 'ready') && (
            <div className="flex justify-end border-t border-white/20 pt-4">
              <button type="button" onClick={onClose} className={btn.secondary}>
                Fechar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
