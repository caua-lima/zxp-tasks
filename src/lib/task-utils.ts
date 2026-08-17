import { Task, TaskPriority, Topic } from "./types";
import { todayISO, addDaysISO } from "./date-utils";

const PRIORITY_SCORE: Record<TaskPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function getTaskPriorityScore(priority: TaskPriority): number {
  return PRIORITY_SCORE[priority];
}

function isActive(task: Task): boolean {
  return !task.deletedAt && !task.archivedAt;
}

export function isTaskOverdue(task: Task, today: string = todayISO()): boolean {
  if (!task.dueDate || task.status === "done") return false;
  if (!isActive(task)) return false;
  return task.dueDate < today;
}

export function getTasksDueToday(tasks: Task[], today: string = todayISO()): Task[] {
  return tasks.filter(
    (t) => isActive(t) && t.status !== "done" && t.dueDate === today
  );
}

export function getUpcomingTasks(
  tasks: Task[],
  days: number,
  today: string = todayISO()
): Task[] {
  const limit = addDaysISO(today, days);
  return tasks.filter(
    (t) =>
      isActive(t) &&
      t.status !== "done" &&
      !!t.dueDate &&
      t.dueDate > today &&
      t.dueDate <= limit
  );
}

export function getOverdueTasks(tasks: Task[], today: string = todayISO()): Task[] {
  return tasks.filter((t) => isTaskOverdue(t, today));
}

export function getQuickWins(tasks: Task[], today: string = todayISO()): Task[] {
  return tasks.filter(
    (t) =>
      isActive(t) &&
      t.status !== "done" &&
      t.energy === "quick" &&
      (t.estimatedMinutes === undefined || t.estimatedMinutes <= 15) &&
      (t.priority === "medium" || t.priority === "high" || t.priority === "critical") &&
      !isTaskOverdue(t, today)
  );
}

export function suggestFocusTasks(tasks: Task[], today: string = todayISO(), limit = 3): Task[] {
  const candidates = tasks.filter((t) => isActive(t) && t.status !== "done");
  const scored = candidates
    .map((t) => {
      let score = getTaskPriorityScore(t.priority) * 10;
      if (isTaskOverdue(t, today)) score += 50;
      if (t.dueDate === today) score += 20;
      return { t, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.t);
}

export function checklistProgress(task: Task): { done: number; total: number } {
  const list = task.checklist ?? [];
  return { done: list.filter((c) => c.completed).length, total: list.length };
}

export interface TopicProgress {
  total: number;
  done: number;
  overdue: number;
  percent: number;
}

export function calculateTopicProgress(
  tasks: Task[],
  topicId: string,
  today: string = todayISO()
): TopicProgress {
  const topicTasks = tasks.filter((t) => t.topicId === topicId && isActive(t));
  const done = topicTasks.filter((t) => t.status === "done").length;
  const overdue = topicTasks.filter((t) => isTaskOverdue(t, today)).length;
  const total = topicTasks.length;
  return { total, done, overdue, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/** Tópico há mais tempo sem tarefa criada/atualizada — sinal de "travado". */
export function findStuckTopic(tasks: Task[], topics: Topic[]): Topic | null {
  let stuck: Topic | null = null;
  let oldest = Infinity;
  for (const topic of topics) {
    if (topic.archivedAt) continue;
    const topicTasks = tasks.filter((t) => t.topicId === topic.id && isActive(t));
    if (topicTasks.length === 0) continue;
    const lastUpdate = Math.max(...topicTasks.map((t) => new Date(t.updatedAt).getTime()));
    if (lastUpdate < oldest) {
      oldest = lastUpdate;
      stuck = topic;
    }
  }
  return stuck;
}

export function visibleTasks(tasks: Task[]): Task[] {
  return tasks.filter(isActive);
}
