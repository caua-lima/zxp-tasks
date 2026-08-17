"use client";

import { useRef } from "react";
import { useApp } from "@/context/AppContext";
import { TaskPriority } from "@/lib/types";
import { PRIORITY_LABEL, PRIORITY_ORDER } from "@/lib/priority";

interface TopBarProps {
  title: string;
  onMenuClick: () => void;
  priorityFilter: TaskPriority | null;
  onChangePriorityFilter: (priority: TaskPriority | null) => void;
}

export function TopBar({
  title,
  onMenuClick,
  priorityFilter,
  onChangePriorityFilter,
}: TopBarProps) {
  const { exportData, importData } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleExport() {
    const blob = new Blob([exportData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zxp-tasks-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportClick() {
    fileRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const ok = importData(text);
    if (!ok) alert("Arquivo inválido.");
    e.target.value = "";
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
      <div className="flex items-center gap-2">
        <button
          onClick={onMenuClick}
          className="-ml-1.5 rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--surface)] md:hidden"
          aria-label="Abrir menu"
        >
          ☰
        </button>
        <h2 className="text-sm font-semibold text-[var(--foreground)]">{title}</h2>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={priorityFilter ?? "all"}
          onChange={(e) =>
            onChangePriorityFilter(
              e.target.value === "all" ? null : (e.target.value as TaskPriority)
            )
          }
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs font-medium text-[var(--foreground)] outline-none focus:border-[var(--focus)] [color-scheme:dark]"
          aria-label="Filtrar por prioridade"
        >
          <option value="all">Toda prioridade</option>
          {PRIORITY_ORDER.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={handleImportClick}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface)]"
        >
          Importar
        </button>
        <button
          onClick={handleExport}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface)]"
        >
          Exportar backup
        </button>
      </div>
    </header>
  );
}
