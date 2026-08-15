"use client";

import { Task, Topic } from "@/lib/types";

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
      className="cursor-pointer rounded-lg border border-black/10 bg-white p-3 shadow-sm transition hover:shadow-md active:cursor-grabbing dark:border-white/10 dark:bg-white/[0.04]"
    >
      {showTopic && topic && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: topic.color }}
          />
          <span className="text-[11px] font-medium text-black/50 dark:text-white/50">
            {topic.name}
          </span>
        </div>
      )}
      <p className="text-sm font-medium leading-snug">{task.title}</p>
      {task.description && (
        <p className="mt-1 line-clamp-2 text-xs text-black/50 dark:text-white/50">
          {task.description}
        </p>
      )}
      {task.date && (
        <div
          className={`mt-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${
            overdue
              ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
              : "bg-black/5 text-black/60 dark:bg-white/10 dark:text-white/60"
          }`}
        >
          {formatDate(task.date)}
        </div>
      )}
    </div>
  );
}
