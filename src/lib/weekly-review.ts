import { Task, Topic } from "./types";
import { addDaysISO, startOfWeekISO, todayISO } from "./date-utils";
import { calculateTopicProgress, findStuckTopic, isTaskOverdue } from "./task-utils";

export interface WeeklyMetrics {
  weekStart: string;
  weekEnd: string;
  completed: number;
  created: number;
  archived: number;
  overdue: number;
  completionRate: number;
  criticalCompleted: number;
  criticalOpen: number;
  highOverdue: number;
  /** Só soma o que o usuário estimou — nunca inventa tempo. */
  estimatedMinutesCompleted: number;
  estimatedMinutesPending: number;
  topTopic: Topic | null;
  stuckTopic: Topic | null;
}

function inWeek(iso: string | null | undefined, start: string, end: string): boolean {
  if (!iso) return false;
  const day = iso.slice(0, 10);
  return day >= start && day <= end;
}

export function calculateWeeklyMetrics(
  tasks: Task[],
  topics: Topic[],
  today: string = todayISO()
): WeeklyMetrics {
  const weekStart = startOfWeekISO(today);
  const weekEnd = addDaysISO(weekStart, 6);
  const active = tasks.filter((t) => !t.deletedAt);

  const completed = active.filter((t) => inWeek(t.completedAt, weekStart, weekEnd)).length;
  const created = active.filter((t) => inWeek(t.createdAt, weekStart, weekEnd)).length;
  const archived = active.filter((t) => inWeek(t.archivedAt, weekStart, weekEnd)).length;
  const overdue = active.filter((t) => isTaskOverdue(t, today)).length;

  const criticalCompleted = active.filter(
    (t) => t.priority === "critical" && inWeek(t.completedAt, weekStart, weekEnd)
  ).length;
  const criticalOpen = active.filter(
    (t) => t.priority === "critical" && t.status !== "done" && !t.archivedAt
  ).length;
  const highOverdue = active.filter(
    (t) => (t.priority === "high" || t.priority === "critical") && isTaskOverdue(t, today)
  ).length;

  const estimatedMinutesCompleted = active
    .filter((t) => inWeek(t.completedAt, weekStart, weekEnd))
    .reduce((acc, t) => acc + (t.estimatedMinutes ?? 0), 0);
  const estimatedMinutesPending = active
    .filter((t) => t.status !== "done" && !t.archivedAt)
    .reduce((acc, t) => acc + (t.estimatedMinutes ?? 0), 0);

  let topTopic: Topic | null = null;
  let bestPercent = -1;
  for (const topic of topics) {
    if (topic.archivedAt) continue;
    const progress = calculateTopicProgress(active, topic.id, today);
    if (progress.total > 0 && progress.percent > bestPercent) {
      bestPercent = progress.percent;
      topTopic = topic;
    }
  }

  return {
    weekStart,
    weekEnd,
    completed,
    created,
    archived,
    overdue,
    completionRate: created === 0 ? 0 : Math.round((completed / created) * 100),
    criticalCompleted,
    criticalOpen,
    highOverdue,
    estimatedMinutesCompleted,
    estimatedMinutesPending,
    topTopic,
    stuckTopic: findStuckTopic(active, topics),
  };
}

export function formatMinutes(total: number): string {
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
