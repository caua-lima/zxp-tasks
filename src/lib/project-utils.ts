import { Task, TaskPriority } from "./types";
import { daysBetween, todayISO } from "./date-utils";
import { getTaskPriorityScore, isTaskOverdue } from "./task-utils";

function isActive(task: Task): boolean {
  return !task.deletedAt && !task.archivedAt;
}

/**
 * A única tarefa que faz sentido puxar agora neste tópico.
 *
 * Ordem: já em andamento > atrasada > prioridade > prazo mais próximo.
 * "Fazendo" ganha de tudo porque terminar o que já começou vale mais do
 * que abrir uma frente nova.
 */
export function getNextAction(
  tasks: Task[],
  topicId: string,
  today: string = todayISO()
): Task | null {
  const candidates = tasks.filter(
    (t) => t.topicId === topicId && isActive(t) && t.status !== "done"
  );
  if (candidates.length === 0) return null;

  return candidates.reduce((best, current) => {
    const score = (t: Task) =>
      (t.status === "doing" ? 1000 : 0) +
      (isTaskOverdue(t, today) ? 100 : 0) +
      getTaskPriorityScore(t.priority) * 10;

    const diff = score(current) - score(best);
    if (diff !== 0) return diff > 0 ? current : best;

    // Empate: quem tem prazo mais próximo vem primeiro; sem prazo fica atrás.
    const currentDue = current.dueDate ?? "9999-99-99";
    const bestDue = best.dueDate ?? "9999-99-99";
    return currentDue < bestDue ? current : best;
  });
}

export function getRecentlyCompleted(
  tasks: Task[],
  topicId: string,
  limit = 5
): Task[] {
  return tasks
    .filter((t) => t.topicId === topicId && !t.deletedAt && t.status === "done" && t.completedAt)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
    .slice(0, limit);
}

export interface TopicStats {
  total: number;
  done: number;
  doing: number;
  todo: number;
  overdue: number;
  percent: number;
  estimatedMinutesPending: number;
  lastActivity: string | null;
}

export function topicStats(
  tasks: Task[],
  topicId: string,
  today: string = todayISO()
): TopicStats {
  const topicTasks = tasks.filter((t) => t.topicId === topicId && isActive(t));
  const done = topicTasks.filter((t) => t.status === "done").length;
  const doing = topicTasks.filter((t) => t.status === "doing").length;
  const todo = topicTasks.filter((t) => t.status === "todo").length;
  const overdue = topicTasks.filter((t) => isTaskOverdue(t, today)).length;
  const total = topicTasks.length;

  const estimatedMinutesPending = topicTasks
    .filter((t) => t.status !== "done")
    .reduce((acc, t) => acc + (t.estimatedMinutes ?? 0), 0);

  const lastActivity =
    topicTasks.length === 0
      ? null
      : topicTasks.reduce(
          (latest, t) => (t.updatedAt > latest ? t.updatedAt : latest),
          topicTasks[0].updatedAt
        );

  return {
    total,
    done,
    doing,
    todo,
    overdue,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    estimatedMinutesPending,
    lastActivity,
  };
}

export interface TopicInsights {
  /** Concluídas nos últimos 7 e 30 dias — ritmo real, não acumulado. */
  completedLast7: number;
  completedLast30: number;
  /** Dias desde a última mexida em qualquer tarefa do tópico. */
  daysSinceActivity: number | null;
  /**
   * Mediana de dias entre criar e concluir. Mediana e não média porque
   * uma tarefa esquecida por 6 meses distorce a média inteira.
   */
  medianDaysToComplete: number | null;
  byPriority: Record<TaskPriority, number>;
  /** Quanto do que está aberto já passou do prazo, em %. */
  overdueShare: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

export function topicInsights(
  tasks: Task[],
  topicId: string,
  today: string = todayISO()
): TopicInsights {
  const topicTasks = tasks.filter((t) => t.topicId === topicId && isActive(t));
  const completed = topicTasks.filter((t) => t.status === "done" && t.completedAt);

  const within = (days: number) =>
    completed.filter((t) => daysBetween(t.completedAt!, today) <= days).length;

  const durations = completed
    .map((t) => daysBetween(t.createdAt, t.completedAt!))
    // createdAt de migração antiga (1970) produziria "20 mil dias" e
    // envenenaria a estatística — descarta o que não é plausível.
    .filter((d) => d >= 0 && d < 3650);

  const byPriority: Record<TaskPriority, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const t of topicTasks) {
    if (t.status !== "done") byPriority[t.priority]++;
  }

  const open = topicTasks.filter((t) => t.status !== "done");
  const overdueOpen = open.filter((t) => isTaskOverdue(t, today)).length;

  const lastActivity = topicStats(tasks, topicId, today).lastActivity;

  return {
    completedLast7: within(7),
    completedLast30: within(30),
    // Nunca negativo: um updatedAt de "agora" durante a virada do dia não
    // pode virar "-1 dia desde a última mexida".
    daysSinceActivity: lastActivity ? Math.max(0, daysBetween(lastActivity, today)) : null,
    medianDaysToComplete: median(durations),
    byPriority,
    overdueShare: open.length === 0 ? 0 : Math.round((overdueOpen / open.length) * 100),
  };
}
