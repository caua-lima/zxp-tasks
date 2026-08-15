import { Board } from "./types";

const STORAGE_KEY = "tarefas-zxp:board:v1";

export function loadBoard(): Board {
  if (typeof window === "undefined") return { topics: [], tasks: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { topics: [], tasks: [] };
    const parsed = JSON.parse(raw) as Board;
    return {
      topics: parsed.topics ?? [],
      tasks: parsed.tasks ?? [],
    };
  } catch {
    return { topics: [], tasks: [] };
  }
}

export function saveBoard(board: Board) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
}
