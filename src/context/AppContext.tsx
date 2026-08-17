"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { v4 as uuid } from "uuid";
import { Board, Task, TaskPriority, TaskStatus, Topic } from "@/lib/types";
import { loadBoard, saveBoard } from "@/lib/storage";
import { nextTopicColor } from "@/lib/colors";

interface AppContextValue {
  topics: Topic[];
  tasks: Task[];
  ready: boolean;
  addTopic: (name: string) => Topic;
  renameTopic: (id: string, name: string) => void;
  deleteTopic: (id: string) => void;
  addTask: (input: {
    topicId: string;
    title: string;
    description?: string;
    date?: string | null;
    status?: TaskStatus;
    priority?: TaskPriority;
  }) => Task;
  updateTask: (id: string, patch: Partial<Omit<Task, "id" | "createdAt">>) => void;
  deleteTask: (id: string) => void;
  moveTask: (id: string, status: TaskStatus) => void;
  exportData: () => string;
  importData: (json: string) => boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [board, setBoard] = useState<Board>({ topics: [], tasks: [] });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Reads from localStorage on mount; SSR has no access to it, so this
    // can't be done during the initial render without a hydration mismatch.
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

  const renameTopic = useCallback((id: string, name: string) => {
    setBoard((b) => ({
      ...b,
      topics: b.topics.map((t) => (t.id === id ? { ...t, name: name.trim() } : t)),
    }));
  }, []);

  const deleteTopic = useCallback((id: string) => {
    setBoard((b) => ({
      topics: b.topics.filter((t) => t.id !== id),
      tasks: b.tasks.filter((t) => t.topicId !== id),
    }));
  }, []);

  const addTask = useCallback(
    (input: {
      topicId: string;
      title: string;
      description?: string;
      date?: string | null;
      status?: TaskStatus;
      priority?: TaskPriority;
    }) => {
      const now = new Date().toISOString();
      const task: Task = {
        id: uuid(),
        topicId: input.topicId,
        title: input.title.trim(),
        description: input.description?.trim() ?? "",
        date: input.date ?? null,
        status: input.status ?? "todo",
        priority: input.priority ?? "medium",
        createdAt: now,
        updatedAt: now,
      };
      setBoard((b) => ({ ...b, tasks: [...b.tasks, task] }));
      return task;
    },
    []
  );

  const updateTask = useCallback(
    (id: string, patch: Partial<Omit<Task, "id" | "createdAt">>) => {
      setBoard((b) => ({
        ...b,
        tasks: b.tasks.map((t) =>
          t.id === id
            ? { ...t, ...patch, updatedAt: new Date().toISOString() }
            : t
        ),
      }));
    },
    []
  );

  const deleteTask = useCallback((id: string) => {
    setBoard((b) => ({ ...b, tasks: b.tasks.filter((t) => t.id !== id) }));
  }, []);

  const moveTask = useCallback(
    (id: string, status: TaskStatus) => {
      updateTask(id, { status });
    },
    [updateTask]
  );

  const exportData = useCallback(() => JSON.stringify(board, null, 2), [board]);

  const importData = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json) as Board;
      if (!Array.isArray(parsed.topics) || !Array.isArray(parsed.tasks)) return false;
      setBoard({ topics: parsed.topics, tasks: parsed.tasks });
      return true;
    } catch {
      return false;
    }
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      topics: board.topics,
      tasks: board.tasks,
      ready,
      addTopic,
      renameTopic,
      deleteTopic,
      addTask,
      updateTask,
      deleteTask,
      moveTask,
      exportData,
      importData,
    }),
    [
      board.topics,
      board.tasks,
      ready,
      addTopic,
      renameTopic,
      deleteTopic,
      addTask,
      updateTask,
      deleteTask,
      moveTask,
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
