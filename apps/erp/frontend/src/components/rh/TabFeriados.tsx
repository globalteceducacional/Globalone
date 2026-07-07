import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  atualizarFeriado,
  criarFeriado,
  listarFeriados,
  removerFeriado,
  type Feriado,
} from '../../services/rh';
import { toast, formatApiError } from '../../utils/toast';
import { btn } from '../../utils/buttonStyles';
import { formatDateOnlyPtBr, toDateInputValue } from '../../utils/dateInputValue';
import { DataTable, type DataTableColumn } from '../DataTable';
import { Card, Field, Modal } from './rhUi';

function rotuloPeriodo(f: Feriado): string {
  const ini = formatDateOnlyPtBr(f.dataInicio);
  const fim = formatDateOnlyPtBr(f.dataFim);
  if (f.dataInicio === f.dataFim || ini === fim) return ini;
  return `${ini} — ${fim}`;
}

export function TabFeriados() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [lista, setLista] = useState<Feriado[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<Feriado | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      setLista(await listarFeriados(ano));
    } catch (err) {
      toast.error(formatApiError(err));
      setLista([]);
    } finally {
      setLoading(false);
    }
  }, [ano]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const colunas = useMemo((): DataTableColumn<Feriado>[] => {
    return [
      {
        key: 'nome',
        label: 'Nome',
        render: (f) => (
          <div>
            <p className="font-medium text-white/90">{f.nome}</p>
            {f.descricao ? <p className="text-xs text-white/50 line-clamp-1">{f.descricao}</p> : null}
          </div>
        ),
      },
      {
        key: 'periodo',
        label: 'Período',
        render: (f) => (
          <span className="text-sm text-white/80 tabular-nums">{rotuloPeriodo(f)}</span>
        ),
      },
      {
        key: 'recorrente',
        label: 'Recorrência',
        render: (f) =>
          f.recorrenteAnual ? (
            <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-200">Anual</span>
          ) : (
            <span className="text-xs text-white/45">Único</span>
          ),
      },
      {
        key: 'acoes',
        label: '',
        render: (f) => (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="text-sm text-primary hover:text-primary/80"
              onClick={() => {
                setEditando(f);
                setModalOpen(true);
              }}
            >
              Editar
            </button>
            <button
              type="button"
              className="text-sm text-red-300 hover:text-red-200"
              onClick={async () => {
                if (!window.confirm(`Remover o feriado "${f.nome}"?`)) return;
                try {
                  await removerFeriado(f.id);
                  toast.success('Feriado removido.');
                  void carregar();
                } catch (err) {
                  toast.error(formatApiError(err));
                }
              }}
            >
              Excluir
            </button>
          </div>
        ),
      },
    ];
  }, [carregar]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4">
        <h2 className="text-lg font-semibold text-white mb-1">Feriados</h2>
        <p className="text-sm text-white/60 leading-relaxed max-w-3xl">
          Cadastre dias em que <strong className="text-white/80">não há exigência de ponto</strong> para nenhum
          colaborador. O espelho e o banco de horas tratam esses dias como cobertos (sem falta e sem débito de
          horas). Use <strong className="text-white/80">Anual</strong> para feriados fixos (ex.: Natal, Ano Novo).
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Ano de referência">
          <input
            type="number"
            min={2000}
            max={2100}
            value={ano}
            onChange={(e) => setAno(Number(e.target.value) || anoAtual)}
            className="w-28 rounded-md border border-white/30 bg-neutral px-3 py-2 text-sm text-white"
          />
        </Field>
        <button
          type="button"
          className={btn.primary}
          onClick={() => {
            setEditando(null);
            setModalOpen(true);
          }}
        >
          + Novo feriado
        </button>
      </div>

      <Card title={`Feriados ${ano}`}>
        {loading ? (
          <p className="text-white/60 text-sm">Carregando…</p>
        ) : (
          <DataTable columns={colunas} data={lista} keyExtractor={(f) => f.id} emptyMessage="Nenhum feriado cadastrado." />
        )}
      </Card>

      {modalOpen ? (
        <FeriadoFormModal
          initial={editando}
          onClose={() => {
            setModalOpen(false);
            setEditando(null);
          }}
          onSaved={() => {
            setModalOpen(false);
            setEditando(null);
            void carregar();
          }}
        />
      ) : null}
    </div>
  );
}

function FeriadoFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Feriado | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(initial?.nome ?? '');
  const [dataInicio, setDataInicio] = useState(toDateInputValue(initial?.dataInicio));
  const [dataFim, setDataFim] = useState(
    toDateInputValue(initial?.dataFim ?? initial?.dataInicio),
  );
  const [descricao, setDescricao] = useState(initial?.descricao ?? '');
  const [recorrenteAnual, setRecorrenteAnual] = useState(initial?.recorrenteAnual ?? false);
  const [salvando, setSalvando] = useState(false);

  const handleSubmit = async () => {
    if (!nome.trim() || nome.trim().length < 2) {
      toast.error('Informe o nome do feriado (mín. 2 caracteres).');
      return;
    }
    if (!dataInicio) {
      toast.error('Informe a data de início.');
      return;
    }
    const fim = dataFim.trim() || dataInicio;
    if (fim < dataInicio) {
      toast.error('A data final não pode ser anterior à inicial.');
      return;
    }

    setSalvando(true);
    try {
      const payload = {
        nome: nome.trim(),
        dataInicio,
        dataFim: fim,
        descricao: descricao.trim() || undefined,
        recorrenteAnual,
      };
      if (initial) {
        await atualizarFeriado(initial.id, payload);
        toast.success('Feriado atualizado.');
      } else {
        await criarFeriado(payload);
        toast.success('Feriado cadastrado.');
      }
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      title={initial ? 'Editar feriado' : 'Novo feriado'}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={btn.secondary} disabled={salvando}>
            Cancelar
          </button>
          <button type="button" onClick={() => void handleSubmit()} className={btn.primary} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome *">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Natal, Corpus Christi"
            className="w-full rounded-md border border-white/30 bg-neutral px-3 py-2 text-sm text-white"
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Data início *">
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => {
                setDataInicio(e.target.value);
                if (!dataFim || dataFim < e.target.value) setDataFim(e.target.value);
              }}
              className="w-full rounded-md border border-white/30 bg-neutral px-3 py-2 text-sm text-white"
            />
          </Field>
          <Field label="Data fim">
            <input
              type="date"
              value={dataFim}
              min={dataInicio || undefined}
              onChange={(e) => setDataFim(e.target.value)}
              className="w-full rounded-md border border-white/30 bg-neutral px-3 py-2 text-sm text-white"
            />
          </Field>
        </div>
        <Field label="Descrição (opcional)">
          <textarea
            rows={2}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="w-full rounded-md border border-white/30 bg-neutral px-3 py-2 text-sm text-white"
          />
        </Field>
        <label className="inline-flex items-center gap-2 text-sm text-white/85">
          <input
            type="checkbox"
            checked={recorrenteAnual}
            onChange={(e) => setRecorrenteAnual(e.target.checked)}
            className="h-4 w-4 rounded border-white/30"
          />
          Repete todo ano (mesma data)
        </label>
      </div>
    </Modal>
  );
}
