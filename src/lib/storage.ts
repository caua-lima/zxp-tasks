import { Board, Task } from "./types";

const STORAGE_KEY = "tarefas-zxp:board:v1";

type StoredTask = Omit<Task, "priority"> & { priority?: Task["priority"] };

export function loadBoard(): Board {
  if (typeof window === "undefined") return { topics: [], tasks: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { topics: [], tasks: [] };
    const parsed = JSON.parse(raw) as Omit<Board, "tasks"> & { tasks?: StoredTask[] };
    return {
      topics: parsed.topics ?? [],
      // Tarefas salvas antes do campo de prioridade existir não têm `priority`.
      tasks: (parsed.tasks ?? []).map((t) => ({ ...t, priority: t.priority ?? "medium" })),
    };
  } catch {
    return { topics: [], tasks: [] };
  }
}

export function saveBoard(board: Board) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
}
