"use client";

import { Task, Topic } from "@/lib/types";
import { PRIORITY_COLOR, PRIORITY_ICON, formatEstimate } from "@/lib/priority";
import { isTaskOverdue } from "@/lib/task-utils";
import { formatDateShort } from "@/lib/date-utils";
import { priorityLabel, topicKind } from "@/lib/wishlist";
import { formatBRL } from "@/lib/money";

interface TaskRowProps {
  task: Task;
  topic?: Topic;
  onOpen: () => void;
  onComplete: () => void;
  actions?: React.ReactNode;
}

export function TaskRow({ task, topic, onOpen, onComplete, actions }: TaskRowProps) {
  const overdue = isTaskOverdue(task);
  const kind = topicKind(topic);
  return (
    <li className="flex min-h-[44px] items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2">
      <button
        onClick={onComplete}
        aria-label={`${kind === "wishlist" ? "Marcar como comprado" : "Concluir"}: ${task.title}`}
        className="h-5 w-5 shrink-0 rounded-full border-2 border-[var(--border)] transition hover:border-[var(--success)]"
      />
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium text-[var(--foreground)]">
          {task.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
          <span style={{ color: PRIORITY_COLOR[task.priority] }}>
            <span aria-hidden="true">{PRIORITY_ICON[task.priority]}</span>{" "}
            {priorityLabel(task.priority, kind)}
          </span>
          {topic && <span>· {topic.name}</span>}
          {task.dueDate && (
            <span className={`tabular-nums ${overdue ? "text-[var(--danger)]" : ""}`}>
              · {overdue ? "atrasada — " : ""}
              {formatDateShort(task.dueDate)}
            </span>
          )}
          {task.priceCents !== undefined && (
            <span className="tabular-nums text-[var(--brand)]">
              · {formatBRL(task.priceCents)}
            </span>
          )}
          {task.estimatedMinutes !== undefined && (
            <span className="tabular-nums">· {formatEstimate(task.estimatedMinutes)}</span>
          )}
        </span>
      </button>
      {actions}
    </li>
  );
}
