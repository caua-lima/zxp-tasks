"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { v4 as uuid } from "uuid";
import {
  Board,
  Task,
  TaskEnergy,
  TaskPriority,
  TaskStatus,
  Topic,
  WeeklyReviewNote,
  emptyBoard,
} from "@/lib/types";
import { loadBoard, pushBackup, saveBoard } from "@/lib/storage";
import { nextTopicColor } from "@/lib/colors";
import { migrateBoard } from "@/lib/task-migrations";
import { mergeImportedData, MergeReport, validateBackup } from "@/lib/task-backup";
import { createRecurringTask, skipOccurrence } from "@/lib/recurrence";
import { todayISO } from "@/lib/date-utils";

export interface NewTaskInput {
  topicId: string;
  title: string;
  description?: string;
  dueDate?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  energy?: TaskEnergy;
  estimatedMinutes?: number;
  tags?: string[];
}

interface AppContextValue {
  topics: Topic[];
  tasks: Task[];
  board: Board;
  ready: boolean;
  addTopic: (name: string) => Topic;
  updateTopic: (id: string, patch: Partial<Omit<Topic, "id" | "createdAt">>) => void;
  archiveTopic: (id: string) => void;
  restoreTopic: (id: string) => void;
  deleteTopic: (id: string) => void;
  addTask: (input: NewTaskInput) => Task;
  updateTask: (id: string, patch: Partial<Omit<Task, "id" | "createdAt">>) => void;
  setTaskStatus: (id: string, status: TaskStatus) => void;
  trashTask: (id: string) => void;
  restoreTask: (id: string) => void;
  purgeTask: (id: string) => void;
  emptyTrash: () => void;
  archiveTask: (id: string) => void;
  duplicateTask: (id: string) => void;
  /** Empurra uma recorrente pro próximo prazo sem marcar como concluída. */
  skipRecurrence: (id: string) => boolean;
  focusToday: string[];
  toggleFocus: (id: string) => void;
  saveWeeklyReview: (note: Omit<WeeklyReviewNote, "id" | "createdAt">) => void;
  /** Última tarefa aberta em qualquer tela — alvo dos atalhos E e D. */
  rememberOpenedTask: (id: string) => void;
  getLastOpenedTaskId: () => string | null;
  exportData: () => string;
  importData: (json: string, mode: "merge" | "replace") => MergeReport | null;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // localStorage não existe no SSR; ler durante o render causaria
    // divergência de hidratação.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBoard(loadBoard());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) saveBoard(board);
  }, [board, ready]);

  const addTopic = useCallback(
    (name: string) => {
      const topic: Topic = {
        id: uuid(),
        name: name.trim(),
        color: nextTopicColor(board.topics.length),
        createdAt: new Date().toISOString(),
      };
      setBoard((b) => ({ ...b, topics: [...b.topics, topic] }));
      return topic;
    },
    [board.topics.length]
  );

  const updateTopic = useCallback(
    (id: string, patch: Partial<Omit<Topic, "id" | "createdAt">>) => {
      setBoard((b) => ({
        ...b,
        topics: b.topics.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      }));
    },
    []
  );

  const archiveTopic = useCallback((id: string) => {
    setBoard((b) => ({
      ...b,
      topics: b.topics.map((t) =>
        t.id === id ? { ...t, archivedAt: new Date().toISOString() } : t
      ),
    }));
  }, []);

  const restoreTopic = useCallback((id: string) => {
    setBoard((b) => ({
      ...b,
      topics: b.topics.map((t) => (t.id === id ? { ...t, archivedAt: undefined } : t)),
    }));
  }, []);

  const deleteTopic = useCallback((id: string) => {
    const now = new Date().toISOString();
    setBoard((b) => ({
      ...b,
      topics: b.topics.filter((t) => t.id !== id),
      // Tarefas do tópico vão pra lixeira, não somem.
      tasks: b.tasks.map((t) => (t.topicId === id ? { ...t, deletedAt: now } : t)),
    }));
  }, []);

  const addTask = useCallback((input: NewTaskInput) => {
    const now = new Date().toISOString();
    const task: Task = {
      id: uuid(),
      topicId: input.topicId,
      title: input.title.trim(),
      description: input.description?.trim() ?? "",
      status: input.status ?? "todo",
      priority: input.priority ?? "medium",
      dueDate: input.dueDate ?? undefined,
      energy: input.energy,
      estimatedMinutes: input.estimatedMinutes,
      tags: input.tags ?? [],
      checklist: [],
      createdAt: now,
      updatedAt: now,
    };
    setBoard((b) => ({ ...b, tasks: [...b.tasks, task] }));
    return task;
  }, []);

  const updateTask = useCallback(
    (id: string, patch: Partial<Omit<Task, "id" | "createdAt">>) => {
      setBoard((b) => ({
        ...b,
        tasks: b.tasks.map((t) =>
          t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t
        ),
      }));
    },
    []
  );

  /**
   * Concluir carimba completedAt uma vez; reabrir remove.
   *
   * Se a tarefa é recorrente, a próxima ocorrência nasce aqui — uma única
   * vez. A trava é `recurrenceSpawned`, não o `completedAt`: reabrir limpa
   * o completedAt, então usá-lo como trava deixaria "reabrir e concluir de
   * novo" criar uma ocorrência duplicada.
   */
  const setTaskStatus = useCallback((id: string, status: TaskStatus) => {
    const now = new Date().toISOString();
    setBoard((b) => {
      const target = b.tasks.find((t) => t.id === id);
      const shouldSpawn =
        status === "done" && !!target?.recurrence && !target.recurrenceSpawned;

      const tasks = b.tasks.map((t) => {
        if (t.id !== id) return t;
        if (status === "done") {
          return {
            ...t,
            status,
            completedAt: t.completedAt ?? now,
            recurrenceSpawned: t.recurrenceSpawned || shouldSpawn,
            updatedAt: now,
          };
        }
        return { ...t, status, completedAt: undefined, updatedAt: now };
      });

      if (shouldSpawn && target) {
        const next = createRecurringTask(target, uuid(), now);
        if (next) tasks.push(next);
      }
      return { ...b, tasks };
    });
  }, []);

  const trashTask = useCallback((id: string) => {
    const now = new Date().toISOString();
    setBoard((b) => ({
      ...b,
      tasks: b.tasks.map((t) => (t.id === id ? { ...t, deletedAt: now, updatedAt: now } : t)),
    }));
  }, []);

  const restoreTask = useCallback((id: string) => {
    setBoard((b) => ({
      ...b,
      tasks: b.tasks.map((t) =>
        t.id === id
          ? { ...t, deletedAt: undefined, archivedAt: undefined, updatedAt: new Date().toISOString() }
          : t
      ),
    }));
  }, []);

  const purgeTask = useCallback((id: string) => {
    setBoard((b) => {
      pushBackup(b, "exclusão definitiva de tarefa");
      return { ...b, tasks: b.tasks.filter((t) => t.id !== id) };
    });
  }, []);

  const emptyTrash = useCallback(() => {
    setBoard((b) => {
      pushBackup(b, "esvaziar lixeira");
      return { ...b, tasks: b.tasks.filter((t) => !t.deletedAt) };
    });
  }, []);

  const archiveTask = useCallback((id: string) => {
    const now = new Date().toISOString();
    setBoard((b) => ({
      ...b,
      tasks: b.tasks.map((t) => (t.id === id ? { ...t, archivedAt: now, updatedAt: now } : t)),
    }));
  }, []);

  const skipRecurrence = useCallback((id: string) => {
    let skipped = false;
    setBoard((b) => {
      const target = b.tasks.find((t) => t.id === id);
      const next = target ? skipOccurrence(target) : null;
      if (!next) return b;
      skipped = true;
      return { ...b, tasks: b.tasks.map((t) => (t.id === id ? next : t)) };
    });
    return skipped;
  }, []);

  const duplicateTask = useCallback((id: string) => {
    setBoard((b) => {
      const original = b.tasks.find((t) => t.id === id);
      if (!original) return b;
      const now = new Date().toISOString();
      const copy: Task = {
        ...original,
        id: uuid(),
        title: `${original.title} (cópia)`,
        status: "todo",
        completedAt: undefined,
        deletedAt: undefined,
        archivedAt: undefined,
        createdAt: now,
        updatedAt: now,
      };
      return { ...b, tasks: [...b.tasks, copy] };
    });
  }, []);

  const today = todayISO();
  const focusToday = useMemo(() => board.dailyFocus[today] ?? [], [board.dailyFocus, today]);

  const toggleFocus = useCallback(
    (id: string) => {
      setBoard((b) => {
        const current = b.dailyFocus[today] ?? [];
        const next = current.includes(id)
          ? current.filter((x) => x !== id)
          : current.length >= 3
            ? current
            : [...current, id];
        return { ...b, dailyFocus: { ...b.dailyFocus, [today]: next } };
      });
    },
    [today]
  );

  const saveWeeklyReview = useCallback(
    (note: Omit<WeeklyReviewNote, "id" | "createdAt">) => {
      setBoard((b) => {
        const entry: WeeklyReviewNote = {
          ...note,
          id: uuid(),
          createdAt: new Date().toISOString(),
        };
        const others = b.weeklyReviews.filter((w) => w.weekStart !== note.weekStart);
        return { ...b, weeklyReviews: [entry, ...others] };
      });
    },
    []
  );

  // Ref, não state: os atalhos só precisam ler o valor atual no momento da
  // tecla — guardar em state re-renderizaria o app a cada tarefa aberta.
  const lastOpenedTask = useRef<string | null>(null);
  const rememberOpenedTask = useCallback((id: string) => {
    lastOpenedTask.current = id;
  }, []);
  const getLastOpenedTaskId = useCallback(() => lastOpenedTask.current, []);

  const exportData = useCallback(() => JSON.stringify(board, null, 2), [board]);

  const importData = useCallback(
    (json: string, mode: "merge" | "replace"): MergeReport | null => {
      const validation = validateBackup(json);
      if (!validation.valid) return null;
      const incoming = migrateBoard(JSON.parse(json));
      let report: MergeReport = { topicsAdded: 0, tasksAdded: 0, duplicatesSkipped: 0 };
      setBoard((b) => {
        pushBackup(b, mode === "replace" ? "importação (substituir)" : "importação (mesclar)");
        if (mode === "replace") {
          report = {
            topicsAdded: incoming.topics.length,
            tasksAdded: incoming.tasks.length,
            duplicatesSkipped: 0,
          };
          return incoming;
        }
        const merged = mergeImportedData(b, incoming);
        report = merged.report;
        return merged.board;
      });
      return report;
    },
    []
  );

  const value = useMemo<AppContextValue>(
    () => ({
      topics: board.topics,
      tasks: board.tasks,
      board,
      ready,
      addTopic,
      updateTopic,
      archiveTopic,
      restoreTopic,
      deleteTopic,
      addTask,
      updateTask,
      setTaskStatus,
      trashTask,
      restoreTask,
      purgeTask,
      emptyTrash,
      archiveTask,
      duplicateTask,
      skipRecurrence,
      focusToday,
      toggleFocus,
      saveWeeklyReview,
      rememberOpenedTask,
      getLastOpenedTaskId,
      exportData,
      importData,
    }),
    [
      board,
      ready,
      addTopic,
      updateTopic,
      archiveTopic,
      restoreTopic,
      deleteTopic,
      addTask,
      updateTask,
      setTaskStatus,
      trashTask,
      restoreTask,
      purgeTask,
      emptyTrash,
      archiveTask,
      duplicateTask,
      skipRecurrence,
      focusToday,
      toggleFocus,
      saveWeeklyReview,
      rememberOpenedTask,
      getLastOpenedTaskId,
      exportData,
      importData,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
