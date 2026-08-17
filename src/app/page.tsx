"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppProvider, useApp } from "@/context/AppContext";
import { Sidebar, ViewKey } from "@/components/Sidebar";
import { KanbanBoard } from "@/components/KanbanBoard";
import { MindMap } from "@/components/MindMap";
import { TopBar } from "@/components/TopBar";
import { TodayView } from "@/components/today/TodayView";
import { WeeklyReview } from "@/components/review/WeeklyReview";
import { ProjectView } from "@/components/projects/ProjectView";
import { TaskModal } from "@/components/TaskModal";
import { DataPanel } from "@/components/shared/DataPanel";
import { CommandPalette, Command } from "@/components/shared/CommandPalette";
import { ShortcutsHelp } from "@/components/shared/ShortcutsHelp";
import { ToastProvider, useToast } from "@/components/shared/Toast";
import { SortKey, TaskFilters } from "@/lib/task-filters";
import { Task } from "@/lib/types";

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function HomeInner() {
  const { topics, tasks, ready, setTaskStatus, getLastOpenedTaskId } = useApp();
  const { showToast } = useToast();
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>("today");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filters, setFilters] = useState<TaskFilters>({});
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [quickTask, setQuickTask] = useState<Task | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);

  const pendingGoTo = useRef(false);

  const selectedTopic = topics.find((t) => t.id === selectedTopicId);

  const title = useMemo(() => {
    if (view === "today") return "Hoje";
    if (view === "review") return "Revisão semanal";
    if (view === "project") return selectedTopic?.name ?? "Projeto";
    if (!selectedTopicId) return "Todos os tópicos";
    return selectedTopic?.name ?? "Todos os tópicos";
  }, [view, selectedTopicId, selectedTopic]);

  const openNewTask = useCallback(() => {
    setQuickTask(null);
    setQuickOpen(true);
  }, []);

  const openTask = useCallback((task: Task) => {
    setQuickTask(task);
    setQuickOpen(true);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;

      // Sequência "g" + destino, no estilo dos apps de teclado.
      if (pendingGoTo.current) {
        pendingGoTo.current = false;
        const destino: Record<string, ViewKey> = {
          h: "today",
          k: "kanban",
          m: "mindmap",
          r: "review",
        };
        const alvo = destino[e.key.toLowerCase()];
        if (alvo) {
          e.preventDefault();
          setView(alvo);
          return;
        }
      }

      const key = e.key.toLowerCase();
      if (key === "g") {
        pendingGoTo.current = true;
        return;
      }
      if (key === "n") {
        e.preventDefault();
        openNewTask();
      } else if (key === "/") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
      } else if (key === "e" || key === "d") {
        const lastId = getLastOpenedTaskId();
        const task = lastId ? tasks.find((t) => t.id === lastId) : undefined;
        if (!task) return;
        e.preventDefault();
        if (key === "e") {
          openTask(task);
        } else if (task.status !== "done") {
          const previous = task.status;
          setTaskStatus(task.id, "done");
          showToast("Tarefa concluída.", () => setTaskStatus(task.id, previous));
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openNewTask, openTask, getLastOpenedTaskId, tasks, setTaskStatus, showToast]);

  const commands: Command[] = useMemo(
    () => [
      { id: "new", label: "Nova tarefa", hint: "N", run: openNewTask },
      { id: "today", label: "Ir para Hoje", hint: "G H", run: () => setView("today") },
      { id: "kanban", label: "Ir para Kanban", hint: "G K", run: () => setView("kanban") },
      { id: "mind", label: "Ir para Mapa mental", hint: "G M", run: () => setView("mindmap") },
      {
        id: "review",
        label: "Ir para Revisão semanal",
        hint: "G R",
        run: () => setView("review"),
      },
      { id: "data", label: "Abrir dados e backup", run: () => setDataOpen(true) },
      { id: "help", label: "Mostrar atalhos", hint: "?", run: () => setHelpOpen(true) },
      {
        id: "all-topics",
        label: "Ver todos os tópicos",
        run: () => {
          setSelectedTopicId(null);
          setView("kanban");
        },
      },
      ...topics
        .filter((t) => !t.archivedAt)
        .map((t) => ({
          id: `topic-${t.id}`,
          label: `Abrir projeto: ${t.name}`,
          hint: "Projeto",
          run: () => {
            setSelectedTopicId(t.id);
            setView("project");
          },
        })),
    ],
    [openNewTask, topics]
  );

  if (!ready) return null;

  const showFilters = view === "kanban" || view === "mindmap";

  return (
    <div className="flex h-dvh w-full">
      <Sidebar
        selectedTopicId={selectedTopicId}
        onSelectTopic={(id) => {
          setSelectedTopicId(id);
          // Clicar num tópico abre o projeto; "todos" volta pro quadro.
          setView(id ? "project" : "kanban");
        }}
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
          {view === "project" &&
            (selectedTopicId ? (
              <ProjectView topicId={selectedTopicId} />
            ) : (
              <div className="p-6 text-center text-sm text-[var(--muted)]">
                Escolha um tópico na barra lateral.
              </div>
            ))}
        </div>
      </main>

      {paletteOpen && (
        <CommandPalette
          commands={commands}
          onOpenTask={openTask}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {dataOpen && <DataPanel onClose={() => setDataOpen(false)} />}
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}

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
