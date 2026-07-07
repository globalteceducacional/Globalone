import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataTable, type DataTableColumn } from '../DataTable';
import {
  abrirSolicitacao,
  aprovarSolicitacao,
  cancelarSolicitacao,
  listarMinhasSolicitacoes,
  listarSolicitacoes,
  reprovarSolicitacao,
  type SolicitacaoAjuste,
  type SolicitacaoStatus,
} from '../../services/rh';
import { CollapsibleFilters } from '../filters/CollapsibleFilters';
import { useAuthStore } from '../../store/auth';
import { userHasPermission } from '../../utils/projectAccess';
import { toast, formatApiError } from '../../utils/toast';
import { uploadSingleFile } from '../../utils/uploadFile';
import { FilePreviewTrigger } from '../files/FilePreviewTrigger';
import { UPLOAD_LIMITS, validateGenericFileSize } from '../../utils/uploadLimits';

import { Card, Field, Modal, StatusBadge, formatDataHora, inputDateTimeLocal } from './rhUi';

type Visao = 'minhas' | 'fila';

/** Intervalo por data local da criação da solicitação (`dataCriacao`). */
function dataCriacaoNoIntervalo(iso: string, inicioYmd: string, fimYmd: string): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (inicioYmd) {
    const start = new Date(`${inicioYmd}T00:00:00`);
    if (t < start.getTime()) return false;
  }
  if (fimYmd) {
    const end = new Date(`${fimYmd}T23:59:59.999`);
    if (t > end.getTime()) return false;
  }
  return true;
}

/** Intervalo pela data/hora do ajuste solicitado (`dataHora`). */
function dataHoraAjusteNoIntervalo(iso: string, inicioYmd: string, fimYmd: string): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (inicioYmd) {
    const start = new Date(`${inicioYmd}T00:00:00`);
    if (t < start.getTime()) return false;
  }
  if (fimYmd) {
    const end = new Date(`${fimYmd}T23:59:59.999`);
    if (t > end.getTime()) return false;
  }
  return true;
}

export function TabSolicitacoes() {
  const user = useAuthStore((s) => s.user);
  const podeRevisar = userHasPermission(user, 'solicitacoes_ponto:revisar');
  const podeAbrir = userHasPermission(user, 'solicitacoes_ponto:abrir');
  const ultimoUsuarioIdVisao = useRef<number | undefined>(undefined);

  const [visao, setVisao] = useState<Visao>('minhas');
  const [lista, setLista] = useState<SolicitacaoAjuste[]>([]);
  const [loading, setLoading] = useState(false);
  const [criando, setCriando] = useState(false);
  const [decidindo, setDecidindo] = useState<{ id: number; acao: 'aprovar' | 'reprovar' } | null>(null);
  const [detalhe, setDetalhe] = useState<SolicitacaoAjuste | null>(null);

  const [showFilters, setShowFilters] = useState(false);
  const [filterUsuarioId, setFilterUsuarioId] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | SolicitacaoStatus>('all');
  const [filterTipo, setFilterTipo] = useState<'all' | 'ENTRADA' | 'SAIDA'>('all');
  const [filterBuscaMotivo, setFilterBuscaMotivo] = useState('');
  const [filterDataSolicInicio, setFilterDataSolicInicio] = useState('');
  const [filterDataSolicFim, setFilterDataSolicFim] = useState('');
  const [filterDataAjusteInicio, setFilterDataAjusteInicio] = useState('');
  const [filterDataAjusteFim, setFilterDataAjusteFim] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = visao === 'minhas' ? await listarMinhasSolicitacoes() : await listarSolicitacoes();
      setLista(data);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [visao]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * Quem pode aprovar inicia em “Para aprovar” (evita gestor ver só “Minhas” vazias).
   * Ao trocar de usuário na sessão, recalibra a visão.
   */
  useEffect(() => {
    if (!user?.id) return;
    if (ultimoUsuarioIdVisao.current === user.id) return;
    ultimoUsuarioIdVisao.current = user.id;
    setVisao(userHasPermission(user, 'solicitacoes_ponto:revisar') ? 'fila' : 'minhas');
  }, [user]);

  const usuariosFilaOpcoes = useMemo(() => {
    if (visao !== 'fila') return [];
    const map = new Map<number, string>();
    for (const s of lista) {
      map.set(s.usuarioId, s.usuario?.nome ?? `#${s.usuarioId}`);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [lista, visao]);

  const listaFiltrada = useMemo(() => {
    return lista.filter((s) => {
      if (visao === 'fila' && filterUsuarioId) {
        if (s.usuarioId !== Number(filterUsuarioId)) return false;
      }
      if (filterStatus !== 'all' && s.status !== filterStatus) return false;
      if (filterTipo !== 'all' && s.tipo !== filterTipo) return false;
      const q = filterBuscaMotivo.trim().toLowerCase();
      if (q && !s.motivo.toLowerCase().includes(q)) return false;
      if (filterDataSolicInicio || filterDataSolicFim) {
        if (!dataCriacaoNoIntervalo(s.dataCriacao, filterDataSolicInicio, filterDataSolicFim)) return false;
      }
      if (filterDataAjusteInicio || filterDataAjusteFim) {
        if (!dataHoraAjusteNoIntervalo(s.dataHora, filterDataAjusteInicio, filterDataAjusteFim)) return false;
      }
      return true;
    });
  }, [
    lista,
    visao,
    filterUsuarioId,
    filterStatus,
    filterTipo,
    filterBuscaMotivo,
    filterDataSolicInicio,
    filterDataSolicFim,
    filterDataAjusteInicio,
    filterDataAjusteFim,
  ]);

  const hasActiveFilters =
    (visao === 'fila' && filterUsuarioId !== '') ||
    filterStatus !== 'all' ||
    filterTipo !== 'all' ||
    filterBuscaMotivo.trim() !== '' ||
    filterDataSolicInicio !== '' ||
    filterDataSolicFim !== '' ||
    filterDataAjusteInicio !== '' ||
    filterDataAjusteFim !== '';

  function limparFiltros() {
    setFilterUsuarioId('');
    setFilterStatus('all');
    setFilterTipo('all');
    setFilterBuscaMotivo('');
    setFilterDataSolicInicio('');
    setFilterDataSolicFim('');
    setFilterDataAjusteInicio('');
    setFilterDataAjusteFim('');
  }

  const colunasSolicitacoes = useMemo((): DataTableColumn<SolicitacaoAjuste>[] => {
    const cols: DataTableColumn<SolicitacaoAjuste>[] = [
      { key: 'quando', label: 'Quando', render: (s) => formatDataHora(s.dataHora) },
    ];
    if (visao === 'fila') {
      cols.push({
        key: 'usuario',
        label: 'Usuário',
        render: (s) => s.usuario?.nome ?? `#${s.usuarioId}`,
      });
    }
    cols.push(
      {
        key: 'tipo',
        label: 'Tipo',
        render: (s) => (s.tipo === 'ENTRADA' ? 'Entrada' : 'Saída'),
      },
      {
        key: 'motivo',
        label: 'Motivo',
        render: (s) => (
          <span className="max-w-[260px] truncate block" title={s.motivo}>
            {s.motivo}
          </span>
        ),
      },
      {
        key: 'anexo',
        label: 'Anexo',
        render: (s) =>
          s.anexoUrl ? (
            <span onClick={(e) => e.stopPropagation()}>
              <FilePreviewTrigger
                src={s.anexoUrl}
                className="text-primary text-xs hover:underline"
              >
                Ver arquivo
              </FilePreviewTrigger>
            </span>
          ) : (
            <span className="text-white/35 text-xs">—</span>
          ),
      },
      {
        key: 'status',
        label: 'Status',
        render: (s) => <StatusBadge status={s.status} />,
      },
      {
        key: 'decisao',
        label: 'Decisão',
        render: (s) => (
          <span className="text-xs text-white/70">
            {s.dataDecisao ? `${formatDataHora(s.dataDecisao)} — ${s.revisor?.nome ?? ''}` : '—'}
          </span>
        ),
      },
      {
        key: 'acoes',
        label: 'Ações',
        align: 'left',
        stopRowClick: true,
        thClassName: 'whitespace-nowrap',
        tdClassName: 'whitespace-nowrap',
        render: (s) => (
          <>
            {visao === 'minhas' && s.status === 'PENDENTE' ? (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await cancelarSolicitacao(s.id);
                    toast.success('Solicitação cancelada.');
                    void carregar();
                  } catch (err) {
                    toast.error(formatApiError(err));
                  }
                }}
                className="text-red-300 hover:text-red-200"
              >
                Cancelar
              </button>
            ) : null}
            {visao === 'fila' && s.status === 'PENDENTE' ? (
              <>
                <button
                  type="button"
                  onClick={() => setDecidindo({ id: s.id, acao: 'aprovar' })}
                  className="text-green-300 hover:text-green-200 mr-3"
                >
                  Aprovar
                </button>
                <button
                  type="button"
                  onClick={() => setDecidindo({ id: s.id, acao: 'reprovar' })}
                  className="text-red-300 hover:text-red-200"
                >
                  Reprovar
                </button>
              </>
            ) : null}
          </>
        ),
      },
    );
    return cols;
  }, [visao, carregar]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {podeAbrir ? (
            <button
              type="button"
              onClick={() => setVisao('minhas')}
              className={`px-3 py-1.5 rounded text-sm ${visao === 'minhas' ? 'bg-primary text-neutral' : 'bg-white/10 hover:bg-white/20'}`}
            >
              Minhas solicitações
            </button>
          ) : null}
          {podeRevisar ? (
            <button
              type="button"
              onClick={() => setVisao('fila')}
              className={`px-3 py-1.5 rounded text-sm ${visao === 'fila' ? 'bg-primary text-neutral' : 'bg-white/10 hover:bg-white/20'}`}
            >
              Para aprovar
            </button>
          ) : null}
        </div>
        {podeAbrir && visao === 'minhas' ? (
          <button
            type="button"
            onClick={() => setCriando(true)}
            className="px-3 py-1.5 rounded bg-primary text-neutral text-sm font-semibold"
          >
            Nova solicitação
          </button>
        ) : null}
      </div>

      <CollapsibleFilters
        title="Filtros"
        show={showFilters}
        setShow={setShowFilters}
        hasActiveFilters={hasActiveFilters}
        onClear={limparFiltros}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visao === 'fila' ? (
            <div>
              <label className="block text-xs font-medium text-white/70 mb-1">Usuário</label>
              <select
                value={filterUsuarioId}
                onChange={(e) => setFilterUsuarioId(e.target.value)}
                className="w-full bg-neutral border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">Todos</option>
                {usuariosFilaOpcoes.map(([id, nome]) => (
                  <option key={id} value={String(id)} className="bg-neutral text-white">
                    {nome}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <label className="block text-xs font-medium text-white/70 mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | SolicitacaoStatus)}
              className="w-full bg-neutral border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="all" className="bg-neutral text-white">
                Todos
              </option>
              <option value="PENDENTE" className="bg-neutral text-white">
                Pendente
              </option>
              <option value="APROVADO" className="bg-neutral text-white">
                Aprovado
              </option>
              <option value="REPROVADO" className="bg-neutral text-white">
                Reprovado
              </option>
              <option value="CANCELADO" className="bg-neutral text-white">
                Cancelado
              </option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-white/70 mb-1">Tipo de batida</label>
            <select
              value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value as 'all' | 'ENTRADA' | 'SAIDA')}
              className="w-full bg-neutral border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="all" className="bg-neutral text-white">
                Todos
              </option>
              <option value="ENTRADA" className="bg-neutral text-white">
                Entrada
              </option>
              <option value="SAIDA" className="bg-neutral text-white">
                Saída
              </option>
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-medium text-white/70 mb-1">Buscar no motivo</label>
            <input
              type="text"
              value={filterBuscaMotivo}
              onChange={(e) => setFilterBuscaMotivo(e.target.value)}
              placeholder="Palavras do motivo..."
              className="w-full bg-neutral border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/70 mb-1">Data da solicitação (de)</label>
            <input
              type="date"
              value={filterDataSolicInicio}
              onChange={(e) => setFilterDataSolicInicio(e.target.value)}
              className="w-full bg-neutral border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/70 mb-1">Data da solicitação (até)</label>
            <input
              type="date"
              value={filterDataSolicFim}
              min={filterDataSolicInicio || undefined}
              onChange={(e) => setFilterDataSolicFim(e.target.value)}
              className="w-full bg-neutral border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="hidden lg:block" aria-hidden />
          <div>
            <label className="block text-xs font-medium text-white/70 mb-1">Data da marcação ajustada (de)</label>
            <input
              type="date"
              value={filterDataAjusteInicio}
              onChange={(e) => setFilterDataAjusteInicio(e.target.value)}
              className="w-full bg-neutral border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/70 mb-1">Data da marcação ajustada (até)</label>
            <input
              type="date"
              value={filterDataAjusteFim}
              min={filterDataAjusteInicio || undefined}
              onChange={(e) => setFilterDataAjusteFim(e.target.value)}
              className="w-full bg-neutral border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>
        <p className="mt-3 text-xs text-white/50">
          Exibindo {listaFiltrada.length} de {lista.length}{' '}
          {lista.length === 1 ? 'solicitação' : 'solicitações'}
        </p>
      </CollapsibleFilters>

      <Card>
        <div className="-m-4">
          <p className="px-4 pt-3 pb-1 text-xs text-white/45 hidden sm:block">
            Clique na linha para ver detalhes completos.
          </p>
          <DataTable<SolicitacaoAjuste>
            columns={colunasSolicitacoes}
            data={listaFiltrada}
            keyExtractor={(s) => s.id}
            loading={loading}
            emptyMessage={
              lista.length === 0 ? 'Nenhuma solicitação.' : 'Nenhuma solicitação corresponde aos filtros.'
            }
            onRowClick={(s) => setDetalhe(s)}
            rowClassName={() => 'cursor-pointer'}
            renderMobileCard={(s) => (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm space-y-2">
                <p className="text-[11px] text-white/40 sm:hidden">Toque para detalhes</p>
                <p className="text-xs text-white/50">{formatDataHora(s.dataHora)}</p>
                {visao === 'fila' ? (
                  <p className="text-white/85 font-medium">{s.usuario?.nome ?? `#${s.usuarioId}`}</p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <span>{s.tipo === 'ENTRADA' ? 'Entrada' : 'Saída'}</span>
                  <StatusBadge status={s.status} />
                </div>
                <p className="text-white/65 text-xs leading-snug">{s.motivo}</p>
                {s.anexoUrl ? (
                  <span onClick={(e) => e.stopPropagation()}>
                    <FilePreviewTrigger src={s.anexoUrl} className="text-primary text-xs hover:underline">
                      Ver anexo
                    </FilePreviewTrigger>
                  </span>
                ) : null}
                {s.dataDecisao ? (
                  <p className="text-[11px] text-white/45">
                    {formatDataHora(s.dataDecisao)} — {s.revisor?.nome ?? ''}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                  {visao === 'minhas' && s.status === 'PENDENTE' ? (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await cancelarSolicitacao(s.id);
                          toast.success('Solicitação cancelada.');
                          void carregar();
                        } catch (err) {
                          toast.error(formatApiError(err));
                        }
                      }}
                      className="text-red-300 hover:text-red-200 text-sm"
                    >
                      Cancelar
                    </button>
                  ) : null}
                  {visao === 'fila' && s.status === 'PENDENTE' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setDecidindo({ id: s.id, acao: 'aprovar' })}
                        className="text-green-300 hover:text-green-200 text-sm"
                      >
                        Aprovar
                      </button>
                      <button
                        type="button"
                        onClick={() => setDecidindo({ id: s.id, acao: 'reprovar' })}
                        className="text-red-300 hover:text-red-200 text-sm"
                      >
                        Reprovar
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            )}
          />
        </div>
      </Card>

      {criando ? (
        <NovaSolicitacaoModal
          onClose={() => setCriando(false)}
          onSaved={() => {
            setCriando(false);
            void carregar();
          }}
        />
      ) : null}

      {detalhe ? (
        <SolicitacaoDetalheModal
          s={detalhe}
          mostrarColaborador={visao === 'fila'}
          onClose={() => setDetalhe(null)}
        />
      ) : null}

      {decidindo ? (
        <DecidirModal
          id={decidindo.id}
          acao={decidindo.acao}
          onClose={() => setDecidindo(null)}
          onSaved={() => {
            setDecidindo(null);
            void carregar();
          }}
        />
      ) : null}
    </div>
  );
}

type ModoBatidaForm = 'ENTRADA' | 'SAIDA' | 'ENTRADA_E_SAIDA';

function SolicitacaoDetalheModal({
  s,
  mostrarColaborador,
  onClose,
}: {
  s: SolicitacaoAjuste;
  mostrarColaborador: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      title={`Solicitação #${s.id}`}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-2 rounded bg-primary text-neutral font-semibold text-sm"
        >
          Fechar
        </button>
      }
    >
      <dl className="space-y-3 text-sm">
        {mostrarColaborador ? (
          <>
            <div>
              <dt className="text-xs text-white/50">Colaborador</dt>
              <dd className="text-white/90 font-medium mt-0.5">
                {s.usuario?.nome ?? `#${s.usuarioId}`}
                {s.usuario?.email ? (
                  <span className="block text-xs font-normal text-white/55 mt-0.5">{s.usuario.email}</span>
                ) : null}
              </dd>
            </div>
          </>
        ) : null}
        <div>
          <dt className="text-xs text-white/50">Tipo</dt>
          <dd className="text-white/90 mt-0.5">{s.tipo === 'ENTRADA' ? 'Entrada' : 'Saída'}</dd>
        </div>
        <div>
          <dt className="text-xs text-white/50">Data/hora do ajuste</dt>
          <dd className="text-white/90 mt-0.5">{formatDataHora(s.dataHora)}</dd>
        </div>
        <div>
          <dt className="text-xs text-white/50">Enviada em</dt>
          <dd className="text-white/90 mt-0.5">{formatDataHora(s.dataCriacao)}</dd>
        </div>
        <div>
          <dt className="text-xs text-white/50">Status</dt>
          <dd className="mt-1">
            <StatusBadge status={s.status} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-white/50">Motivo</dt>
          <dd className="text-white/85 mt-0.5 whitespace-pre-wrap leading-relaxed">{s.motivo}</dd>
        </div>
        <div>
          <dt className="text-xs text-white/50">Anexo</dt>
          <dd className="mt-0.5">
            {s.anexoUrl ? (
              <FilePreviewTrigger src={s.anexoUrl} className="text-primary text-sm hover:underline">
                Abrir arquivo
              </FilePreviewTrigger>
            ) : (
              <span className="text-white/45">Nenhum</span>
            )}
          </dd>
        </div>
        {s.dataDecisao ? (
          <div>
            <dt className="text-xs text-white/50">Decisão</dt>
            <dd className="text-white/85 mt-0.5">
              {formatDataHora(s.dataDecisao)}
              {s.revisor?.nome ? ` — ${s.revisor.nome}` : ''}
            </dd>
          </div>
        ) : null}
        {s.comentarioRevisor ? (
          <div>
            <dt className="text-xs text-white/50">Comentário do revisor</dt>
            <dd className="text-white/80 mt-0.5 whitespace-pre-wrap leading-relaxed">{s.comentarioRevisor}</dd>
          </div>
        ) : null}
      </dl>
    </Modal>
  );
}

function NovaSolicitacaoModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [modo, setModo] = useState<ModoBatidaForm>('ENTRADA');
  const [dataHoraUnica, setDataHoraUnica] = useState<string>(inputDateTimeLocal());
  const [dataHoraEntrada, setDataHoraEntrada] = useState<string>(inputDateTimeLocal());
  const [dataHoraSaida, setDataHoraSaida] = useState<string>(inputDateTimeLocal());
  const [motivo, setMotivo] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (motivo.trim().length < 5) {
      toast.error('Informe um motivo com pelo menos 5 caracteres.');
      return;
    }
    setSalvando(true);
    try {
      let anexoUrl: string | undefined;
      if (arquivo) {
        const url = await uploadSingleFile(arquivo);
        if (!url) {
          toast.error('Não foi possível enviar o arquivo.');
          return;
        }
        anexoUrl = url;
      }

      if (modo === 'ENTRADA_E_SAIDA') {
        const tEnt = new Date(dataHoraEntrada).getTime();
        const tSai = new Date(dataHoraSaida).getTime();
        if (Number.isNaN(tEnt) || Number.isNaN(tSai)) {
          toast.error('Datas de entrada e saída inválidas.');
          return;
        }
        if (tSai <= tEnt) {
          toast.error('A saída deve ser posterior à entrada.');
          return;
        }
        await abrirSolicitacao({
          tipo: 'ENTRADA',
          dataHora: new Date(dataHoraEntrada).toISOString(),
          motivo: motivo.trim(),
          anexoUrl,
        });
        await abrirSolicitacao({
          tipo: 'SAIDA',
          dataHora: new Date(dataHoraSaida).toISOString(),
          motivo: motivo.trim(),
          anexoUrl,
        });
        toast.success('Duas solicitações enviadas (entrada e saída).');
      } else {
        await abrirSolicitacao({
          tipo: modo,
          dataHora: new Date(dataHoraUnica).toISOString(),
          motivo: motivo.trim(),
          anexoUrl,
        });
        toast.success('Solicitação enviada para o RH.');
      }
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title="Nova solicitação de ajuste"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={salvando}
            className="px-3 py-2 rounded bg-primary text-neutral font-semibold text-sm disabled:opacity-50"
          >
            {salvando ? 'Enviando…' : 'Enviar'}
          </button>
        </>
      }
    >
      <Field label="Tipo de ajuste">
        <select
          value={modo}
          onChange={(e) => setModo(e.target.value as ModoBatidaForm)}
          className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
        >
          <option value="ENTRADA">Somente entrada</option>
          <option value="SAIDA">Somente saída</option>
          <option value="ENTRADA_E_SAIDA">Entrada e saída (duas marcações)</option>
        </select>
      </Field>
      {modo === 'ENTRADA_E_SAIDA' ? (
        <>
          <Field label="Data/Hora da entrada">
            <input
              type="datetime-local"
              value={dataHoraEntrada}
              onChange={(e) => setDataHoraEntrada(e.target.value)}
              className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
            />
          </Field>
          <Field label="Data/Hora da saída">
            <input
              type="datetime-local"
              value={dataHoraSaida}
              onChange={(e) => setDataHoraSaida(e.target.value)}
              className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
            />
          </Field>
          <p className="text-xs text-white/50 -mt-1">
            Serão criadas duas solicitações vinculadas (entrada e saída), com o mesmo motivo e anexo.
          </p>
        </>
      ) : (
        <Field label="Data/Hora">
          <input
            type="datetime-local"
            value={dataHoraUnica}
            onChange={(e) => setDataHoraUnica(e.target.value)}
            className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
          />
        </Field>
      )}
      <Field label="Anexo (opcional)">
        <input
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            if (f) {
              const erro = validateGenericFileSize(f);
              if (erro) {
                toast.error(erro);
                e.target.value = '';
                return;
              }
            }
            setArquivo(f);
          }}
          className="w-full text-sm text-white/80 file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-sm"
        />
        {arquivo ? <p className="text-xs text-white/55 mt-1">{arquivo.name}</p> : null}
        <p className="text-xs text-white/45 mt-1">
          PDF ou imagem (png, jpg, gif, webp), até {UPLOAD_LIMITS.generic.maxMb} MB.
        </p>
      </Field>
      <Field label="Motivo">
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
          placeholder="Descreva o motivo do ajuste..."
        />
      </Field>
    </Modal>
  );
}

function DecidirModal({
  id,
  acao,
  onClose,
  onSaved,
}: {
  id: number;
  acao: 'aprovar' | 'reprovar';
  onClose: () => void;
  onSaved: () => void;
}) {
  const [comentario, setComentario] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function decidir() {
    setSalvando(true);
    try {
      if (acao === 'aprovar') await aprovarSolicitacao(id, comentario.trim() || undefined);
      else await reprovarSolicitacao(id, comentario.trim() || undefined);
      toast.success(acao === 'aprovar' ? 'Solicitação aprovada.' : 'Solicitação reprovada.');
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title={acao === 'aprovar' ? 'Aprovar solicitação' : 'Reprovar solicitação'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm">
            Cancelar
          </button>
          <button
            onClick={decidir}
            disabled={salvando}
            className={`px-3 py-2 rounded font-semibold text-sm disabled:opacity-50 ${
              acao === 'aprovar' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
            }`}
          >
            {salvando ? 'Processando...' : acao === 'aprovar' ? 'Confirmar aprovação' : 'Confirmar reprovação'}
          </button>
        </>
      }
    >
      <Field label="Comentário (opcional)">
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          rows={3}
          className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
        />
      </Field>
    </Modal>
  );
}
