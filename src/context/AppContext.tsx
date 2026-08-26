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
  TaskStatus,
  Topic,
  TopicKind,
  WeeklyReviewNote,
  emptyBoard,
} from "@/lib/types";
import { loadBoard, pushBackup, saveBoard } from "@/lib/storage";
import { nextTopicColor } from "@/lib/colors";
import { migrateBoard } from "@/lib/task-migrations";
import { mergeImportedData, MergeReport, validateBackup } from "@/lib/task-backup";
import { createRecurringTask, skipOccurrence } from "@/lib/recurrence";
import { todayISO } from "@/lib/date-utils";
import { useAuth } from "./AuthContext";
import { pushBoardToCloud, subscribeToCloudBoard } from "@/lib/cloud-sync";
import { createTask, NewTaskInput } from "@/lib/task-factory";

export type { NewTaskInput };

export type SyncStatus = "offline" | "syncing" | "synced" | "error";

interface AppContextValue {
  topics: Topic[];
  tasks: Task[];
  board: Board;
  ready: boolean;
  addTopic: (name: string, kind?: TopicKind) => Topic;
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
  /** Sincronização com a nuvem (opcional — só ativa com usuário logado). */
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  /**
   * Não nulo só na primeira sincronização de um login, quando a nuvem já
   * tem dados diferentes dos locais — precisa de uma decisão explícita
   * antes de qualquer coisa ser sobrescrita.
   */
  cloudConflict: Board | null;
  resolveConflict: (choice: "keep-cloud" | "merge" | "replace-cloud") => void;
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

  // ── Sincronização com a nuvem (opcional) ──────────────────────────────
  const { user } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("offline");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [cloudConflict, setCloudConflict] = useState<Board | null>(null);
  // Só true depois que a primeira reconciliação de UM login termina — antes
  // disso, o efeito de push não pode rodar, senão sobrescreveria a nuvem
  // com o board local antes de perguntar o que fazer com o conflito.
  const initialSyncDone = useRef(false);
  // Board local no instante em que a nuvem respondeu, capturado fora do
  // React state pra `resolveConflict` não depender de closure velha do
  // `board` (o efeito de assinatura só roda de novo quando `user` muda).
  const localBoardAtConflict = useRef<Board | null>(null);

  useEffect(() => {
    if (!user) {
      // Sincroniza o estado local com o estado externo (login) — o caso que
      // a própria regra recomenda resolver com um efeito, não com derivação.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSyncStatus("offline");
      setCloudConflict(null);
      initialSyncDone.current = false;
      return;
    }

    setSyncStatus("syncing");
    const unsubscribe = subscribeToCloudBoard(
      user.uid,
      (cloud) => {
        if (!initialSyncDone.current) {
          initialSyncDone.current = true;
          if (cloud === "empty") {
            // Conta nova: semeia a nuvem com o que já existe neste aparelho.
            setBoard((current) => {
              pushBoardToCloud(user.uid, current).catch(() => {});
              return current;
            });
            setSyncStatus("synced");
            setLastSyncedAt(new Date().toISOString());
            return;
          }
          setBoard((current) => {
            const localHasData = current.topics.length > 0 || current.tasks.length > 0;
            if (!localHasData) {
              setSyncStatus("synced");
              setLastSyncedAt(new Date().toISOString());
              return cloud;
            }
            // Nuvem e local têm dado de verdade — pergunta antes de decidir.
            localBoardAtConflict.current = current;
            setCloudConflict(cloud);
            setSyncStatus("synced");
            return current;
          });
          return;
        }
        setBoard(cloud === "empty" ? emptyBoard() : cloud);
        setSyncStatus("synced");
        setLastSyncedAt(new Date().toISOString());
      },
      () => setSyncStatus("error")
    );

    return () => {
      unsubscribe();
      initialSyncDone.current = false;
    };
  }, [user]);

  useEffect(() => {
    if (!ready || !user || !initialSyncDone.current || cloudConflict) return;
    setSyncStatus("syncing");
    const timeout = setTimeout(() => {
      pushBoardToCloud(user.uid, board)
        .then(() => {
          setSyncStatus("synced");
          setLastSyncedAt(new Date().toISOString());
        })
        .catch(() => setSyncStatus("error"));
    }, 1200);
    return () => clearTimeout(timeout);
  }, [board, ready, user, cloudConflict]);

  const resolveConflict = useCallback(
    (choice: "keep-cloud" | "merge" | "replace-cloud") => {
      if (!cloudConflict) return;
      const localBoard = localBoardAtConflict.current ?? board;
      // Snapshot local antes de qualquer escolha que descarta um dos lados —
      // "keep-cloud" descarta o local, "replace-cloud" descarta a nuvem (só
      // temos essa cópia da nuvem agora, em memória; depois de sobrescrever
      // não tem mais como recuperar pelo app).
      if (choice === "keep-cloud") {
        pushBackup(localBoard, "conflito de sincronização (usar nuvem)");
        setBoard(cloudConflict);
      } else if (choice === "merge") {
        pushBackup(localBoard, "conflito de sincronização (mesclar)");
        setBoard(mergeImportedData(localBoard, cloudConflict).board);
      } else {
        pushBackup(cloudConflict, "conflito de sincronização (usar este aparelho)");
      }
      setCloudConflict(null);
    },
    [cloudConflict, board]
  );

  const addTopic = useCallback(
    (name: string, kind: TopicKind = "project") => {
      const topic: Topic = {
        id: uuid(),
        name: name.trim(),
        color: nextTopicColor(board.topics.length),
        kind,
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
    const task = createTask(input, uuid(), new Date().toISOString());
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
      syncStatus,
      lastSyncedAt,
      cloudConflict,
      resolveConflict,
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
      syncStatus,
      lastSyncedAt,
      cloudConflict,
      resolveConflict,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
