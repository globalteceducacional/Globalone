import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from '../DataTable';
import {
  atualizarMeta,
  criarCiclo,
  criarMeta,
  getMinhasAvaliacoes,
  listarCiclos,
  listarMinhasMetas,
  mudarStatusCiclo,
  removerMeta,
  responderAvaliacao,
  type AvaliacaoDesempenho,
  type CicloAvaliacao,
  type MetaIndividual,
} from '../../services/rh';
import { useAuthStore } from '../../store/auth';
import { userHasPermission } from '../../utils/projectAccess';
import { toast, formatApiError } from '../../utils/toast';
import { Card, Field, Modal, StatusBadge, formatData } from './rhUi';

export function TabDesempenho() {
  const user = useAuthStore((s) => s.user);
  const podeGerenciar = userHasPermission(user, 'avaliacoes:gerenciar');

  const [ciclos, setCiclos] = useState<CicloAvaliacao[]>([]);
  const [minhas, setMinhas] = useState<{ aFazer: AvaliacaoDesempenho[]; recebidas: AvaliacaoDesempenho[] } | null>(null);
  const [metas, setMetas] = useState<MetaIndividual[]>([]);
  const [criandoCiclo, setCriandoCiclo] = useState(false);
  const [respondendo, setRespondendo] = useState<AvaliacaoDesempenho | null>(null);
  const [novaMeta, setNovaMeta] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [c, m, mt] = await Promise.all([
        listarCiclos().catch(() => []),
        getMinhasAvaliacoes().catch(() => ({ aFazer: [], recebidas: [] })),
        listarMinhasMetas().catch(() => []),
      ]);
      setCiclos(c);
      setMinhas(m);
      setMetas(mt);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const colunasCiclos = useMemo((): DataTableColumn<CicloAvaliacao>[] => {
    const cols: DataTableColumn<CicloAvaliacao>[] = [
      { key: 'nome', label: 'Nome', render: (c) => c.nome },
      {
        key: 'periodo',
        label: 'Período',
        render: (c) => (
          <>
            {formatData(c.dataInicio)} → {formatData(c.dataFim)}
          </>
        ),
      },
      { key: 'status', label: 'Status', render: (c) => <StatusBadge status={c.status} /> },
      {
        key: 'avaliacoes',
        label: 'Avaliações',
        render: (c) => <span className="text-xs text-white/70">{c._count?.avaliacoes ?? 0}</span>,
      },
    ];
    if (podeGerenciar) {
      cols.push({
        key: 'acoes',
        label: 'Ações',
        stopRowClick: true,
        thClassName: 'whitespace-nowrap',
        tdClassName: 'whitespace-nowrap',
        render: (c) => (
          <>
            {c.status !== 'ABERTO' ? (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await mudarStatusCiclo(c.id, 'ABERTO');
                    toast.success('Ciclo aberto.');
                    void carregar();
                  } catch (err) {
                    toast.error(formatApiError(err));
                  }
                }}
                className="text-green-300 hover:text-green-200 mr-3"
              >
                Abrir
              </button>
            ) : null}
            {c.status !== 'ENCERRADO' ? (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await mudarStatusCiclo(c.id, 'ENCERRADO');
                    toast.success('Ciclo encerrado.');
                    void carregar();
                  } catch (err) {
                    toast.error(formatApiError(err));
                  }
                }}
                className="text-red-300 hover:text-red-200"
              >
                Encerrar
              </button>
            ) : null}
          </>
        ),
      });
    }
    return cols;
  }, [podeGerenciar, carregar]);

  const colunasAvaliacoesAFazer = useMemo((): DataTableColumn<AvaliacaoDesempenho>[] => {
    return [
      {
        key: 'ciclo',
        label: 'Ciclo',
        render: (a) => a.ciclo?.nome ?? `#${a.cicloId}`,
      },
      { key: 'avaliado', label: 'Avaliado', render: (a) => a.avaliado.nome },
      { key: 'status', label: 'Status', render: (a) => <StatusBadge status={a.status} /> },
      {
        key: 'acoes',
        label: 'Ações',
        stopRowClick: true,
        render: (a) => (
          <button
            type="button"
            onClick={() => setRespondendo(a)}
            className="text-blue-300 hover:text-blue-200"
          >
            Responder
          </button>
        ),
      },
    ];
  }, []);

  const colunasAvaliacoesRecebidas = useMemo((): DataTableColumn<AvaliacaoDesempenho>[] => {
    return [
      {
        key: 'ciclo',
        label: 'Ciclo',
        render: (a) => a.ciclo?.nome ?? `#${a.cicloId}`,
      },
      { key: 'avaliador', label: 'Avaliador', render: (a) => a.avaliador.nome },
      { key: 'nota', label: 'Nota', render: (a) => a.notaFinal ?? '—' },
      { key: 'status', label: 'Status', render: (a) => <StatusBadge status={a.status} /> },
    ];
  }, []);

  const colunasMetas = useMemo((): DataTableColumn<MetaIndividual>[] => {
    return [
      { key: 'titulo', label: 'Título', render: (m) => m.titulo },
      { key: 'peso', label: 'Peso', render: (m) => m.peso },
      { key: 'prazo', label: 'Prazo', render: (m) => formatData(m.prazo) },
      { key: 'status', label: 'Status', render: (m) => <StatusBadge status={m.status} /> },
      {
        key: 'acoes',
        label: 'Ações',
        stopRowClick: true,
        thClassName: 'whitespace-nowrap',
        tdClassName: 'whitespace-nowrap',
        render: (m) => (
          <>
            <button
              type="button"
              onClick={async () => {
                const proximo =
                  m.status === 'PENDENTE'
                    ? 'EM_ANDAMENTO'
                    : m.status === 'EM_ANDAMENTO'
                      ? 'CONCLUIDA'
                      : 'PENDENTE';
                try {
                  await atualizarMeta(m.id, { status: proximo });
                  toast.success('Status atualizado.');
                  void carregar();
                } catch (err) {
                  toast.error(formatApiError(err));
                }
              }}
              className="text-blue-300 hover:text-blue-200 mr-3"
            >
              Próximo status
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await removerMeta(m.id);
                  toast.success('Meta removida.');
                  void carregar();
                } catch (err) {
                  toast.error(formatApiError(err));
                }
              }}
              className="text-red-300 hover:text-red-200"
            >
              Remover
            </button>
          </>
        ),
      },
    ];
  }, [carregar]);

  return (
    <div className="space-y-4">
      <Card
        title="Ciclos de avaliação"
        actions={podeGerenciar ? <button onClick={() => setCriandoCiclo(true)} className="px-3 py-1.5 rounded bg-primary text-neutral text-sm font-semibold">Novo ciclo</button> : null}
      >
        <DataTable<CicloAvaliacao>
          columns={colunasCiclos}
          data={ciclos}
          keyExtractor={(c) => c.id}
          emptyMessage="Sem ciclos."
          renderMobileCard={(c) => (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm space-y-2">
              <p className="font-medium text-white/95">{c.nome}</p>
              <p className="text-white/65 text-xs">
                {formatData(c.dataInicio)} → {formatData(c.dataFim)}
              </p>
              <StatusBadge status={c.status} />
              <p className="text-white/50 text-xs">Avaliações: {c._count?.avaliacoes ?? 0}</p>
              {podeGerenciar ? (
                <div className="flex flex-wrap gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                  {c.status !== 'ABERTO' ? (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await mudarStatusCiclo(c.id, 'ABERTO');
                          toast.success('Ciclo aberto.');
                          void carregar();
                        } catch (err) {
                          toast.error(formatApiError(err));
                        }
                      }}
                      className="text-green-300 hover:text-green-200 text-sm"
                    >
                      Abrir
                    </button>
                  ) : null}
                  {c.status !== 'ENCERRADO' ? (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await mudarStatusCiclo(c.id, 'ENCERRADO');
                          toast.success('Ciclo encerrado.');
                          void carregar();
                        } catch (err) {
                          toast.error(formatApiError(err));
                        }
                      }}
                      className="text-red-300 hover:text-red-200 text-sm"
                    >
                      Encerrar
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        />

      </Card>

      <Card title="Minhas avaliações a responder">
        <DataTable<AvaliacaoDesempenho>
          columns={colunasAvaliacoesAFazer}
          data={minhas?.aFazer ?? []}
          keyExtractor={(a) => a.id}
          emptyMessage="Sem pendências."
          onRowClick={(a) => setRespondendo(a)}
          renderMobileCard={(a) => (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm space-y-2">
              <p className="text-white/75 text-xs">{a.ciclo?.nome ?? `#${a.cicloId}`}</p>
              <p className="font-medium text-white/95">{a.avaliado.nome}</p>
              <StatusBadge status={a.status} />
              <p className="text-primary/90 text-xs pt-1">Toque para responder</p>
            </div>
          )}
        />
      </Card>

      <Card title="Minhas avaliações recebidas">
        <DataTable<AvaliacaoDesempenho>
          columns={colunasAvaliacoesRecebidas}
          data={minhas?.recebidas ?? []}
          keyExtractor={(a) => a.id}
          emptyMessage="Nenhuma avaliação ainda."
          renderMobileCard={(a) => (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm space-y-2">
              <p className="text-white/75 text-xs">{a.ciclo?.nome ?? `#${a.cicloId}`}</p>
              <p className="text-white/90">{a.avaliador.nome}</p>
              <p className="text-white/60 text-xs">Nota: {a.notaFinal ?? '—'}</p>
              <StatusBadge status={a.status} />
            </div>
          )}
        />
      </Card>

      <Card
        title="Minhas metas (PDI)"
        actions={<button onClick={() => setNovaMeta(true)} className="px-3 py-1.5 rounded bg-primary text-neutral text-sm font-semibold">Nova meta</button>}
      >
        <DataTable<MetaIndividual>
          columns={colunasMetas}
          data={metas}
          keyExtractor={(m) => m.id}
          emptyMessage="Sem metas."
          renderMobileCard={(m) => (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm space-y-2">
              <p className="font-medium text-white/95">{m.titulo}</p>
              <p className="text-white/60 text-xs">
                Peso {m.peso} · Prazo {formatData(m.prazo)}
              </p>
              <StatusBadge status={m.status} />
              <div className="flex flex-wrap gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={async () => {
                    const proximo =
                      m.status === 'PENDENTE'
                        ? 'EM_ANDAMENTO'
                        : m.status === 'EM_ANDAMENTO'
                          ? 'CONCLUIDA'
                          : 'PENDENTE';
                    try {
                      await atualizarMeta(m.id, { status: proximo });
                      toast.success('Status atualizado.');
                      void carregar();
                    } catch (err) {
                      toast.error(formatApiError(err));
                    }
                  }}
                  className="text-blue-300 hover:text-blue-200 text-sm"
                >
                  Próximo status
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await removerMeta(m.id);
                      toast.success('Meta removida.');
                      void carregar();
                    } catch (err) {
                      toast.error(formatApiError(err));
                    }
                  }}
                  className="text-red-300 hover:text-red-200 text-sm"
                >
                  Remover
                </button>
              </div>
            </div>
          )}
        />
      </Card>

      {criandoCiclo ? (
        <CriarCicloModal onClose={() => setCriandoCiclo(false)} onSaved={() => { setCriandoCiclo(false); void carregar(); }} />
      ) : null}

      {respondendo ? (
        <ResponderAvaliacaoModal avaliacao={respondendo} onClose={() => setRespondendo(null)} onSaved={() => { setRespondendo(null); void carregar(); }} />
      ) : null}

      {novaMeta && user ? (
        <NovaMetaModal usuarioId={user.id} onClose={() => setNovaMeta(false)} onSaved={() => { setNovaMeta(false); void carregar(); }} />
      ) : null}
    </div>
  );
}

function CriarCicloModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!nome.trim() || !dataInicio || !dataFim) {
      toast.error('Preencha nome e datas.');
      return;
    }
    setSalvando(true);
    try {
      await criarCiclo({ nome: nome.trim(), descricao: descricao.trim() || undefined, dataInicio, dataFim });
      toast.success('Ciclo criado.');
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title="Novo ciclo de avaliação"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-3 py-2 rounded bg-primary text-neutral font-semibold text-sm disabled:opacity-50">
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <Field label="Nome"><input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm" /></Field>
      <Field label="Descrição"><textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Início"><input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm" /></Field>
        <Field label="Fim"><input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm" /></Field>
      </div>
    </Modal>
  );
}

function ResponderAvaliacaoModal({ avaliacao, onClose, onSaved }: { avaliacao: AvaliacaoDesempenho; onClose: () => void; onSaved: () => void }) {
  const [comentario, setComentario] = useState('');
  const [nota, setNota] = useState<number>(5);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    try {
      await responderAvaliacao(avaliacao.id, {
        respostasJson: { comentario, nota },
        notaFinal: nota,
        comentario: comentario.trim() || undefined,
      });
      toast.success('Avaliação enviada.');
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title={`Avaliar ${avaliacao.avaliado.nome}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-3 py-2 rounded bg-primary text-neutral font-semibold text-sm disabled:opacity-50">
            {salvando ? 'Enviando...' : 'Enviar'}
          </button>
        </>
      }
    >
      <Field label="Nota (0 a 10)">
        <input type="number" min={0} max={10} step={0.5} value={nota} onChange={(e) => setNota(Number(e.target.value))} className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm" />
      </Field>
      <Field label="Comentário"><textarea rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm" /></Field>
    </Modal>
  );
}

function NovaMetaModal({ usuarioId, onClose, onSaved }: { usuarioId: number; onClose: () => void; onSaved: () => void }) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [peso, setPeso] = useState(1);
  const [prazo, setPrazo] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!titulo.trim()) {
      toast.error('Informe o título da meta.');
      return;
    }
    setSalvando(true);
    try {
      await criarMeta(usuarioId, { titulo: titulo.trim(), descricao: descricao.trim() || undefined, peso, prazo: prazo || undefined });
      toast.success('Meta criada.');
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title="Nova meta / PDI"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-3 py-2 rounded bg-primary text-neutral font-semibold text-sm disabled:opacity-50">
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <Field label="Título"><input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm" /></Field>
      <Field label="Descrição"><textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Peso"><input type="number" min={1} max={10} value={peso} onChange={(e) => setPeso(Number(e.target.value))} className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm" /></Field>
        <Field label="Prazo"><input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm" /></Field>
      </div>
    </Modal>
  );
}
