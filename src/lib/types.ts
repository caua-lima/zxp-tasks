export type TaskStatus = "todo" | "doing" | "done";
export type TaskPriority = "critical" | "high" | "medium" | "low";
export type TaskEnergy = "deep" | "normal" | "quick";

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

export interface Recurrence {
  frequency: "daily" | "weekly" | "monthly";
  interval?: number;
  weekdays?: number[];
}

export interface Task {
  id: string;
  topicId: string;
  title: string;
  description: string;
  status: TaskStatus;

  priority: TaskPriority;
  dueDate?: string | null;
  completedAt?: string | null;

  estimatedMinutes?: number;
  energy?: TaskEnergy;

  tags: string[];
  checklist: ChecklistItem[];

  recurrence?: Recurrence | null;

  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  deletedAt?: string | null;
}

export interface Topic {
  id: string;
  name: string;
  color: string;
  icon?: string;
  description?: string;
  createdAt: string;
  archivedAt?: string | null;
}

export interface WeeklyReviewNote {
  id: string;
  weekStart: string;
  stuck: string;
  toArchive: string;
  nextPriority: string;
  wastingTime: string;
  createdAt: string;
}

export interface Board {
  schemaVersion: number;
  topics: Topic[];
  tasks: Task[];
  dailyFocus: Record<string, string[]>;
  weeklyReviews: WeeklyReviewNote[];
}

export const CURRENT_SCHEMA_VERSION = 2;

export function emptyBoard(): Board {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    topics: [],
    tasks: [],
    dailyFocus: {},
    weeklyReviews: [],
  };
}
