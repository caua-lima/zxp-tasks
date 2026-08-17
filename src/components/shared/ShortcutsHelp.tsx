"use client";

import { Modal } from "./Modal";

const SHORTCUTS: { keys: string; description: string }[] = [
  { keys: "Ctrl/Cmd + K", description: "Abrir busca e comandos" },
  { keys: "/", description: "Abrir busca" },
  { keys: "N", description: "Nova tarefa" },
  { keys: "E", description: "Editar a última tarefa aberta" },
  { keys: "D", description: "Concluir a última tarefa aberta" },
  { keys: "G depois H", description: "Ir para Hoje" },
  { keys: "G depois K", description: "Ir para o Kanban" },
  { keys: "?", description: "Mostrar esta ajuda" },
  { keys: "Esc", description: "Fechar modal, menu ou busca" },
];

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Atalhos de teclado" onClose={onClose}>
      <dl className="space-y-2">
        {SHORTCUTS.map((s) => (
          <div key={s.keys} className="flex items-center justify-between gap-4">
            <dt className="text-sm text-[var(--muted)]">{s.description}</dt>
            <dd>
              <kbd className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1 font-[family-name:var(--font-display)] text-[11px] text-[var(--foreground)]">
                {s.keys}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[11px] text-[var(--muted)]">
        Os atalhos ficam desativados enquanto você digita em um campo.
      </p>
    </Modal>
  );
}
