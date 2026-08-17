import { Task } from "./types";
import { todayISO } from "./date-utils";
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
