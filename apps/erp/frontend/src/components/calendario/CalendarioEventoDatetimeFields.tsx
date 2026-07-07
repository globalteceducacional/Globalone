import {
  buildEventDateTime,
  compareTimeStrings,
  isAllDayFromIso,
  toInputDate,
  toInputTime,
} from '../../utils/calendarioEventoDatetimes';

export type CalendarioEventoDatetimeState = {
  dataInicio: string;
  dataFim: string;
  horaInicio: string;
  horaFim: string;
  diaInteiro: boolean;
};

export function defaultCalendarioEventoDatetimes(today?: string): CalendarioEventoDatetimeState {
  const d =
    today ??
    (() => {
      const t = new Date();
      return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    })();
  return {
    dataInicio: d,
    dataFim: d,
    horaInicio: '09:00',
    horaFim: '18:00',
    diaInteiro: true,
  };
}

export function calendarioDatetimesFromIso(
  dataInicio: string,
  dataFim: string,
): CalendarioEventoDatetimeState {
  const diaInteiro = isAllDayFromIso(dataInicio, dataFim);
  return {
    dataInicio: toInputDate(dataInicio),
    dataFim: toInputDate(dataFim),
    horaInicio: toInputTime(dataInicio, '09:00'),
    horaFim: toInputTime(dataFim, '18:00'),
    diaInteiro,
  };
}

export function buildCalendarioEventoIsoRange(state: CalendarioEventoDatetimeState): {
  dataInicio: string;
  dataFim: string;
  error?: string;
} {
  const { dataInicio, dataFim, horaInicio, horaFim, diaInteiro } = state;
  if (!dataInicio || !dataFim) {
    return { dataInicio: '', dataFim: '', error: 'Informe as datas do evento.' };
  }

  const di = buildEventDateTime(dataInicio, horaInicio, 'start', diaInteiro);
  const df = buildEventDateTime(dataFim, horaFim, 'end', diaInteiro);

  if (new Date(df).getTime() < new Date(di).getTime()) {
    return {
      dataInicio: di,
      dataFim: df,
      error: diaInteiro
        ? 'A data final deve ser igual ou posterior à inicial.'
        : 'O término deve ser posterior ao início (data e hora).',
    };
  }

  if (!diaInteiro && dataInicio === dataFim && compareTimeStrings(horaFim, horaInicio) <= 0) {
    return {
      dataInicio: di,
      dataFim: df,
      error: 'A hora final deve ser posterior à inicial no mesmo dia.',
    };
  }

  return { dataInicio: di, dataFim: df };
}

type Props = {
  value: CalendarioEventoDatetimeState;
  onChange: (next: CalendarioEventoDatetimeState) => void;
  labelClass?: string;
  inputClass?: string;
};

export function CalendarioEventoDatetimeFields({
  value,
  onChange,
  labelClass = 'block text-xs text-white/70 mb-1',
  inputClass = 'w-full bg-neutral border border-white/30 rounded-md px-2 py-2 text-sm text-white',
}: Props) {
  const patch = (p: Partial<CalendarioEventoDatetimeState>) => onChange({ ...value, ...p });

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm text-white/85 cursor-pointer">
        <input
          type="checkbox"
          checked={value.diaInteiro}
          onChange={(e) => patch({ diaInteiro: e.target.checked })}
          className="accent-primary rounded"
        />
        Dia inteiro
      </label>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Data início</label>
          <input
            type="date"
            value={value.dataInicio}
            onChange={(e) => patch({ dataInicio: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Data fim</label>
          <input
            type="date"
            value={value.dataFim}
            onChange={(e) => patch({ dataFim: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>

      {!value.diaInteiro && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Hora início</label>
            <input
              type="time"
              value={value.horaInicio}
              onChange={(e) => patch({ horaInicio: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Hora fim</label>
            <input
              type="time"
              value={value.horaFim}
              onChange={(e) => patch({ horaFim: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>
      )}
    </div>
  );
}
