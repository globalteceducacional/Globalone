import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from '../DataTable';
import { api } from '../../services/api';
import {
  atualizarTreinamento,
  criarTreinamento,
  ingressarTreinamento,
  listarMatriculasTreinamento,
  listarMinhasMatriculas,
  listarPendentesObrigatorios,
  listarTreinamentos,
  matricularUsuarios,
  removerTreinamento,
  type Treinamento,
  type TreinamentoMatricula,
  type TreinamentoPendenteObrigatorio,
} from '../../services/rh';
import { useAuthStore } from '../../store/auth';
import { userHasPermission } from '../../utils/projectAccess';
import { toast, formatApiError } from '../../utils/toast';
import { FilePreviewTrigger } from '../files/FilePreviewTrigger';
import { Card, Field, Modal, StatusBadge, formatData } from './rhUi';
import { TrilhaTreinamentoEditor } from './TrilhaTreinamentoEditor';
import { TreinamentoPlayerModal } from './TreinamentoPlayerModal';

interface SimpleUser {
  id: number;
  nome: string;
}
interface SimpleCargo {
  id: number;
  nome: string;
}

export function TabTreinamentos() {
  const user = useAuthStore((s) => s.user);
  const podeGerenciar = userHasPermission(user, 'treinamentos:gerenciar');

  const [treinamentos, setTreinamentos] = useState<Treinamento[]>([]);
  const [minhas, setMinhas] = useState<TreinamentoMatricula[]>([]);
  const [pendentes, setPendentes] = useState<TreinamentoPendenteObrigatorio[]>([]);
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Treinamento | null>(null);
  const [matriculando, setMatriculando] = useState<Treinamento | null>(null);
  const [verMatriculas, setVerMatriculas] = useState<{ treinamento: Treinamento; matriculas: TreinamentoMatricula[] } | null>(null);
  const [gerenciarConteudo, setGerenciarConteudo] = useState<Treinamento | null>(null);
  const [assistindo, setAssistindo] = useState<TreinamentoMatricula | null>(null);
  const [abrindoPlayer, setAbrindoPlayer] = useState(false);
  const [usuarios, setUsuarios] = useState<SimpleUser[]>([]);
  const [cargos, setCargos] = useState<SimpleCargo[]>([]);

  const carregar = useCallback(async () => {
    try {
      const m = await listarMinhasMatriculas().catch(() => []);
      const [t, p] = await Promise.all([
        listarTreinamentos().catch(() => []),
        listarPendentesObrigatorios().catch(() => []),
      ]);
      setMinhas(m);
      setTreinamentos(t);
      setPendentes(p);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }, []);

  const abrirPlayer = useCallback(
    async (treinamentoId: number) => {
      setAbrindoPlayer(true);
      try {
        const matricula = await ingressarTreinamento(treinamentoId);
        setAssistindo(matricula);
        setMinhas((prev) => {
          const idx = prev.findIndex((x) => x.treinamentoId === treinamentoId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = matricula;
            return next;
          }
          return [matricula, ...prev];
        });
      } catch (err) {
        toast.error(formatApiError(err));
      } finally {
        setAbrindoPlayer(false);
      }
    },
    [],
  );

  const minhasExibicao = useMemo(() => {
    const byId = new Map<number, TreinamentoMatricula>();
    for (const m of minhas) {
      byId.set(m.treinamentoId, m);
    }
    for (const p of pendentes) {
      if (!byId.has(p.treinamento.id)) {
        const m = p.matricula;
        if (m) {
          byId.set(p.treinamento.id, {
            ...m,
            treinamento: { ...p.treinamento, ...m.treinamento },
          });
        } else {
          const t = treinamentos.find((x) => x.id === p.treinamento.id);
          byId.set(p.treinamento.id, {
            id: 0,
            treinamentoId: p.treinamento.id,
            status: 'PENDENTE',
            dataConclusao: null,
            certificadoUrl: null,
            notaAvaliacao: null,
            dataCriacao: new Date().toISOString(),
            treinamento: {
              id: p.treinamento.id,
              titulo: p.treinamento.titulo,
              cargaHoraria: p.treinamento.cargaHoraria ?? t?.cargaHoraria,
              videoUrl: p.treinamento.videoUrl ?? t?.videoUrl ?? null,
              videoNome: p.treinamento.videoNome ?? t?.videoNome ?? null,
              descricao: p.treinamento.descricao ?? t?.descricao ?? null,
            },
          });
        }
      }
    }
    return Array.from(byId.values()).sort(
      (a, b) =>
        new Date(b.dataCriacao ?? 0).getTime() - new Date(a.dataCriacao ?? 0).getTime(),
    );
  }, [minhas, pendentes, treinamentos]);

  function treinamentoTemConteudo(treinamentoId: number): boolean {
    const t = treinamentos.find((x) => x.id === treinamentoId);
    if ((t?._count?.itens ?? 0) > 0) return true;
    if (t?.videoUrl) return true;
    const p = pendentes.find((x) => x.treinamento.id === treinamentoId);
    if (p?.treinamento.videoUrl) return true;
    const m = minhasExibicao.find((x) => x.treinamentoId === treinamentoId);
    return Boolean(m?.treinamento?.videoUrl);
  }

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!podeGerenciar) return;
    let cancelled = false;
    (async () => {
      try {
        const [u, c] = await Promise.all([
          api.get<SimpleUser[]>('/users/options'),
          api.get<SimpleCargo[]>('/cargos'),
        ]);
        if (cancelled) return;
        setUsuarios(Array.isArray(u.data) ? u.data : []);
        setCargos(Array.isArray(c.data) ? c.data.map((x: any) => ({ id: x.id, nome: x.nome })) : []);
      } catch {
        /* noop */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [podeGerenciar]);

  const colunasTreinamentos = useMemo((): DataTableColumn<Treinamento>[] => {
    const cols: DataTableColumn<Treinamento>[] = [
      { key: 'titulo', label: 'Título', render: (t) => t.titulo },
      { key: 'carga', label: 'Carga', render: (t) => `${t.cargaHoraria}h` },
      {
        key: 'cargos',
        label: 'Cargos obrigatórios',
        render: (t) => (
          <span className="text-xs text-white/70">
            {t.cargosObrigatorios.length === 0
              ? '—'
              : t.cargosObrigatorios.map((c) => c.cargo.nome).join(', ')}
          </span>
        ),
      },
      {
        key: 'mat',
        label: 'Matrículas',
        render: (t) => <span className="text-xs text-white/70">{t._count.matriculas}</span>,
      },
      {
        key: 'conteudo',
        label: 'Conteúdo',
        render: (t) => {
          const n = t._count?.itens ?? 0;
          if (n > 0) return <span className="text-xs text-white/70">{n} etapa(s)</span>;
          if (t.videoUrl) return <span className="text-xs text-white/70">1 vídeo (legado)</span>;
          return <span className="text-xs text-white/50">—</span>;
        },
      },
    ];
    if (podeGerenciar) {
      cols.push({
        key: 'acoes',
        label: 'Ações',
        stopRowClick: true,
        thClassName: 'whitespace-nowrap',
        tdClassName: 'whitespace-nowrap',
        render: (t) => (
          <>
            <button
              type="button"
              onClick={() => setEditando(t)}
              className="text-amber-300 hover:text-amber-200 mr-3"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => setGerenciarConteudo(t)}
              className="text-violet-300 hover:text-violet-200 mr-3"
            >
              Conteúdo
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  const m = await listarMatriculasTreinamento(t.id);
                  setVerMatriculas({ treinamento: t, matriculas: m });
                } catch (err) {
                  toast.error(formatApiError(err));
                }
              }}
              className="text-blue-300 hover:text-blue-200 mr-3"
            >
              Ver matrículas
            </button>
            <button
              type="button"
              onClick={() => setMatriculando(t)}
              className="text-green-300 hover:text-green-200 mr-3"
            >
              Matricular
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await removerTreinamento(t.id);
                  toast.success('Treinamento desativado.');
                  void carregar();
                } catch (err) {
                  toast.error(formatApiError(err));
                }
              }}
              className="text-red-300 hover:text-red-200"
            >
              Desativar
            </button>
          </>
        ),
      });
    }
    return cols;
  }, [podeGerenciar, carregar]);

  const colunasMinhasMatriculas = useMemo((): DataTableColumn<TreinamentoMatricula>[] => {
    return [
      {
        key: 'titulo',
        label: 'Treinamento',
        render: (m) => m.treinamento?.titulo ?? `#${m.treinamentoId}`,
      },
      { key: 'status', label: 'Status', render: (m) => <StatusBadge status={m.status} /> },
      {
        key: 'conclusao',
        label: 'Conclusão',
        render: (m) => (m.status === 'CONCLUIDO' ? formatData(m.dataConclusao) : '—'),
      },
      {
        key: 'cert',
        label: 'Certificado',
        stopRowClick: true,
        render: (m) =>
          m.certificadoUrl ? (
            <FilePreviewTrigger src={m.certificadoUrl} className="text-primary hover:underline">
              Abrir
            </FilePreviewTrigger>
          ) : (
            '—'
          ),
      },
      {
        key: 'acoes',
        label: 'Ações',
        stopRowClick: true,
        thClassName: 'whitespace-nowrap',
        tdClassName: 'whitespace-nowrap',
        render: (m) => (
          <div className="flex flex-wrap gap-2">
            {treinamentoTemConteudo(m.treinamentoId) ? (
              <button
                type="button"
                disabled={abrindoPlayer}
                onClick={() => void abrirPlayer(m.treinamentoId)}
                className="text-violet-300 hover:text-violet-200 disabled:opacity-50"
              >
                {m.status === 'CONCLUIDO' ? 'Rever trilha' : m.status === 'EM_ANDAMENTO' ? 'Continuar' : 'Iniciar'}
              </button>
            ) : null}
          </div>
        ),
      },
    ];
  }, [abrindoPlayer, abrirPlayer, treinamentoTemConteudo]);

  const colunasModalMatriculas = useMemo((): DataTableColumn<TreinamentoMatricula>[] => {
    return [
      {
        key: 'colab',
        label: 'Colaborador',
        render: (m) => m.usuario?.nome ?? `#${m.id}`,
      },
      { key: 'status', label: 'Status', render: (m) => <StatusBadge status={m.status} /> },
      { key: 'conclusao', label: 'Conclusão', render: (m) => formatData(m.dataConclusao) },
    ];
  }, []);

  return (
    <div className="space-y-4">
      {pendentes.length > 0 ? (
        <Card title="Treinamentos obrigatórios pendentes">
          <p className="text-xs text-white/55 mb-3">
            Definidos pelo seu cargo — não é preciso matrícula manual. Acesse e conclua abaixo.
          </p>
          <ul className="text-sm space-y-2">
            {pendentes.map((p) => {
              const matricula =
                minhasExibicao.find((m) => m.treinamentoId === p.treinamento.id) ?? p.matricula;
              const temVideo = treinamentoTemConteudo(p.treinamento.id);
              return (
                <li
                  key={p.treinamento.id}
                  className="flex flex-col gap-2 border-b border-white/10 last:border-0 pb-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <span className="text-white/90">{p.treinamento.titulo}</span>
                    <div className="mt-1">
                      {matricula ? (
                        <StatusBadge status={matricula.status} />
                      ) : (
                        <span className="text-xs text-amber-300/90">Pendente</span>
                      )}
                    </div>
                  </div>
                  {temVideo ? (
                    <button
                      type="button"
                      disabled={abrindoPlayer}
                      onClick={() => void abrirPlayer(p.treinamento.id)}
                      className="px-3 py-1.5 rounded-lg bg-violet-600/80 hover:bg-violet-600 text-white text-sm font-medium shrink-0 disabled:opacity-50"
                    >
                      {abrindoPlayer ? 'Abrindo…' : 'Iniciar treinamento'}
                    </button>
                  ) : (
                    <span className="text-xs text-white/45 shrink-0">Aguardando conteúdo</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {podeGerenciar ? (
      <Card
        title="Treinamentos"
        actions={<button onClick={() => setCriando(true)} className="px-3 py-1.5 rounded bg-primary text-neutral text-sm font-semibold">Novo treinamento</button>}
      >
        <DataTable<Treinamento>
          columns={colunasTreinamentos}
          data={treinamentos}
          keyExtractor={(t) => t.id}
          emptyMessage="Sem treinamentos."
          renderMobileCard={(t) => (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm space-y-2">
              <p className="font-medium text-white/95">{t.titulo}</p>
              <p className="text-white/65 text-xs">
                {t.cargaHoraria}h · {t._count.matriculas} matrículas
              </p>
              <p className="text-white/55 text-xs">
                {t.cargosObrigatorios.length === 0
                  ? 'Sem cargos obrigatórios'
                  : t.cargosObrigatorios.map((c) => c.cargo.nome).join(', ')}
              </p>
              {podeGerenciar ? (
                <div className="flex flex-wrap gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setEditando(t)}
                    className="text-amber-300 hover:text-amber-200 text-sm"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => setGerenciarConteudo(t)}
                    className="text-violet-300 hover:text-violet-200 text-sm"
                  >
                    Conteúdo
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const m = await listarMatriculasTreinamento(t.id);
                        setVerMatriculas({ treinamento: t, matriculas: m });
                      } catch (err) {
                        toast.error(formatApiError(err));
                      }
                    }}
                    className="text-blue-300 hover:text-blue-200 text-sm"
                  >
                    Ver matrículas
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatriculando(t)}
                    className="text-green-300 hover:text-green-200 text-sm"
                  >
                    Matricular
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await removerTreinamento(t.id);
                        toast.success('Treinamento desativado.');
                        void carregar();
                      } catch (err) {
                        toast.error(formatApiError(err));
                      }
                    }}
                    className="text-red-300 hover:text-red-200 text-sm"
                  >
                    Desativar
                  </button>
                </div>
              ) : null}
            </div>
          )}
        />
      </Card>
      ) : null}

      <Card title="Minhas matrículas">
        <p className="text-xs text-white/55 mb-3 -mt-1">
          Siga a trilha na ordem (vídeos e questões). O status passa para{' '}
          <strong className="text-white/75">Em andamento</strong> ao iniciar e{' '}
          <strong className="text-white/75">Concluído</strong> quando todas as etapas forem finalizadas.
        </p>
        <DataTable<TreinamentoMatricula>
          columns={colunasMinhasMatriculas}
          data={minhasExibicao}
          keyExtractor={(m) => m.id || `t-${m.treinamentoId}`}
          emptyMessage="Sem matrículas."
          renderMobileCard={(m) => (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm space-y-2">
              <p className="font-medium text-white/95">{m.treinamento?.titulo ?? `#${m.treinamentoId}`}</p>
              <StatusBadge status={m.status} />
              <p className="text-white/60 text-xs">Conclusão: {formatData(m.dataConclusao)}</p>
              <div className="flex flex-wrap gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                {treinamentoTemConteudo(m.treinamentoId) ? (
                  <button
                    type="button"
                    disabled={abrindoPlayer}
                    onClick={() => void abrirPlayer(m.treinamentoId)}
                    className="text-violet-300 hover:text-violet-200 text-sm disabled:opacity-50"
                  >
                    {m.status === 'CONCLUIDO' ? 'Rever trilha' : m.status === 'EM_ANDAMENTO' ? 'Continuar' : 'Iniciar'}
                  </button>
                ) : null}
                {m.certificadoUrl ? (
                  <FilePreviewTrigger src={m.certificadoUrl} className="text-primary hover:underline text-sm">
                    Certificado
                  </FilePreviewTrigger>
                ) : null}
              </div>
            </div>
          )}
        />
      </Card>

      {criando ? (
        <TreinamentoFormModal
          cargos={cargos}
          onClose={() => setCriando(false)}
          onSaved={() => { setCriando(false); void carregar(); }}
        />
      ) : null}

      {editando ? (
        <TreinamentoFormModal
          treinamento={editando}
          cargos={cargos}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); void carregar(); }}
        />
      ) : null}

      {matriculando ? (
        <MatricularModal
          treinamento={matriculando}
          usuarios={usuarios}
          onClose={() => setMatriculando(null)}
          onSaved={() => { setMatriculando(null); void carregar(); }}
        />
      ) : null}

      {gerenciarConteudo ? (
        <GerenciarConteudoModal
          treinamento={gerenciarConteudo}
          onClose={() => setGerenciarConteudo(null)}
          onSaved={() => {
            void carregar();
          }}
        />
      ) : null}

      {assistindo ? (
        <TreinamentoPlayerModal
          matriculaInicial={assistindo}
          onClose={() => setAssistindo(null)}
          onAtualizado={async (atualizada) => {
            setAssistindo(atualizada);
            const m = await listarMinhasMatriculas().catch(() => []);
            setMinhas(m);
            const p = await listarPendentesObrigatorios().catch(() => []);
            setPendentes(p);
          }}
        />
      ) : null}

      {verMatriculas ? (
        <Modal
          title={`Matrículas — ${verMatriculas.treinamento.titulo}`}
          onClose={() => setVerMatriculas(null)}
          footer={<button onClick={() => setVerMatriculas(null)} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm">Fechar</button>}
        >
          <div className="-m-1">
            <DataTable<TreinamentoMatricula>
              columns={colunasModalMatriculas}
              data={verMatriculas.matriculas}
              keyExtractor={(m) => m.id}
              emptyMessage="Sem matrículas."
              renderMobileCard={(m) => (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm space-y-2">
                  <p className="font-medium text-white/95">{m.usuario?.nome ?? `#${m.id}`}</p>
                  <StatusBadge status={m.status} />
                  <p className="text-white/60 text-xs">Conclusão: {formatData(m.dataConclusao)}</p>
                </div>
              )}
            />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function TreinamentoFormModal({
  treinamento,
  cargos,
  onClose,
  onSaved,
}: {
  treinamento?: Treinamento;
  cargos: SimpleCargo[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = treinamento != null;
  const [titulo, setTitulo] = useState(treinamento?.titulo ?? '');
  const [descricao, setDescricao] = useState(treinamento?.descricao ?? '');
  const [cargaHoraria, setCargaHoraria] = useState(treinamento?.cargaHoraria ?? 0);
  const [cargosIds, setCargosIds] = useState<number[]>(
    () => treinamento?.cargosObrigatorios.map((c) => c.cargoId) ?? [],
  );
  const [salvando, setSalvando] = useState(false);

  function toggleCargo(id: number) {
    setCargosIds((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));
  }

  async function salvar() {
    if (!titulo.trim()) {
      toast.error('Informe o título.');
      return;
    }
    setSalvando(true);
    try {
      const payload = {
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        cargaHoraria,
        cargosObrigatoriosIds: cargosIds,
      };
      if (isEdit && treinamento) {
        await atualizarTreinamento(treinamento.id, payload);
        toast.success('Treinamento atualizado.');
      } else {
        await criarTreinamento(payload);
        toast.success('Treinamento criado.');
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
      title={isEdit ? `Editar — ${treinamento.titulo}` : 'Novo treinamento'}
      size={isEdit ? 'lg' : 'md'}
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
      <Field label="Carga horária (h)"><input type="number" value={cargaHoraria} onChange={(e) => setCargaHoraria(Number(e.target.value) || 0)} className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm" /></Field>
      <Field label="Cargos obrigatórios">
        <p className="text-xs text-white/55 mb-2">
          Colaboradores com estes cargos passam a ver o treinamento automaticamente — não precisam ser matriculados manualmente.
        </p>
        <div className="flex flex-wrap gap-2 max-h-40 overflow-auto rounded border border-white/10 p-2">
          {cargos.map((c) => (
            <label key={c.id} className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={cargosIds.includes(c.id)} onChange={() => toggleCargo(c.id)} />
              {c.nome}
            </label>
          ))}
          {cargos.length === 0 ? <span className="text-white/60 text-sm">Sem cargos disponíveis.</span> : null}
        </div>
      </Field>
      {isEdit && treinamento ? (
        <TrilhaTreinamentoEditor treinamentoId={treinamento.id} onChanged={onSaved} />
      ) : null}
    </Modal>
  );
}

function MatricularModal({ treinamento, usuarios, onClose, onSaved }: { treinamento: Treinamento; usuarios: SimpleUser[]; onClose: () => void; onSaved: () => void }) {
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState(false);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return usuarios;
    return usuarios.filter((u) => u.nome.toLowerCase().includes(q));
  }, [usuarios, busca]);

  function toggle(id: number) {
    setSelecionados((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));
  }

  async function salvar() {
    if (selecionados.length === 0) {
      toast.error('Selecione ao menos um colaborador.');
      return;
    }
    setSalvando(true);
    try {
      await matricularUsuarios(treinamento.id, selecionados);
      toast.success('Matrículas criadas.');
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title={`Matricular em "${treinamento.titulo}"`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-3 py-2 rounded bg-primary text-neutral font-semibold text-sm disabled:opacity-50">
            {salvando ? 'Salvando...' : 'Confirmar'}
          </button>
        </>
      }
    >
      <Field label="Buscar colaborador">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Nome..."
          className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
        />
      </Field>
      <p className="text-xs text-white/55 mb-2">
        {selecionados.length} selecionado(s). Use para quem <strong className="text-white/70">não</strong> está nos cargos
        obrigatórios; quem já tem o cargo entra automaticamente no curso.
      </p>
      <div className="max-h-64 overflow-auto rounded border border-white/10 p-2 space-y-1">
        {filtrados.length === 0 ? <span className="text-white/60 text-sm">Nenhum colaborador encontrado.</span> : null}
        {filtrados.map((u) => (
          <label key={u.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selecionados.includes(u.id)} onChange={() => toggle(u.id)} />
            {u.nome}
          </label>
        ))}
      </div>
    </Modal>
  );
}

function GerenciarConteudoModal({
  treinamento,
  onClose,
  onSaved,
}: {
  treinamento: Treinamento;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Modal
      title={`Conteúdo — ${treinamento.titulo}`}
      size="lg"
      onClose={onClose}
      footer={
        <button onClick={onClose} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm">
          Fechar
        </button>
      }
    >
      <TrilhaTreinamentoEditor treinamentoId={treinamento.id} onChanged={onSaved} />
    </Modal>
  );
}
