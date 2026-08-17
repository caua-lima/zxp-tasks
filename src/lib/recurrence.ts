import { Recurrence, Task } from "./types";
import { addDaysISO, todayISO } from "./date-utils";

/**
 * Próxima data de uma recorrência a partir de `from`.
 *
 * `weekdays` (0=domingo … 6=sábado) só vale para `weekly`: quando existe,
 * a próxima data é o próximo dia da semana marcado, não "daqui a 7 dias".
 * Isso é o que faz "toda segunda e quinta" funcionar de verdade.
 */
export function nextOccurrence(recurrence: Recurrence, from: string): string {
  const interval = Math.max(1, recurrence.interval ?? 1);

  if (recurrence.frequency === "daily") {
    return addDaysISO(from, interval);
  }

  if (recurrence.frequency === "weekly") {
    const weekdays = recurrence.weekdays?.filter((d) => d >= 0 && d <= 6) ?? [];
    if (weekdays.length === 0) return addDaysISO(from, 7 * interval);

    const current = new Date(from + "T00:00:00").getDay();
    const ordered = [...new Set(weekdays)].sort((a, b) => a - b);
    const next = ordered.find((d) => d > current);
    if (next !== undefined) return addDaysISO(from, next - current);
    // Nenhum dia restante nesta semana: volta pro primeiro dia marcado,
    // já pulando os intervalos de semana configurados.
    const first = ordered[0];
    return addDaysISO(from, 7 * interval - (current - first));
  }

  // Mensal: mantém o dia do mês; se o mês destino não tiver esse dia
  // (31 de fevereiro), cai no último dia do mês — nunca vaza pro mês seguinte.
  const [year, month, day] = from.split("-").map(Number);
  const targetMonthIndex = month - 1 + interval;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  return `${targetYear}-${String(normalizedMonth + 1).padStart(2, "0")}-${String(
    safeDay
  ).padStart(2, "0")}`;
}

/**
 * Ocorrência seguinte de uma tarefa recorrente concluída.
 *
 * Devolve `null` quando não há recorrência — quem chama decide o que fazer,
 * em vez de receber uma tarefa duplicada por engano. O histórico da tarefa
 * concluída é preservado: a nova nasce limpa (sem completedAt, com checklist
 * desmarcado), como uma nova ocorrência e não como uma cópia do passado.
 */
export function createRecurringTask(
  task: Task,
  newId: string,
  now: string = new Date().toISOString()
): Task | null {
  if (!task.recurrence) return null;

  const base = task.dueDate ?? now.slice(0, 10);
  return {
    ...task,
    id: newId,
    status: "todo",
    completedAt: undefined,
    deletedAt: undefined,
    archivedAt: undefined,
    dueDate: nextOccurrence(task.recurrence, base),
    // A nova ocorrência ainda não gerou a dela — sem isso, a corrente pararia
    // na segunda repetição.
    recurrenceSpawned: false,
    checklist: task.checklist.map((item) => ({ ...item, completed: false })),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Empurra a tarefa recorrente para a próxima data sem concluí-la — é o
 * "essa semana não rolou" sem sujar a métrica de concluídas nem quebrar
 * a corrente da recorrência.
 *
 * Devolve `null` se a tarefa não é recorrente: pular uma tarefa comum
 * seria só perder o prazo, então quem chama precisa tratar.
 */
export function skipOccurrence(
  task: Task,
  now: string = new Date().toISOString()
): Task | null {
  if (!task.recurrence) return null;
  const base = task.dueDate ?? now.slice(0, 10);
  return {
    ...task,
    dueDate: nextOccurrence(task.recurrence, base),
    updatedAt: now,
  };
}

export function describeRecurrence(recurrence: Recurrence): string {
  const interval = Math.max(1, recurrence.interval ?? 1);
  if (recurrence.frequency === "daily") {
    return interval === 1 ? "Todo dia" : `A cada ${interval} dias`;
  }
  if (recurrence.frequency === "weekly") {
    const names = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
    const days = recurrence.weekdays?.length
      ? ` (${[...recurrence.weekdays].sort((a, b) => a - b).map((d) => names[d]).join(", ")})`
      : "";
    return (interval === 1 ? "Toda semana" : `A cada ${interval} semanas`) + days;
  }
  return interval === 1 ? "Todo mês" : `A cada ${interval} meses`;
}

/** Data de referência padrão para uma nova recorrência sem prazo definido. */
export function defaultRecurrenceStart(): string {
  return todayISO();
}
