"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { Task, TaskPriority, TaskStatus } from "@/lib/types";
import { PRIORITY_LABEL, PRIORITY_ORDER } from "@/lib/priority";

interface TaskModalProps {
  task: Task | null;
  defaultTopicId: string | null;
  defaultStatus: TaskStatus;
  onClose: () => void;
}

export function TaskModal({ task, defaultTopicId, defaultStatus, onClose }: TaskModalProps) {
  const { topics, addTask, updateTask, deleteTask } = useApp();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [date, setDate] = useState(task?.date ?? "");
  const [topicId, setTopicId] = useState(task?.topicId ?? defaultTopicId ?? topics[0]?.id ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "medium");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !topicId) return;
    if (task) {
      updateTask(task.id, {
        title,
        description,
        date: date || null,
        topicId,
        status,
        priority,
      });
    } else {
      addTask({ topicId, title, description, date: date || null, status, priority });
    }
    onClose();
  }

  function handleDelete() {
    if (task && confirm("Excluir esta tarefa?")) {
      deleteTask(task.id);
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--sidebar)] p-5 shadow-xl"
      >
        <h2 className="mb-4 text-base font-semibold text-[var(--foreground)]">
          {task ? "Editar tarefa" : "Nova tarefa"}
        </h2>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
              Título
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--focus)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
              Descrição
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--focus)]"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                Data
              </label>
              <input
                type="date"
                value={date ?? ""}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--focus)] [color-scheme:dark]"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--focus)] [color-scheme:dark]"
              >
                <option value="todo">A fazer</option>
                <option value="doing">Fazendo</option>
                <option value="done">Feito</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
              Prioridade
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--focus)] [color-scheme:dark]"
            >
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
              Tópico
            </label>
            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              required
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--focus)] [color-scheme:dark]"
            >
              {topics.length === 0 && <option value="">Crie um tópico primeiro</option>}
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div>
            {task && (
              <button
                type="button"
                onClick={handleDelete}
                className="text-sm font-medium text-[var(--danger)] hover:opacity-80"
              >
                Excluir
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface)]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!topicId}
              className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-40"
            >
              Salvar
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
