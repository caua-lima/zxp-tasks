"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { Task } from "@/lib/types";
import { entrarNaPilha, sairDaPilha, souOTopoDaPilha } from "./modal-stack";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

interface CommandPaletteProps {
  commands: Command[];
  onOpenTask: (task: Task) => void;
  onClose: () => void;
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select';

export function CommandPalette({ commands, onOpenTask, onClose }: CommandPaletteProps) {
  const { tasks } = useApp();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const desceuNoFundo = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<symbol | null>(null);
  if (idRef.current === null) idRef.current = Symbol("command-palette");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cmds = commands.filter((c) => !q || c.label.toLowerCase().includes(q));
    const matched: { id: string; label: string; hint?: string; run: () => void }[] = [...cmds];
    if (q.length >= 2) {
      for (const t of tasks) {
        if (t.deletedAt || t.archivedAt) continue;
        if (t.title.toLowerCase().includes(q)) {
          matched.push({
            id: `task-${t.id}`,
            label: t.title,
            hint: "Tarefa",
            run: () => onOpenTask(t),
          });
        }
      }
    }
    return matched.slice(0, 12);
  }, [commands, query, tasks, onOpenTask]);

  // Entrada/saída da pilha de diálogos empilháveis: só uma vez por montagem,
  // igual ao Modal — ver comentário em modal-stack.ts.
  useEffect(() => {
    const meuId = idRef.current as symbol;
    entrarNaPilha(meuId);
    return () => sairDaPilha(meuId);
  }, []);

  useEffect(() => {
    const meuId = idRef.current as symbol;

    function onKey(e: KeyboardEvent) {
      if (!souOTopoDaPilha(meuId)) return;
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, results.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        results[index]?.run();
        onClose();
      }
      if (e.key === "Tab" && dialogRef.current) {
        const items = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
        ).filter((el) => el.offsetParent !== null);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [results, index, onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 pt-[12vh]"
      // Mesma regra do Modal: soltar o clique no fundo só fecha se ele
      // também tiver começado no fundo.
      onPointerDown={(e) => {
        desceuNoFundo.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && desceuNoFundo.current) onClose();
        desceuNoFundo.current = false;
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
        className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--sidebar)] shadow-xl"
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          placeholder="Buscar tarefa ou comando..."
          aria-label="Buscar tarefa ou comando"
          className="w-full border-b border-[var(--border)] bg-transparent px-4 py-3 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 && (
            <li className="px-4 py-3 text-sm text-[var(--muted)]">Nada encontrado.</li>
          )}
          {results.map((item, i) => (
            <li key={item.id}>
              <button
                onMouseEnter={() => setIndex(i)}
                onClick={() => {
                  item.run();
                  onClose();
                }}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm ${
                  i === index
                    ? "bg-[var(--surface2)] text-[var(--foreground)]"
                    : "text-[var(--muted)]"
                }`}
              >
                <span className="truncate">{item.label}</span>
                {item.hint && <span className="ml-3 shrink-0 text-[11px]">{item.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
