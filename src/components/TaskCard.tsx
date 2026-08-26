"use client";

import { Task, Topic } from "@/lib/types";
import { PRIORITY_COLOR, PRIORITY_ICON, formatEstimate } from "@/lib/priority";
import { checklistProgress, isTaskOverdue } from "@/lib/task-utils";
import { formatDateShort } from "@/lib/date-utils";
import { formatBRL } from "@/lib/money";
import { linkHost, priorityLabel, topicKind } from "@/lib/wishlist";

interface TaskCardProps {
  task: Task;
  topic?: Topic;
  showTopic: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onMove?: (direction: -1 | 1) => void;
}

export function TaskCard({
  task,
  topic,
  showTopic,
  onClick,
  onDragStart,
  onMove,
}: TaskCardProps) {
  const overdue = isTaskOverdue(task);
  const { done, total } = checklistProgress(task);
  const kind = topicKind(topic);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${task.title}. ${priorityLabel(task.priority, kind)}${
        task.priceCents !== undefined ? `. ${formatBRL(task.priceCents)}` : ""
      }${overdue ? ". Atrasada" : ""}`}
      className="group relative min-h-[44px] cursor-pointer overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-3 pl-4 shadow-sm transition hover:border-[var(--brand)] focus:outline-none focus-visible:border-[var(--focus)] active:cursor-grabbing"
    >
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 h-full w-1"
        style={{ backgroundColor: PRIORITY_COLOR[task.priority] }}
      />

      {showTopic && topic && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: topic.color }}
            aria-hidden="true"
          />
          <span className="text-[11px] font-medium text-[var(--muted)]">{topic.name}</span>
        </div>
      )}

      <p className="text-sm font-medium leading-snug text-[var(--foreground)]">{task.title}</p>

      {task.description && (
        <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{task.description}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
        {task.priceCents !== undefined && (
          <span className="inline-flex items-center gap-1 rounded bg-[var(--brand)]/15 px-1.5 py-0.5 font-[family-name:var(--font-display)] tabular-nums text-[var(--brand)]">
            {formatBRL(task.priceCents)}
          </span>
        )}

        <span
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
          style={{
            color: PRIORITY_COLOR[task.priority],
            backgroundColor: `${PRIORITY_COLOR[task.priority]}1f`,
          }}
        >
          <span aria-hidden="true">{PRIORITY_ICON[task.priority]}</span>
          {priorityLabel(task.priority, kind)}
        </span>

        {task.dueDate && (
          <span
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 tabular-nums ${
              overdue
                ? "bg-[var(--danger-bg)] text-[var(--danger)]"
                : "bg-[var(--surface3)] text-[var(--muted)]"
            }`}
          >
            {overdue && <span aria-hidden="true">!</span>}
            {formatDateShort(task.dueDate)}
            {overdue && <span className="sr-only">atrasada</span>}
          </span>
        )}

        {total > 0 && (
          <span className="inline-flex items-center gap-1 rounded bg-[var(--surface3)] px-1.5 py-0.5 tabular-nums text-[var(--muted)]">
            ☑ {done}/{total}
          </span>
        )}

        {task.estimatedMinutes !== undefined && (
          <span className="inline-flex items-center gap-1 rounded bg-[var(--surface3)] px-1.5 py-0.5 tabular-nums text-[var(--muted)]">
            {formatEstimate(task.estimatedMinutes)}
          </span>
        )}

        {task.recurrence && (
          <span
            className="inline-flex items-center gap-1 rounded bg-[var(--surface3)] px-1.5 py-0.5 text-[var(--muted)]"
            title="Tarefa recorrente"
          >
            ↻
          </span>
        )}

        {task.store && (
          <span className="inline-flex items-center gap-1 rounded bg-[var(--surface3)] px-1.5 py-0.5 text-[var(--muted)]">
            {task.store}
          </span>
        )}

        {task.url && (
          // stopPropagation: o card inteiro abre o modal no clique — sem isso,
          // tocar no link abriria a loja E o modal por cima.
          <a
            href={task.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded bg-[var(--surface3)] px-1.5 py-0.5 text-[var(--info)] underline-offset-2 hover:underline"
          >
            {linkHost(task.url)} ↗
          </a>
        )}
      </div>

      {onMove && (
        <div className="mt-2 flex gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMove(-1);
            }}
            aria-label="Mover para a coluna anterior"
            className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted)] hover:bg-[var(--surface3)]"
          >
            ←
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMove(1);
            }}
            aria-label="Mover para a próxima coluna"
            className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted)] hover:bg-[var(--surface3)]"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
