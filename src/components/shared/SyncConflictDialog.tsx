"use client";

import { useApp } from "@/context/AppContext";
import { Modal } from "./Modal";

/**
 * Só aparece uma vez, no primeiro login de uma sessão em que a nuvem já tem
 * dados diferentes dos que já existiam neste aparelho. Três saídas
 * explícitas — nenhuma decisão automática sobrescrevendo dado de verdade.
 */
export function SyncConflictDialog() {
  const { cloudConflict, resolveConflict } = useApp();
  if (!cloudConflict) return null;

  const cloudCount = cloudConflict.topics.length + cloudConflict.tasks.length;

  return (
    <Modal title="Encontramos dados na nuvem" onClose={() => resolveConflict("keep-cloud")}>
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          Esta conta já tem {cloudConflict.topics.length} tópicos e {cloudConflict.tasks.length}{" "}
          tarefas salvos na nuvem, e este aparelho também tem dados locais. Como continuar?
        </p>
        <div className="space-y-2">
          <button
            onClick={() => resolveConflict("merge")}
            className="w-full rounded-md bg-[var(--brand)] px-3 py-2 text-left text-sm font-medium text-[var(--accent-ink)] hover:bg-[var(--accent-hover)]"
          >
            Mesclar — mantém tudo dos dois lados (recomendado)
          </button>
          <button
            onClick={() => resolveConflict("keep-cloud")}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--surface2)]"
          >
            Usar só os dados da nuvem{cloudCount > 0 ? "" : " (vazia)"} — descarta o que está
            só neste aparelho
          </button>
          <button
            onClick={() => resolveConflict("replace-cloud")}
            className="w-full rounded-md border border-[var(--danger)] px-3 py-2 text-left text-sm text-[var(--danger)] hover:bg-[var(--surface2)]"
          >
            Usar só os dados deste aparelho — substitui o que está na nuvem
          </button>
        </div>
        <p className="text-[11px] text-[var(--muted)]">
          Um snapshot local é salvo automaticamente antes de mesclar.
        </p>
      </div>
    </Modal>
  );
}
