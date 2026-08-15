"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { Task, TaskStatus } from "@/lib/types";

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
      });
    } else {
      addTask({ topicId, title, description, date: date || null, status });
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-neutral-900"
      >
        <h2 className="mb-4 text-base font-semibold">
          {task ? "Editar tarefa" : "Nova tarefa"}
        </h2>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
              Título
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
              Descrição
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
                Data
              </label>
              <input
                type="date"
                value={date ?? ""}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
              >
                <option value="todo">A fazer</option>
                <option value="doing">Fazendo</option>
                <option value="done">Feito</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
              Tópico
            </label>
            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              required
              className="w-full rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
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
                className="text-sm font-medium text-red-500 hover:text-red-600"
              >
                Excluir
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!topicId}
              className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
            >
              Salvar
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
