/** Converte ISO em `YYYY-MM-DD` (fuso local). */
export function toInputDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Converte ISO em `HH:mm` (fuso local). */
export function toInputTime(iso: string, fallback = '09:00'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Eventos antigos usavam meio-dia UTC; novos “dia inteiro” usam 00:00–23:59 local. */
export function isAllDayFromIso(dataInicio: string, dataFim: string): boolean {
  const a = new Date(dataInicio);
  const b = new Date(dataFim);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return true;

  const legacyMidday =
    a.getUTCHours() === 12 &&
    a.getUTCMinutes() === 0 &&
    a.getUTCSeconds() === 0 &&
    b.getUTCHours() === 12 &&
    b.getUTCMinutes() === 0 &&
    b.getUTCSeconds() === 0;
  if (legacyMidday) return true;

  const startIsMidnight = a.getHours() === 0 && a.getMinutes() === 0 && a.getSeconds() === 0;
  const endIsEndOfDay =
    b.getHours() === 23 && b.getMinutes() === 59;

  return startIsMidnight && endIsEndOfDay;
}

export function buildEventDateTime(
  dateStr: string,
  timeStr: string,
  mode: 'start' | 'end',
  diaInteiro: boolean,
): string {
  if (!dateStr) return new Date().toISOString();
  const [y, m, d] = dateStr.split('-').map(Number);
  if (diaInteiro) {
    if (mode === 'start') {
      return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
    }
    return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
  }
  const [hh = 9, mm = 0] = (timeStr || '09:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

export function compareTimeStrings(a: string, b: string): number {
  const [ah = 0, am = 0] = a.split(':').map(Number);
  const [bh = 0, bm = 0] = b.split(':').map(Number);
  return ah * 60 + am - (bh * 60 + bm);
}

export function formatEventPeriod(
  inicio: Date | null,
  fim: Date | null,
  isoInicio?: string,
  isoFim?: string,
): string {
  if (!inicio && !fim) return '—';
  const di = isoInicio ?? inicio?.toISOString() ?? '';
  const df = isoFim ?? fim?.toISOString() ?? '';
  const a = inicio ?? new Date(di);
  const b = fim ?? new Date(df);

  if (di && df && isAllDayFromIso(di, df)) {
    const sameDay = toInputDate(di) === toInputDate(df);
    const dateFmt = (d: Date) =>
      d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (sameDay) return `${dateFmt(a)} (dia inteiro)`;
    return `${dateFmt(a)} — ${dateFmt(b)} (dias inteiros)`;
  }

  const timeFmt = (d: Date) =>
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dateFmt = (d: Date) =>
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  if (toInputDate(di) === toInputDate(df)) {
    return `${dateFmt(a)} · ${timeFmt(a)} — ${timeFmt(b)}`;
  }
  return `${dateFmt(a)} ${timeFmt(a)} → ${dateFmt(b)} ${timeFmt(b)}`;
}
