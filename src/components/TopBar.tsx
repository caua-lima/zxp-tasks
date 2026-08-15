"use client";

import { useRef } from "react";
import { useApp } from "@/context/AppContext";

interface TopBarProps {
  title: string;
  onMenuClick: () => void;
}

export function TopBar({ title, onMenuClick }: TopBarProps) {
  const { exportData, importData } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleExport() {
    const blob = new Blob([exportData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tarefas-zxp-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-black/10 px-4 dark:border-white/10">
      <div className="flex items-center gap-2">
        <button
          onClick={onMenuClick}
          className="-ml-1.5 rounded-md p-1.5 text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10 md:hidden"
          aria-label="Abrir menu"
        >
          ☰
        </button>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="flex gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={handleImportClick}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
        >
          Importar
        </button>
        <button
          onClick={handleExport}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
        >
          Exportar backup
        </button>
      </div>
    </header>
  );
}
