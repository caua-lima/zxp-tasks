export type TaskStatus = "todo" | "doing" | "done";

export interface Topic {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface Task {
  id: string;
  topicId: string;
  title: string;
  description: string;
  date: string | null;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Board {
  topics: Topic[];
  tasks: Task[];
}
