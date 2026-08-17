"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { Task, TaskStatus } from "@/lib/types";
import { filterTasks, SortKey, TaskFilters, sortTasks } from "@/lib/task-filters";
import { TaskCard } from "./TaskCard";
import { TaskModal } from "./TaskModal";
import { useToast } from "./shared/Toast";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "A fazer" },
  { status: "doing", label: "Fazendo" },
  { status: "done", label: "Feito" },
];

interface KanbanBoardProps {
  topicId: string | null;
  filters: TaskFilters;
  sortKey: SortKey;
}

export function KanbanBoard({ topicId, filters, sortKey }: KanbanBoardProps) {
  const { topics, tasks, setTaskStatus } = useApp();
  const { showToast } = useToast();
  const [modalTask, setModalTask] = useState<Task | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>("todo");
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);
  const [mobileTab, setMobileTab] = useState<TaskStatus>("todo");

  const topicMap = useMemo(
    () => Object.fromEntries(topics.map((t) => [t.id, t])),
    [topics]
  );

  const visible = useMemo(
    () => sortTasks(filterTasks(tasks, { ...filters, topicId }), sortKey),
    [tasks, filters, topicId, sortKey]
  );

  function moveTo(task: Task, status: TaskStatus) {
    const previous = task.status;
    setTaskStatus(task.id, status);
    if (status === "done") {
      showToast("Tarefa concluída.", () => setTaskStatus(task.id, previous));
    }
  }

  function handleDrop(e: React.DragEvent, status: TaskStatus) {
    e.preventDefault();
    setDragOverCol(null);
    const id = e.dataTransfer.getData("text/task-id");
    const task = tasks.find((t) => t.id === id);
    if (task) moveTo(task, status);
  }

  function moveByOffset(task: Task, direction: -1 | 1) {
    const i = COLUMNS.findIndex((c) => c.status === task.status);
    const next = COLUMNS[i + direction];
    if (next) moveTo(task, next.status);
  }

  if (topics.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[var(--muted)]">
        Crie um tópico na barra lateral pra começar a adicionar tarefas.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Mobile: abas por status em vez de três colunas espremidas. */}
      <div className="flex gap-1 border-b border-[var(--border)] p-2 sm:hidden">
        {COLUMNS.map((col) => {
          const count = visible.filter((t) => t.status === col.status).length;
          return (
            <button
              key={col.status}
              onClick={() => setMobileTab(col.status)}
              aria-pressed={mobileTab === col.status}
              className={`min-h-[44px] flex-1 rounded-md px-2 text-xs font-medium ${
                mobileTab === col.status
                  ? "bg-[var(--brand)] text-[var(--accent-ink)]"
                  : "bg-[var(--surface)] text-[var(--muted)]"
              }`}
            >
              {col.label} <span className="tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 sm:grid-cols-3">
        {COLUMNS.map((col) => {
          const colTasks = visible.filter((t) => t.status === col.status);
          return (
            <section
              key={col.status}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCol(col.status);
              }}
              onDragLeave={() => setDragOverCol((c) => (c === col.status ? null : c))}
              onDrop={(e) => handleDrop(e, col.status)}
              aria-label={col.label}
              className={`flex min-h-[200px] flex-col rounded-xl border bg-[var(--surface)] p-2 transition ${
                dragOverCol === col.status ? "border-[var(--brand)]" : "border-[var(--border)]"
              } ${mobileTab === col.status ? "" : "hidden sm:flex"}`}
            >
              <div className="mb-2 flex items-center justify-between px-1.5 pt-1">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">
                  {col.label}{" "}
                  <span className="tabular-nums text-[var(--muted)]">{colTasks.length}</span>
                </h3>
                <button
                  onClick={() => {
                    setModalTask(null);
                    setNewTaskStatus(col.status);
                    setModalOpen(true);
                  }}
                  aria-label={`Adicionar tarefa em ${col.label}`}
                  className="min-h-[32px] rounded px-2 text-lg leading-none text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-[var(--foreground)]"
                >
                  +
                </button>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                {colTasks.length === 0 && (
                  <p className="px-1.5 py-3 text-xs text-[var(--muted)]">Nada aqui.</p>
                )}
                {colTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    topic={topicMap[task.topicId]}
                    showTopic={!topicId}
                    onClick={() => {
                      setModalTask(task);
                      setModalOpen(true);
                    }}
                    onDragStart={(e) => e.dataTransfer.setData("text/task-id", task.id)}
                    onMove={(dir) => moveByOffset(task, dir)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {modalOpen && (
        <TaskModal
          task={modalTask}
          defaultTopicId={topicId}
          defaultStatus={newTaskStatus}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
