import { Board, Task, Topic } from "./types";
import { migrateBoard } from "./task-migrations";

export interface BackupValidation {
  valid: boolean;
  error?: string;
  topics: number;
  tasks: number;
}

export function validateBackup(json: string): BackupValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { valid: false, error: "Arquivo não é um JSON válido.", topics: 0, tasks: 0 };
  }
  if (!parsed || typeof parsed !== "object") {
    return { valid: false, error: "Conteúdo inesperado no arquivo.", topics: 0, tasks: 0 };
  }
  const r = parsed as Record<string, unknown>;
  if (!Array.isArray(r.topics) || !Array.isArray(r.tasks)) {
    return {
      valid: false,
      error: "Backup precisa ter as listas de tópicos e tarefas.",
      topics: 0,
      tasks: 0,
    };
  }
  const board = migrateBoard(parsed);
  return { valid: true, topics: board.topics.length, tasks: board.tasks.length };
}

export interface MergeReport {
  topicsAdded: number;
  tasksAdded: number;
  duplicatesSkipped: number;
}

/** Mescla por id: o que já existe fica como está, o que é novo entra. */
export function mergeImportedData(
  current: Board,
  incoming: Board
): { board: Board; report: MergeReport } {
  const topicIds = new Set(current.topics.map((t) => t.id));
  const taskIds = new Set(current.tasks.map((t) => t.id));

  const newTopics: Topic[] = [];
  const newTasks: Task[] = [];
  let duplicatesSkipped = 0;

  for (const topic of incoming.topics) {
    if (topicIds.has(topic.id)) {
      duplicatesSkipped++;
      continue;
    }
    topicIds.add(topic.id);
    newTopics.push(topic);
  }
  for (const task of incoming.tasks) {
    if (taskIds.has(task.id)) {
      duplicatesSkipped++;
      continue;
    }
    // Tarefa órfã (tópico não existe nem aqui nem no backup) seria invisível.
    if (!topicIds.has(task.topicId)) {
      duplicatesSkipped++;
      continue;
    }
    taskIds.add(task.id);
    newTasks.push(task);
  }

  return {
    board: {
      ...current,
      topics: [...current.topics, ...newTopics],
      tasks: [...current.tasks, ...newTasks],
    },
    report: {
      topicsAdded: newTopics.length,
      tasksAdded: newTasks.length,
      duplicatesSkipped,
    },
  };
}

export function estimateSizeKb(board: Board): number {
  return Math.round((JSON.stringify(board).length / 1024) * 10) / 10;
}
