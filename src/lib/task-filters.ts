import { Task, TaskEnergy, TaskPriority } from "./types";
import { getTaskPriorityScore, isTaskOverdue } from "./task-utils";
import { todayISO } from "./date-utils";

export type SortKey = "priority" | "dueDate" | "createdAt" | "updatedAt";

export interface TaskFilters {
  topicId?: string | null;
  priority?: TaskPriority | null;
  energy?: TaskEnergy | null;
  tag?: string | null;
  onlyOverdue?: boolean;
  hideDone?: boolean;
  search?: string;
}

export function filterTasks(tasks: Task[], filters: TaskFilters, today: string = todayISO()): Task[] {
  const search = filters.search?.trim().toLowerCase();
  return tasks.filter((t) => {
    if (t.deletedAt || t.archivedAt) return false;
    if (filters.topicId && t.topicId !== filters.topicId) return false;
    if (filters.priority && t.priority !== filters.priority) return false;
    if (filters.energy && t.energy !== filters.energy) return false;
    if (filters.tag && !(t.tags ?? []).includes(filters.tag)) return false;
    if (filters.onlyOverdue && !isTaskOverdue(t, today)) return false;
    if (filters.hideDone && t.status === "done") return false;
    if (search) {
      const haystack = `${t.title} ${t.description} ${(t.tags ?? []).join(" ")}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

export function sortTasks(tasks: Task[], key: SortKey): Task[] {
  const copy = [...tasks];
  switch (key) {
    case "priority":
      return copy.sort((a, b) => getTaskPriorityScore(b.priority) - getTaskPriorityScore(a.priority));
    case "dueDate":
      return copy.sort((a, b) => (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99"));
    case "createdAt":
      return copy.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "updatedAt":
      return copy.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    default:
      return copy;
  }
}
