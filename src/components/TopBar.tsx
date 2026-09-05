"use client";

import { TaskFilters, SortKey } from "@/lib/task-filters";
import { TaskEnergy, TaskPriority } from "@/lib/types";
import { ENERGY_LABEL, ENERGY_ORDER, PRIORITY_LABEL, PRIORITY_ORDER } from "@/lib/priority";
import { ZxpMark } from "./ZxpMark";

interface TopBarProps {
  title: string;
  onMenuClick: () => void;
  filters: TaskFilters;
  onChangeFilters: (filters: TaskFilters) => void;
  sortKey: SortKey;
  onChangeSort: (key: SortKey) => void;
  /**
   * "full" = quadro/mapa (busca, prioridade, energia, ordem, ocultar feitas).
   * "priority" = visão Hoje, onde ordenar/ocultar não fazem sentido porque
   * as seções já são semânticas — mas filtrar por prioridade faz.
   */
  filterMode: "full" | "priority" | "none";
  onOpenData: () => void;
  onOpenPalette: () => void;
}

const control =
  "min-h-[36px] rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs font-medium text-[var(--foreground)] outline-none focus:border-[var(--focus)] [color-scheme:dark]";

export function TopBar({
  title,
  onMenuClick,
  filters,
  onChangeFilters,
  sortKey,
  onChangeSort,
  filterMode,
  onOpenData,
  onOpenPalette,
}: TopBarProps) {
  const showFilters = filterMode !== "none";
  const full = filterMode === "full";
  return (
    <header className="shrink-0 border-b border-[var(--border)]">
      <div className="flex h-14 items-center justify-between gap-2 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={onMenuClick}
            className="-ml-1.5 min-h-[44px] rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--surface)] md:hidden"
            aria-label="Abrir menu"
          >
            ☰
          </button>
          {/* No celular a barra lateral fica escondida, e com ela sumia a
              única marca da tela. Aqui a logo aparece só no mobile — no
              desktop ela já está no topo da lateral, e repetir vira ruído. */}
          <span className="md:hidden">
            <ZxpMark size={24} />
          </span>
          <h2 className="truncate text-sm font-semibold text-[var(--foreground)]">{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onOpenPalette}
            className="min-h-[36px] rounded-md border border-[var(--border)] px-2.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface)]"
            aria-label="Buscar (Ctrl+K)"
          >
            Buscar
          </button>
          <button
            onClick={onOpenData}
            className="min-h-[36px] rounded-md px-2.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface)]"
          >
            Dados
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] px-4 py-2">
          <input
            value={filters.search ?? ""}
            onChange={(e) => onChangeFilters({ ...filters, search: e.target.value })}
            placeholder="Buscar..."
            aria-label="Buscar tarefas"
            className={`${control} w-32 sm:w-44`}
          />
          <select
            value={filters.priority ?? "all"}
            onChange={(e) =>
              onChangeFilters({
                ...filters,
                priority: e.target.value === "all" ? null : (e.target.value as TaskPriority),
              })
            }
            aria-label="Filtrar por prioridade"
            className={control}
          >
            <option value="all">Toda prioridade</option>
            {PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
          {full && (
            <>
              <select
                value={filters.energy ?? "all"}
                onChange={(e) =>
                  onChangeFilters({
                    ...filters,
                    energy: e.target.value === "all" ? null : (e.target.value as TaskEnergy),
                  })
                }
                aria-label="Filtrar por energia"
                className={control}
              >
                <option value="all">Toda energia</option>
                {ENERGY_ORDER.map((en) => (
                  <option key={en} value={en}>
                    {ENERGY_LABEL[en]}
                  </option>
                ))}
              </select>
              <select
                value={sortKey}
                onChange={(e) => onChangeSort(e.target.value as SortKey)}
                aria-label="Ordenar por"
                className={control}
              >
                <option value="priority">Prioridade</option>
                <option value="dueDate">Prazo</option>
                <option value="createdAt">Criação</option>
                <option value="updatedAt">Atualização</option>
              </select>
              <label className="flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 text-xs text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={filters.onlyOverdue ?? false}
                  onChange={(e) =>
                    onChangeFilters({ ...filters, onlyOverdue: e.target.checked })
                  }
                  className="accent-[var(--danger)]"
                />
                Só atrasadas
              </label>
              <label className="flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 text-xs text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={filters.hideDone ?? false}
                  onChange={(e) => onChangeFilters({ ...filters, hideDone: e.target.checked })}
                  className="accent-[var(--brand)]"
                />
                Ocultar concluídas
              </label>
            </>
          )}

          {filters.priority && (
            <button
              onClick={() => onChangeFilters({ ...filters, priority: null })}
              className="min-h-[36px] rounded-md px-2 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface)]"
            >
              Limpar filtro
            </button>
          )}
        </div>
      )}
    </header>
  );
}
