import { useState } from 'react';
import {
  exportarFolhaPontoPdf,
  type ExportarFolhaPontoParams,
} from '../../utils/folhaFrequenciaPdf';
import { rotuloCompetencia } from '../../utils/pontoCompetencia';
import { rotuloPeriodoBancoHoras, type EstadoFiltroBancoHoras } from './rhUi';
import { formatApiError, toast } from '../../utils/toast';
import { btn } from '../../utils/buttonStyles';

interface ImprimirMinhaFolhaPontoButtonProps {
  filtro: EstadoFiltroBancoHoras;
  usuarioId: number;
  nome: string;
  funcao?: string;
  /** ID do usuário logado (para buscar jornada própria vs. colaborador). */
  usuarioIdAtual?: number;
  disabled?: boolean;
  className?: string;
}

export function ImprimirMinhaFolhaPontoButton({
  filtro,
  usuarioId,
  nome,
  funcao,
  usuarioIdAtual,
  disabled,
  className,
}: ImprimirMinhaFolhaPontoButtonProps) {
  const [gerando, setGerando] = useState(false);

  const tituloPeriodo =
    filtro.modo === 'mes'
      ? rotuloCompetencia(filtro.competencia)
      : rotuloPeriodoBancoHoras(filtro);

  return (
    <button
      type="button"
      disabled={disabled || gerando}
      title={`Gerar PDF da folha de ponto — ${tituloPeriodo}`}
      className={className ?? btn.secondary}
      onClick={async () => {
        setGerando(true);
        try {
          const base = {
            usuarioId,
            nome,
            funcao,
            usuarioIdAtual,
          };
          const params: ExportarFolhaPontoParams =
            filtro.modo === 'mes'
              ? { modo: 'mes', competencia: filtro.competencia, ...base }
              : {
                  modo: 'periodo',
                  dataInicio: filtro.dataInicio,
                  dataFim: filtro.dataFim,
                  ...base,
                };
          await exportarFolhaPontoPdf(params);
          toast.success('Folha de ponto gerada. Abra o PDF e use Imprimir no navegador.');
        } catch (err) {
          toast.error(formatApiError(err));
        } finally {
          setGerando(false);
        }
      }}
    >
      {gerando ? 'Gerando folha…' : 'Imprimir folha de ponto'}
    </button>
  );
}
