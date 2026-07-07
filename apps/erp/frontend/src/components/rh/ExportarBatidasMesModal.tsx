import { useCallback, useEffect, useMemo, useState } from 'react';
import { Field, Modal } from './rhUi';
import {
  exportarBatidasCompetencia,
  type PontoBatidasFormato,
} from '../../utils/pontoBatidasExport';
import { filtrosPontoDaCompetencia, rotuloCompetencia } from '../../utils/pontoCompetencia';
import { listarTodosPontos, type RegistroPonto } from '../../services/rh';
import { formatApiError, toast } from '../../utils/toast';
import { btn } from '../../utils/buttonStyles';

export type EscopoExportacaoBatidas = 'todos' | 'selecionados' | 'colaborador';

export interface ColaboradorExportacao {
  usuarioId: number;
  nome: string;
}

interface ExportarBatidasMesModalProps {
  open: boolean;
  onClose: () => void;
  competencia: string;
  /** Lista para escopo "colaborador" ou "selecionados". */
  colaboradores?: ColaboradorExportacao[];
  /** Pré-seleciona um colaborador (extrato individual). */
  usuarioIdFixo?: number;
  /** IDs já marcados na tela de fechamento (modo equipe). */
  selecionadosIds?: number[];
}

export function ExportarBatidasMesModal({
  open,
  onClose,
  competencia,
  colaboradores = [],
  usuarioIdFixo,
  selecionadosIds = [],
}: ExportarBatidasMesModalProps) {
  const [formato, setFormato] = useState<PontoBatidasFormato>('pdf');
  const [escopo, setEscopo] = useState<EscopoExportacaoBatidas>(
    usuarioIdFixo != null ? 'colaborador' : 'todos',
  );
  const [usuarioId, setUsuarioId] = useState<number | ''>(usuarioIdFixo ?? '');
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFormato('pdf');
    if (usuarioIdFixo != null) {
      setEscopo('colaborador');
      setUsuarioId(usuarioIdFixo);
    } else {
      setEscopo(selecionadosIds.length > 0 ? 'selecionados' : 'todos');
      setUsuarioId(colaboradores[0]?.usuarioId ?? '');
    }
  }, [open, usuarioIdFixo, selecionadosIds.length, colaboradores]);

  const opcoesEscopo = useMemo(() => {
    const base: { id: EscopoExportacaoBatidas; label: string; disabled?: boolean }[] = [
      { id: 'todos', label: 'Todos os colaboradores do mês' },
    ];
    if (!usuarioIdFixo) {
      base.push({
        id: 'selecionados',
        label: `Apenas selecionados na lista (${selecionadosIds.length})`,
        disabled: selecionadosIds.length === 0,
      });
      if (colaboradores.length > 0) {
        base.push({ id: 'colaborador', label: 'Um colaborador específico' });
      }
    }
    return base;
  }, [usuarioIdFixo, selecionadosIds.length, colaboradores.length]);

  const resolverEscopo = useCallback((): { usuarioIds?: number[]; label: string } => {
    if (usuarioIdFixo != null) {
      const nome =
        colaboradores.find((c) => c.usuarioId === usuarioIdFixo)?.nome ?? `ID ${usuarioIdFixo}`;
      return { usuarioIds: [usuarioIdFixo], label: nome };
    }
    if (escopo === 'todos') {
      return { label: 'Todos os colaboradores' };
    }
    if (escopo === 'selecionados') {
      return {
        usuarioIds: [...selecionadosIds],
        label: `${selecionadosIds.length} colaborador(es) selecionado(s)`,
      };
    }
    const id = typeof usuarioId === 'number' ? usuarioId : Number(usuarioId);
    const nome = colaboradores.find((c) => c.usuarioId === id)?.nome ?? `ID ${id}`;
    return { usuarioIds: [id], label: nome };
  }, [usuarioIdFixo, escopo, selecionadosIds, usuarioId, colaboradores]);

  const handleExportar = async () => {
    const { usuarioIds, label } = resolverEscopo();
    if (escopo === 'colaborador' && usuarioIdFixo == null) {
      const id = typeof usuarioId === 'number' ? usuarioId : Number(usuarioId);
      if (!Number.isFinite(id) || id <= 0) {
        toast.error('Selecione um colaborador.');
        return;
      }
    }
    if (escopo === 'selecionados' && selecionadosIds.length === 0) {
      toast.error('Nenhum colaborador selecionado na lista de fechamento.');
      return;
    }

    setExportando(true);
    try {
      const filtros = filtrosPontoDaCompetencia(
        competencia,
        usuarioIds?.length === 1 ? usuarioIds[0] : undefined,
      );
      const registros: RegistroPonto[] = await listarTodosPontos(filtros);
      await exportarBatidasCompetencia({
        competencia,
        formato,
        registros,
        usuarioIds,
        escopoLabel: label,
      });
      const msg =
        formato === 'html'
          ? 'Relatório aberto — use Imprimir → Salvar como PDF no navegador.'
          : formato === 'xlsx'
            ? 'Arquivo Excel (.xlsx) gerado com sucesso.'
            : formato === 'pdf'
              ? 'Folha(s) de frequência em PDF gerada(s).'
              : 'Exportação concluída.';
      toast.success(msg);
      onClose();
    } catch (e: unknown) {
      toast.error(formatApiError(e));
    } finally {
      setExportando(false);
    }
  };

  if (!open) return null;

  return (
    <Modal
      title="Exportar batidas do mês"
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className={btn.secondary} disabled={exportando}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleExportar()}
            disabled={exportando}
            className={btn.primary}
          >
            {exportando ? 'Gerando…' : 'Exportar'}
          </button>
        </>
      }
    >
      <p className="text-sm text-white/65 leading-relaxed mb-4">
        Competência <strong className="text-white/90">{rotuloCompetencia(competencia)}</strong> (
        {competencia}). Inclui todas as batidas (entrada/saída) registradas no período.
      </p>

      <div className="space-y-4">
        <Field label="Formato">
          <select
            value={formato}
            onChange={(e) => setFormato(e.target.value as PontoBatidasFormato)}
            className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="pdf" className="bg-neutral">
              PDF — Folha de frequência (modelo RH)
            </option>
            <option value="xlsx" className="bg-neutral">
              Excel (.xlsx)
            </option>
            <option value="html" className="bg-neutral">
              HTML imprimível (abre janela → Salvar como PDF)
            </option>
            <option value="csv" className="bg-neutral">
              CSV (texto separado por ; — AFD auxiliar)
            </option>
          </select>
        </Field>

        {usuarioIdFixo == null ? (
          <Field label="Escopo">
            <select
              value={escopo}
              onChange={(e) => setEscopo(e.target.value as EscopoExportacaoBatidas)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {opcoesEscopo.map((o) => (
                <option key={o.id} value={o.id} disabled={o.disabled} className="bg-neutral">
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {escopo === 'colaborador' && usuarioIdFixo == null && colaboradores.length > 0 ? (
          <Field label="Colaborador">
            <select
              value={usuarioId}
              onChange={(e) =>
                setUsuarioId(e.target.value ? Number(e.target.value) : '')
              }
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="" className="bg-neutral">
                Selecione…
              </option>
              {colaboradores.map((c) => (
                <option key={c.usuarioId} value={c.usuarioId} className="bg-neutral">
                  {c.nome}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>
    </Modal>
  );
}
