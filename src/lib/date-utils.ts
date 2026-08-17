function formatLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Data de hoje como "AAAA-MM-DD", no fuso local do navegador. */
export function todayISO(): string {
  return formatLocal(new Date());
}

/**
 * Dia LOCAL de um timestamp completo ("2026-08-17T02:00:00.000Z" às 23h de
 * 16/08 no Brasil devolve "2026-08-16").
 *
 * Cortar a string com `.slice(0, 10)` devolveria o dia em UTC: à noite, o
 * UTC já virou, então tarefa concluída hoje contaria como amanhã — e a
 * diferença de dias chegava a ficar negativa ("-1d desde a última mexida").
 * Datas puras ("2026-08-16", sem hora) passam direto, sem reinterpretação.
 */
export function localDayOf(isoTimestamp: string): string {
  if (!isoTimestamp.includes("T")) return isoTimestamp.slice(0, 10);
  const d = new Date(isoTimestamp);
  return Number.isNaN(d.getTime()) ? isoTimestamp.slice(0, 10) : formatLocal(d);
}

/** Dias inteiros entre dois momentos, comparando pelo dia local de cada um. */
export function daysBetween(from: string, to: string): number {
  const a = new Date(localDayOf(from) + "T00:00:00").getTime();
  const b = new Date(localDayOf(to) + "T00:00:00").getTime();
  return Math.round((b - a) / 86_400_000);
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function formatDateShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/** Segunda-feira da semana de `iso` (ou hoje, se omitido), como "AAAA-MM-DD". */
export function startOfWeekISO(iso: string = todayISO()): string {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function isSameOrBefore(a: string, b: string): boolean {
  return a <= b;
}
