"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppProvider, useApp } from "@/context/AppContext";
import { Sidebar, ViewKey } from "@/components/Sidebar";
import { KanbanBoard } from "@/components/KanbanBoard";
import { MindMap } from "@/components/MindMap";
import { TopBar } from "@/components/TopBar";
import { TodayView } from "@/components/today/TodayView";
import { WeeklyReview } from "@/components/review/WeeklyReview";
import { TaskModal } from "@/components/TaskModal";
import { DataPanel } from "@/components/shared/DataPanel";
import { CommandPalette, Command } from "@/components/shared/CommandPalette";
import { ToastProvider } from "@/components/shared/Toast";
import { SortKey, TaskFilters } from "@/lib/task-filters";
import { Task } from "@/lib/types";

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function HomeInner() {
  const { topics, ready } = useApp();
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>("today");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filters, setFilters] = useState<TaskFilters>({});
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [quickTask, setQuickTask] = useState<Task | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);

  const title = useMemo(() => {
    if (view === "today") return "Hoje";
    if (view === "review") return "Revisão semanal";
    if (!selectedTopicId) return "Todos os tópicos";
    return topics.find((t) => t.id === selectedTopicId)?.name ?? "Todos os tópicos";
  }, [view, selectedTopicId, topics]);

  const openNewTask = useCallback(() => {
    setQuickTask(null);
    setQuickOpen(true);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (isTyping(e.target)) return;
      if (e.key === "n") {
        e.preventDefault();
        openNewTask();
      }
      if (e.key === "/") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openNewTask]);

  const commands: Command[] = useMemo(
    () => [
      { id: "new", label: "Nova tarefa", hint: "N", run: openNewTask },
      { id: "today", label: "Ir para Hoje", run: () => setView("today") },
      { id: "kanban", label: "Ir para Kanban", run: () => setView("kanban") },
      { id: "mind", label: "Ir para Mapa mental", run: () => setView("mindmap") },
      { id: "review", label: "Ir para Revisão semanal", run: () => setView("review") },
      { id: "data", label: "Abrir dados e backup", run: () => setDataOpen(true) },
      {
        id: "all-topics",
        label: "Ver todos os tópicos",
        run: () => setSelectedTopicId(null),
      },
    ],
    [openNewTask]
  );

  if (!ready) return null;

  const showFilters = view === "kanban" || view === "mindmap";

  return (
    <div className="flex h-dvh w-full">
      <Sidebar
        selectedTopicId={selectedTopicId}
        onSelectTopic={setSelectedTopicId}
        view={view}
        onChangeView={setView}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={title}
          onMenuClick={() => setSidebarOpen(true)}
          filters={filters}
          onChangeFilters={setFilters}
          sortKey={sortKey}
          onChangeSort={setSortKey}
          showFilters={showFilters}
          onOpenData={() => setDataOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {view === "today" && <TodayView onOpenKanban={() => setView("kanban")} />}
          {view === "kanban" && (
            <KanbanBoard topicId={selectedTopicId} filters={filters} sortKey={sortKey} />
          )}
          {view === "mindmap" && <MindMap topicId={selectedTopicId} filters={filters} />}
          {view === "review" && <WeeklyReview />}
        </div>
      </main>

      {paletteOpen && (
        <CommandPalette
          commands={commands}
          onOpenTask={(task) => {
            setQuickTask(task);
            setQuickOpen(true);
          }}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {dataOpen && <DataPanel onClose={() => setDataOpen(false)} />}

      {quickOpen && (
        <TaskModal
          task={quickTask}
          defaultTopicId={selectedTopicId}
          defaultStatus="todo"
          onClose={() => setQuickOpen(false)}
        />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <AppProvider>
      <ToastProvider>
        <HomeInner />
      </ToastProvider>
    </AppProvider>
  );
}
