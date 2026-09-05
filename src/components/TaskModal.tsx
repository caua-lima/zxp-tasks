"use client";

import { useEffect, useState } from "react";
import { v4 as uuid } from "uuid";
import { useApp } from "@/context/AppContext";
import {
  ChecklistItem,
  Recurrence,
  Task,
  TaskEnergy,
  TaskPriority,
  TaskStatus,
} from "@/lib/types";
import { describeRecurrence } from "@/lib/recurrence";
import { normalizeUrl, priorityLabel, statusLabels, topicKind } from "@/lib/wishlist";
import { centsToInput, formatBRL, parseValorComposto } from "@/lib/money";
import {
  ENERGY_LABEL,
  ENERGY_ORDER,
  ESTIMATE_PRESETS,
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
    skipRecurrence,
    rememberOpenedTask,
  } = useApp();
  const { showToast } = useToast();

  // Registra aqui (e não em cada tela) pra que os atalhos E/D funcionem
  // independente de onde a tarefa foi aberta: Kanban, Hoje, mapa ou projeto.
  useEffect(() => {
    if (task) rememberOpenedTask(task.id);
  }, [task, rememberOpenedTask]);

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [topicId, setTopicId] = useState(task?.topicId ?? defaultTopicId ?? topics[0]?.id ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "medium");
  const [energy, setEnergy] = useState<TaskEnergy | "">(task?.energy ?? "");
  const [estimate, setEstimate] = useState<number | "">(task?.estimatedMinutes ?? "");
  const [tagsText, setTagsText] = useState((task?.tags ?? []).join(", "));
  const [recurrence, setRecurrence] = useState<Recurrence | null>(task?.recurrence ?? null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(task?.checklist ?? []);
  const [newItem, setNewItem] = useState("");
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const [priceText, setPriceText] = useState(
    task?.priceParts ?? (task?.priceCents !== undefined ? centsToInput(task.priceCents) : "")
  );
  const [url, setUrl] = useState(task?.url ?? "");
  const [store, setStore] = useState(task?.store ?? "");

  const done = checklist.filter((c) => c.completed).length;

  // O tipo da pasta escolhida no formulário decide os rótulos e os campos —
  // trocar o tópico no meio da edição troca a cara do modal na hora.
  const selectedTopic = topics.find((t) => t.id === topicId);
  const kind = topicKind(selectedTopic);
  const wishlist = kind === "wishlist";
  const preco = priceText.trim() === "" ? null : parseValorComposto(priceText);
  const priceInvalid = priceText.trim() !== "" && preco === null;
  // Só vale mostrar a conta quando ela realmente foi uma conta.
  const precoTemPartes = (preco?.parts.length ?? 0) > 1;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setTitleError(true);
      return;
    }
    if (!topicId) return;
    if (priceInvalid) return;
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
      priceCents: preco?.cents,
      // Guarda o texto só quando ele é uma soma; um preço simples se
      // reconstrói sozinho a partir dos centavos.
      priceParts: precoTemPartes ? priceText.trim() : undefined,
      url: normalizeUrl(url),
      store: store.trim() || undefined,
      tags,
      checklist,
      recurrence: recurrence ?? undefined,
    };
    if (task) {
      updateTask(task.id, patch);
      if (status !== task.status) setTaskStatus(task.id, status);
    } else {
      const created = addTask({ ...patch, status, dueDate: dueDate || null });
      updateTask(created.id, { checklist, recurrence: recurrence ?? undefined });
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
                  {task.recurrence && task.status !== "done" && (
                    <button
                      type="button"
                      onClick={() => {
                        if (skipRecurrence(task.id)) {
                          showToast("Ocorrência pulada. O prazo foi para a próxima data.");
                          onClose();
                        }
                      }}
                      className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface)]"
                    >
                      Pular ocorrência
                    </button>
                  )}
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

          <div className={wishlist ? "hidden" : undefined}>
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
                {wishlist ? "Quanto quero" : "Prioridade"}
              </label>
              <select
                id="task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className={field}
              >
                {PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {priorityLabel(p, kind)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="task-due" className={label}>
                {wishlist ? "Comprar até (opcional)" : "Prazo"}
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
                <option value="todo">{statusLabels(kind).todo}</option>
                <option value="doing">{statusLabels(kind).doing}</option>
                <option value="done">{statusLabels(kind).done}</option>
              </select>
            </div>
          </div>

          {wishlist && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="task-price" className={label}>
                  Preço
                </label>
                <input
                  id="task-price"
                  placeholder="Ex: multimídia 1.2k + mão de obra 300"
                  value={priceText}
                  onChange={(e) => setPriceText(e.target.value)}
                  aria-invalid={priceInvalid}
                  aria-describedby="task-price-ajuda"
                  className={`${field} ${priceInvalid ? "border-[var(--danger)]" : ""}`}
                />
                <p id="task-price-ajuda" className="mt-1 text-[11px] text-[var(--muted)]">
                  {priceInvalid ? (
                    <span className="text-[var(--danger)]">
                      Não achei nenhum valor aí. Escreva algo como 1.500 ou 1.2k + 300.
                    </span>
                  ) : precoTemPartes ? (
                    <span className="text-[var(--foreground)]">
                      Total: <strong className="tabular-nums">{formatBRL(preco!.cents)}</strong>{" "}
                      ({preco!.parts.map((c) => formatBRL(c)).join(" + ")})
                    </span>
                  ) : (
                    "Pode somar as partes: 1.2k + 300. Escreva o que quiser no meio."
                  )}
                </p>
              </div>
              <div>
                <label htmlFor="task-store" className={label}>
                  Onde comprar
                </label>
                <input
                  id="task-store"
                  placeholder="Ex: Mercado Livre, loja do bairro"
                  value={store}
                  onChange={(e) => setStore(e.target.value)}
                  className={field}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="task-url" className={label}>
                  Link do produto
                </label>
                <input
                  id="task-url"
                  inputMode="url"
                  placeholder="Cole o link aqui"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className={field}
                />
              </div>
            </div>
          )}

          <div className={wishlist ? "hidden" : undefined}>
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

          <div className={wishlist ? "hidden" : undefined}>
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

          <div className={wishlist ? "hidden" : undefined}>
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

          <div className={wishlist ? "hidden" : undefined}>
            <label htmlFor="task-recurrence" className={label}>
              Recorrência
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                id="task-recurrence"
                value={recurrence?.frequency ?? "none"}
                onChange={(e) =>
                  setRecurrence(
                    e.target.value === "none"
                      ? null
                      : {
                          frequency: e.target.value as Recurrence["frequency"],
                          interval: recurrence?.interval ?? 1,
                          weekdays: recurrence?.weekdays,
                        }
                  )
                }
                className={`${field} w-auto`}
              >
                <option value="none">Não repete</option>
                <option value="daily">Diária</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensal</option>
              </select>
              {recurrence && (
                <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                  a cada
                  <input
                    type="number"
                    min={1}
                    value={recurrence.interval ?? 1}
                    onChange={(e) =>
                      setRecurrence({
                        ...recurrence,
                        interval: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    aria-label="Intervalo da recorrência"
                    className={`${field} w-16 tabular-nums`}
                  />
                </label>
              )}
            </div>

            {recurrence?.frequency === "weekly" && (
              <div className="mt-2 flex flex-wrap gap-1">
                {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((name, day) => {
                  const active = recurrence.weekdays?.includes(day) ?? false;
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        const current = recurrence.weekdays ?? [];
                        const next = active
                          ? current.filter((d) => d !== day)
                          : [...current, day];
                        setRecurrence({
                          ...recurrence,
                          weekdays: next.length > 0 ? next : undefined,
                        });
                      }}
                      className={`min-h-[32px] rounded-md border px-2 text-xs font-medium transition ${
                        active
                          ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--accent-ink)]"
                          : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface)]"
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            )}

            {recurrence && (
              <p className="mt-1.5 text-[11px] text-[var(--muted)]">
                {describeRecurrence(recurrence)}. A próxima ocorrência é criada quando você
                concluir esta.
              </p>
            )}
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
