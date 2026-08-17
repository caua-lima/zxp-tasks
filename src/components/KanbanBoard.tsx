"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { Task, TaskPriority, TaskStatus } from "@/lib/types";
import { TaskCard } from "./TaskCard";
import { TaskModal } from "./TaskModal";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "A fazer" },
  { status: "doing", label: "Fazendo" },
  { status: "done", label: "Feito" },
];

interface KanbanBoardProps {
  topicId: string | null;
  priorityFilter: TaskPriority | null;
}

export function KanbanBoard({ topicId, priorityFilter }: KanbanBoardProps) {
  const { topics, tasks, moveTask } = useApp();
  const [modalTask, setModalTask] = useState<Task | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>("todo");
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);

  const topicMap = useMemo(
    () => Object.fromEntries(topics.map((t) => [t.id, t])),
    [topics]
  );

  const visibleTasks = useMemo(
    () =>
      tasks
        .filter((t) => !topicId || t.topicId === topicId)
        .filter((t) => !priorityFilter || t.priority === priorityFilter),
    [tasks, topicId, priorityFilter]
  );

  function openNew(status: TaskStatus) {
    setModalTask(null);
    setNewTaskStatus(status);
    setModalOpen(true);
  }

  function openEdit(task: Task) {
    setModalTask(task);
    setModalOpen(true);
  }

  function handleDrop(e: React.DragEvent, status: TaskStatus) {
    e.preventDefault();
    setDragOverCol(null);
    const id = e.dataTransfer.getData("text/task-id");
    if (id) moveTask(id, status);
  }

  const noTopics = topics.length === 0;

  return (
    <div className="flex h-full flex-col">
      {noTopics ? (
        <div className="flex flex-1 items-center justify-center text-center text-sm text-[var(--muted)]">
          Crie um tópico na barra lateral pra começar a adicionar tarefas.
        </div>
      ) : (
        <div className="grid h-full flex-1 grid-cols-1 gap-4 overflow-x-auto p-4 sm:grid-cols-3">
          {COLUMNS.map((col) => {
            const colTasks = visibleTasks.filter((t) => t.status === col.status);
            return (
              <div
                key={col.status}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverCol(col.status);
                }}
                onDragLeave={() => setDragOverCol((c) => (c === col.status ? null : c))}
                onDrop={(e) => handleDrop(e, col.status)}
                className={`flex min-h-[200px] flex-col rounded-xl border bg-[var(--surface)] p-2 transition ${
                  dragOverCol === col.status
                    ? "border-[var(--brand)]"
                    : "border-[var(--border)]"
                }`}
              >
                <div className="mb-2 flex items-center justify-between px-1.5 pt-1">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">
                    {col.label}{" "}
                    <span className="text-[var(--muted)]">{colTasks.length}</span>
                  </h3>
                  <button
                    onClick={() => openNew(col.status)}
                    className="rounded px-1.5 text-lg leading-none text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-[var(--foreground)]"
                    title="Adicionar tarefa"
                  >
                    +
                  </button>
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  {colTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      topic={topicMap[task.topicId]}
                      showTopic={!topicId}
                      onClick={() => openEdit(task)}
                      onDragStart={(e) =>
                        e.dataTransfer.setData("text/task-id", task.id)
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
