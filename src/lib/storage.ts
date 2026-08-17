import { Board, emptyBoard } from "./types";
import { migrateBoard } from "./task-migrations";

const STORAGE_KEY = "tarefas-zxp:board:v1";
const BACKUP_KEY = "zxp-tasks:backups";
const MAX_BACKUPS = 5;

export interface StoredBackup {
  createdAt: string;
  reason: string;
  data: string;
}

export function loadBoard(): Board {
  if (typeof window === "undefined") return emptyBoard();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyBoard();
    return migrateBoard(JSON.parse(raw));
  } catch {
    return emptyBoard();
  }
}

export function saveBoard(board: Board) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
}

export function listBackups(): StoredBackup[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BACKUP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredBackup[]) : [];
  } catch {
    return [];
  }
}

/** Snapshot local antes de operação destrutiva (importar, esvaziar lixeira). */
export function pushBackup(board: Board, reason: string) {
  if (typeof window === "undefined") return;
  const backups = listBackups();
  backups.unshift({
    createdAt: new Date().toISOString(),
    reason,
    data: JSON.stringify(board),
  });
  try {
    window.localStorage.setItem(BACKUP_KEY, JSON.stringify(backups.slice(0, MAX_BACKUPS)));
  } catch {
    // Cota estourada: perder um snapshot é aceitável, perder o quadro não.
  }
}

export function lastBackupDate(): string | null {
  return listBackups()[0]?.createdAt ?? null;
}
