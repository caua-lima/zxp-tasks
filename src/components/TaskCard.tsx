"use client";

import { Task, Topic } from "@/lib/types";
import { PRIORITY_COLOR, PRIORITY_LABEL } from "@/lib/priority";

interface TaskCardProps {
  task: Task;
  topic?: Topic;
  showTopic: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
}

function formatDate(date: string | null) {
  if (!date) return null;
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function isOverdue(date: string | null, status: string) {
  if (!date || status === "done") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(date + "T00:00:00") < today;
}

export function TaskCard({ task, topic, showTopic, onClick, onDragStart }: TaskCardProps) {
  const overdue = isOverdue(task.date, task.status);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-3 shadow-sm transition hover:border-[var(--brand)] active:cursor-grabbing"
      style={{ borderLeft: `3px solid ${PRIORITY_COLOR[task.priority]}` }}
    >
      {showTopic && topic && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: topic.color }}
          />
          <span className="text-[11px] font-medium text-[var(--muted)]">
            {topic.name}
          </span>
        </div>
      )}
      <p className="text-sm font-medium leading-snug text-[var(--foreground)]">{task.title}</p>
      {task.description && (
        <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">
          {task.description}
        </p>
      )}
      {(task.date || task.priority !== "low") && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {task.date && (
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                overdue
                  ? "bg-[var(--danger-bg)] text-[var(--danger)]"
                  : "bg-[var(--surface3)] text-[var(--muted)]"
              }`}
            >
              {formatDate(task.date)}
            </span>
          )}
          {task.priority !== "low" && (
            <span
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium"
              style={{
                color: PRIORITY_COLOR[task.priority],
                backgroundColor: `${PRIORITY_COLOR[task.priority]}22`,
              }}
            >
              {PRIORITY_LABEL[task.priority]}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
