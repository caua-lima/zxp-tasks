"use client";

import { useState } from "react";
import { v4 as uuid } from "uuid";
import { useApp } from "@/context/AppContext";
import { ChecklistItem, Task, TaskEnergy, TaskPriority, TaskStatus } from "@/lib/types";
import {
  ENERGY_LABEL,
  ENERGY_ORDER,
  ESTIMATE_PRESETS,
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  formatEstimate,
} from "@/lib/priority";
import { Modal } from "./shared/Modal";
import { ConfirmDialog } from "./shared/ConfirmDialog";
import { useToast } from "./shared/Toast";

interface TaskModalProps {
  task: Task | null;
  defaultTopicId: string | null;
  defaultStatus: TaskStatus;
  onClose: () => void;
}

const field =
  "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--focus)] [color-scheme:dark]";
const label = "mb-1 block text-xs font-medium text-[var(--muted)]";

export function TaskModal({ task, defaultTopicId, defaultStatus, onClose }: TaskModalProps) {
  const {
    topics,
    addTask,
    updateTask,
    setTaskStatus,
    trashTask,
    archiveTask,
    duplicateTask,
  } = useApp();
  const { showToast } = useToast();

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [topicId, setTopicId] = useState(task?.topicId ?? defaultTopicId ?? topics[0]?.id ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "medium");
  const [energy, setEnergy] = useState<TaskEnergy | "">(task?.energy ?? "");
  const [estimate, setEstimate] = useState<number | "">(task?.estimatedMinutes ?? "");
  const [tagsText, setTagsText] = useState((task?.tags ?? []).join(", "));
  const [checklist, setChecklist] = useState<ChecklistItem[]>(task?.checklist ?? []);
  const [newItem, setNewItem] = useState("");
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [titleError, setTitleError] = useState(false);

  const done = checklist.filter((c) => c.completed).length;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setTitleError(true);
      return;
    }
    if (!topicId) return;
    const tags = tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const patch = {
      title: title.trim(),
      description,
      dueDate: dueDate || undefined,
      topicId,
      priority,
      energy: energy || undefined,
      estimatedMinutes: estimate === "" ? undefined : Number(estimate),
      tags,
      checklist,
    };
    if (task) {
      updateTask(task.id, patch);
      if (status !== task.status) setTaskStatus(task.id, status);
    } else {
      const created = addTask({ ...patch, status, dueDate: dueDate || null });
      updateTask(created.id, { checklist });
    }
    onClose();
  }

  function addChecklistItem() {
    const text = newItem.trim();
    if (!text) return;
    setChecklist((c) => [...c, { id: uuid(), label: text, completed: false }]);
    setNewItem("");
  }

  function toggleItem(id: string) {
    setChecklist((c) => {
      const next = c.map((i) => (i.id === id ? { ...i, completed: !i.completed } : i));
      if (next.length > 0 && next.every((i) => i.completed) && status !== "done") {
        // Sugere, nunca conclui sozinho.
        showToast("Checklist completo. Marque a tarefa como Feito se ela acabou.");
      }
      return next;
    });
  }

  return (
    <>
      <Modal
        title={task ? "Editar tarefa" : "Nova tarefa"}
        onClose={onClose}
        wide
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {task && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      duplicateTask(task.id);
                      showToast("Tarefa duplicada.");
                      onClose();
                    }}
                    className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface)]"
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      archiveTask(task.id);
                      showToast("Tarefa arquivada.");
                      onClose();
                    }}
                    className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface)]"
                  >
                    Arquivar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmTrash(true)}
                    className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--danger)] hover:bg-[var(--surface)]"
                  >
                    Mover para lixeira
                  </button>
                </>
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
                form="task-form"
                disabled={!topicId}
                className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-40"
              >
                Salvar
              </button>
            </div>
          </div>
        }
      >
        <form id="task-form" onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="task-title" className={label}>
              Título
            </label>
            <input
              id="task-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleError(false);
              }}
              aria-invalid={titleError}
              className={field}
            />
            {titleError && (
              <p className="mt-1 text-xs text-[var(--danger)]">
                A tarefa precisa de um título.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="task-desc" className={label}>
              Descrição
            </label>
            <textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={`${field} resize-none`}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="task-topic" className={label}>
                Tópico
              </label>
              <select
                id="task-topic"
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
                className={field}
              >
                {topics.length === 0 && <option value="">Crie um tópico primeiro</option>}
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="task-priority" className={label}>
                Prioridade
              </label>
              <select
                id="task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className={field}
              >
                {PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="task-due" className={label}>
                Prazo
              </label>
              <input
                id="task-due"
                type="date"
                value={dueDate ?? ""}
                onChange={(e) => setDueDate(e.target.value)}
                className={field}
              />
            </div>
            <div>
              <label htmlFor="task-status" className={label}>
                Status
              </label>
              <select
                id="task-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className={field}
              >
                <option value="todo">A fazer</option>
                <option value="doing">Fazendo</option>
                <option value="done">Feito</option>
              </select>
            </div>
          </div>

          <div>
            <span className={label}>Estimativa</span>
            <div className="flex flex-wrap gap-1.5">
              {ESTIMATE_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setEstimate(estimate === m ? "" : m)}
                  aria-pressed={estimate === m}
                  className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                    estimate === m
                      ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--accent-ink)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface)]"
                  }`}
                >
                  {formatEstimate(m)}
                </button>
              ))}
              <input
                type="number"
                min={1}
                placeholder="min"
                value={ESTIMATE_PRESETS.includes(Number(estimate)) ? "" : estimate}
                onChange={(e) => setEstimate(e.target.value === "" ? "" : Number(e.target.value))}
                aria-label="Estimativa personalizada em minutos"
                className={`${field} w-24 tabular-nums`}
              />
            </div>
          </div>

          <div>
            <span className={label}>Energia</span>
            <div className="flex flex-wrap gap-1.5">
              {ENERGY_ORDER.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEnergy(energy === e ? "" : e)}
                  aria-pressed={energy === e}
                  className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                    energy === e
                      ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--accent-ink)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface)]"
                  }`}
                >
                  {ENERGY_LABEL[e]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="task-tags" className={label}>
              Tags (separadas por vírgula)
            </label>
            <input
              id="task-tags"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              className={field}
            />
          </div>

          <div>
            <span className={label}>
              Checklist{" "}
              {checklist.length > 0 && (
                <span className="tabular-nums text-[var(--muted)]">
                  — {done}/{checklist.length} concluídas
                </span>
              )}
            </span>
            <ul className="mb-2 space-y-1">
              {checklist.map((item) => (
                <li key={item.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={() => toggleItem(item.id)}
                    id={`chk-${item.id}`}
                    className="accent-[var(--brand)]"
                  />
                  <label
                    htmlFor={`chk-${item.id}`}
                    className={`flex-1 text-sm ${
                      item.completed
                        ? "text-[var(--muted)] line-through"
                        : "text-[var(--foreground)]"
                    }`}
                  >
                    {item.label}
                  </label>
                  <button
                    type="button"
                    onClick={() => setChecklist((c) => c.filter((i) => i.id !== item.id))}
                    aria-label={`Remover item ${item.label}`}
                    className="px-1 text-[var(--muted)] hover:text-[var(--danger)]"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-1.5">
              <input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addChecklistItem();
                  }
                }}
                placeholder="Novo item..."
                aria-label="Novo item do checklist"
                className={field}
              />
              <button
                type="button"
                onClick={addChecklistItem}
                className="shrink-0 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--muted)] hover:bg-[var(--surface)]"
              >
                +
              </button>
            </div>
          </div>

          {task && (
            <p className="pt-1 text-[11px] text-[var(--muted)]">
              Criada em {new Date(task.createdAt).toLocaleString("pt-BR")} · Atualizada em{" "}
              {new Date(task.updatedAt).toLocaleString("pt-BR")}
              {task.completedAt &&
                ` · Concluída em ${new Date(task.completedAt).toLocaleString("pt-BR")}`}
            </p>
          )}
        </form>
      </Modal>

      {confirmTrash && task && (
        <ConfirmDialog
          title="Mover para lixeira"
          message="A tarefa vai para a lixeira e pode ser restaurada depois. Ela não é apagada agora."
          confirmLabel="Mover para lixeira"
          danger
          onCancel={() => setConfirmTrash(false)}
          onConfirm={() => {
            trashTask(task.id);
            showToast("Tarefa movida para a lixeira.");
            setConfirmTrash(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
