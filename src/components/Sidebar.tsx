"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { ZxpMark } from "./ZxpMark";
import { calculateTopicProgress } from "@/lib/task-utils";
import { isWishlist, wishlistTotals } from "@/lib/wishlist";
import { formatBRL } from "@/lib/money";
import { TopicKind } from "@/lib/types";
import { ConfirmDialog } from "./shared/ConfirmDialog";
import { useToast } from "./shared/Toast";

const SYNC_DOT_COLOR: Record<string, string> = {
  offline: "var(--muted)",
  syncing: "var(--warning)",
  synced: "var(--success)",
  error: "var(--danger)",
};

export type ViewKey =
  | "schedule"
  | "goals"
  | "today"
  | "kanban"
  | "mindmap"
  | "review"
  | "project";

/**
 * O app tem duas partes, e é isso que a barra mostra: o Cronograma (o dia,
 * com cronômetro) e os Objetivos (o que quero conquistar/comprar). As telas
 * antigas continuam existindo, mas atrás de "Mais" — fora do caminho.
 */
const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "schedule", label: "Cronograma" },
  { key: "goals", label: "Objetivos" },
];

const EXTRA_VIEWS: { key: ViewKey; label: string }[] = [
  { key: "today", label: "Hoje (foco)" },
  { key: "kanban", label: "Kanban" },
  { key: "mindmap", label: "Mapa mental" },
  { key: "review", label: "Revisão semanal" },
];

interface SidebarProps {
  selectedTopicId: string | null;
  onSelectTopic: (id: string | null) => void;
  view: ViewKey;
  onChangeView: (view: ViewKey) => void;
  open: boolean;
  onClose: () => void;
  onOpenAccount: () => void;
}

export function Sidebar({
  selectedTopicId,
  onSelectTopic,
  view,
  onChangeView,
  open,
  onClose,
  onOpenAccount,
}: SidebarProps) {
  const { topics, tasks, addTopic, updateTopic, deleteTopic, syncStatus } = useApp();
  const { user, syncAvailable } = useAuth();
  const { showToast } = useToast();
  const [newTopic, setNewTopic] = useState("");
  const [newTopicKind, setNewTopicKind] = useState<TopicKind>("project");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showExtras, setShowExtras] = useState(false);

  const activeTopics = topics.filter((t) => !t.archivedAt);
  const archivedTopics = topics.filter((t) => t.archivedAt);
  // Duas naturezas diferentes de pasta, e por isso duas seções: coisas de
  // trabalho/projeto e coisas que quero conquistar/comprar. Misturar as
  // duas numa lista só faz "comprar uma roupa" competir visualmente com
  // "Mentoria RUMO", que não é a mesma decisão.
  const objetivos = activeTopics.filter((t) => !isWishlist(t));
  const conquistas = activeTopics.filter((t) => isWishlist(t));

  function handleAddTopic(e: React.FormEvent) {
    e.preventDefault();
    const name = newTopic.trim();
    if (!name) return;
    const topic = addTopic(name, newTopicKind);
    setNewTopic("");
    onSelectTopic(topic.id);
  }

  function commitEdit() {
    if (editingId && editingName.trim()) updateTopic(editingId, { name: editingName.trim() });
    setEditingId(null);
  }

  function selectTopic(id: string | null) {
    onSelectTopic(id);
    onClose();
  }

  function changeView(v: ViewKey) {
    onChangeView(v);
    onClose();
  }

  const openCount = tasks.filter((t) => !t.deletedAt && !t.archivedAt).length;
  const pendingDelete = confirmDelete
    ? topics.find((t) => t.id === confirmDelete)
    : undefined;
  const pendingDeleteActive = confirmDelete
    ? tasks.filter((t) => t.topicId === confirmDelete && !t.deletedAt && t.status !== "done").length
    : 0;

  return (
    <>
      {open && <div onClick={onClose} className="fixed inset-0 z-30 bg-black/60 md:hidden" />}
      <aside
        className={`${open ? "flex" : "hidden"} fixed inset-y-0 left-0 z-40 h-full w-72 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)] md:static md:flex md:w-64`}
      >
        <div className="flex items-start justify-between p-4">
          <div className="flex items-center gap-2.5">
            <ZxpMark size={30} radius={7} />
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-base font-semibold text-[var(--foreground)]">
                ZXP Tasks
              </h1>
              <p className="text-xs text-[var(--muted)]">
                <span className="tabular-nums">{openCount}</span> tarefas ativas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] rounded-md p-1 text-[var(--muted)] hover:bg-[var(--surface2)] md:hidden"
            aria-label="Fechar menu"
          >
            ×
          </button>
        </div>

        <nav className="space-y-0.5 px-3 pb-3">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => changeView(v.key)}
              aria-current={view === v.key ? "page" : undefined}
              className={`min-h-[40px] w-full rounded-md px-2.5 text-left text-sm font-medium transition ${
                view === v.key
                  ? "bg-[var(--brand)] text-[var(--accent-ink)]"
                  : "text-[var(--muted)] hover:bg-[var(--surface)]"
              }`}
            >
              {v.label}
            </button>
          ))}

          <button
            onClick={() => setShowExtras((v) => !v)}
            aria-expanded={showExtras}
            className="min-h-[40px] w-full rounded-md px-2.5 text-left text-xs text-[var(--muted)] hover:bg-[var(--surface)]"
          >
            {showExtras ? "− Mais" : "+ Mais"}
          </button>
          {showExtras &&
            EXTRA_VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => changeView(v.key)}
                aria-current={view === v.key ? "page" : undefined}
                className={`min-h-[36px] w-full rounded-md pl-5 pr-2.5 text-left text-xs transition ${
                  view === v.key
                    ? "bg-[var(--surface2)] text-[var(--foreground)]"
                    : "text-[var(--muted)] hover:bg-[var(--surface)]"
                }`}
              >
                {v.label}
              </button>
            ))}
        </nav>

        <div className="flex-1 overflow-y-auto border-t border-[var(--border)] px-3 pt-3">
          <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Objetivos
          </p>
          <button
            onClick={() => selectTopic(null)}
            className={`mb-1 min-h-[40px] w-full rounded-md px-2 text-left text-sm transition ${
              selectedTopicId === null
                ? "bg-[var(--surface2)] text-[var(--foreground)]"
                : "text-[var(--muted)] hover:bg-[var(--surface)]"
            }`}
          >
            Ver todos
          </button>

          {objetivos.length > 0 && (
            <div className="space-y-0.5 pb-2">
              {objetivos.map((topic) => {
              const progress = calculateTopicProgress(tasks, topic.id);
              const wishlist = isWishlist(topic);
              const totals = wishlist ? wishlistTotals(tasks, topic.id) : null;
              return (
                <div
                  key={topic.id}
                  className={`group rounded-md px-2 py-2 transition ${
                    selectedTopicId === topic.id
                      ? "bg-[var(--surface2)]"
                      : "hover:bg-[var(--surface)]"
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: topic.color }}
                      aria-hidden="true"
                    />
                    {editingId === topic.id ? (
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        aria-label={`Renomear ${topic.name}`}
                        className="min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--focus)]"
                      />
                    ) : (
                      <button
                        onClick={() => selectTopic(topic.id)}
                        onDoubleClick={() => {
                          setEditingId(topic.id);
                          setEditingName(topic.name);
                        }}
                        className={`min-w-0 flex-1 truncate text-left ${
                          selectedTopicId === topic.id
                            ? "text-[var(--foreground)]"
                            : "text-[var(--muted)]"
                        }`}
                        title="Clique duplo para renomear"
                      >
                        {topic.name}
                      </button>
                    )}
                    <button
                      onClick={() => setConfirmDelete(topic.id)}
                      aria-label={`Excluir tópico ${topic.name}`}
                      className="hidden shrink-0 px-1 text-[var(--muted)] hover:text-[var(--danger)] group-hover:block"
                    >
                      ×
                    </button>
                  </div>
                  {totals ? (
                    totals.itemsWanted + totals.itemsBought > 0 && (
                      <div className="mt-1 flex items-center gap-2 pl-4.5 text-[10px]">
                        <span className="tabular-nums text-[var(--brand)]">
                          {formatBRL(totals.wantedCents)}
                        </span>
                        <span className="tabular-nums text-[var(--muted)]">
                          {totals.itemsWanted}{" "}
                          {totals.itemsWanted === 1 ? "item" : "itens"}
                        </span>
                        {totals.itemsBought > 0 && (
                          <span className="tabular-nums text-[var(--success)]">
                            {totals.itemsBought} ✓
                          </span>
                        )}
                      </div>
                    )
                  ) : (
                    progress.total > 0 && (
                      <div className="mt-1.5 flex items-center gap-2 pl-4.5">
                        <div
                          className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--surface3)]"
                          role="progressbar"
                          aria-valuenow={progress.percent}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Progresso de ${topic.name}`}
                        >
                          <div
                            className="h-full rounded-full bg-[var(--success)]"
                            style={{ width: `${progress.percent}%` }}
                          />
                        </div>
                        <span className="shrink-0 tabular-nums text-[10px] text-[var(--muted)]">
                          {progress.done}/{progress.total}
                        </span>
                        {progress.overdue > 0 && (
                          <span
                            className="shrink-0 tabular-nums text-[10px] text-[var(--danger)]"
                            title={`${progress.overdue} atrasadas`}
                          >
                            !{progress.overdue}
                          </span>
                        )}
                      </div>
                    )
                  )}
                </div>
              );
            })}
            </div>
          )}

          {conquistas.length > 0 && (
            <>
              <p className="mb-1.5 mt-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                Conquistas pessoais
              </p>
              <div className="space-y-0.5 pb-3">
                {conquistas.map((topic) => {
              const progress = calculateTopicProgress(tasks, topic.id);
              const wishlist = isWishlist(topic);
              const totals = wishlist ? wishlistTotals(tasks, topic.id) : null;
              return (
                <div
                  key={topic.id}
                  className={`group rounded-md px-2 py-2 transition ${
                    selectedTopicId === topic.id
                      ? "bg-[var(--surface2)]"
                      : "hover:bg-[var(--surface)]"
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: topic.color }}
                      aria-hidden="true"
                    />
                    {editingId === topic.id ? (
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        aria-label={`Renomear ${topic.name}`}
                        className="min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--focus)]"
                      />
                    ) : (
                      <button
                        onClick={() => selectTopic(topic.id)}
                        onDoubleClick={() => {
                          setEditingId(topic.id);
                          setEditingName(topic.name);
                        }}
                        className={`min-w-0 flex-1 truncate text-left ${
                          selectedTopicId === topic.id
                            ? "text-[var(--foreground)]"
                            : "text-[var(--muted)]"
                        }`}
                        title="Clique duplo para renomear"
                      >
                        {topic.name}
                      </button>
                    )}
                    <button
                      onClick={() => setConfirmDelete(topic.id)}
                      aria-label={`Excluir tópico ${topic.name}`}
                      className="hidden shrink-0 px-1 text-[var(--muted)] hover:text-[var(--danger)] group-hover:block"
                    >
                      ×
                    </button>
                  </div>
                  {totals ? (
                    totals.itemsWanted + totals.itemsBought > 0 && (
                      <div className="mt-1 flex items-center gap-2 pl-4.5 text-[10px]">
                        <span className="tabular-nums text-[var(--brand)]">
                          {formatBRL(totals.wantedCents)}
                        </span>
                        <span className="tabular-nums text-[var(--muted)]">
                          {totals.itemsWanted}{" "}
                          {totals.itemsWanted === 1 ? "item" : "itens"}
                        </span>
                        {totals.itemsBought > 0 && (
                          <span className="tabular-nums text-[var(--success)]">
                            {totals.itemsBought} ✓
                          </span>
                        )}
                      </div>
                    )
                  ) : (
                    progress.total > 0 && (
                      <div className="mt-1.5 flex items-center gap-2 pl-4.5">
                        <div
                          className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--surface3)]"
                          role="progressbar"
                          aria-valuenow={progress.percent}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Progresso de ${topic.name}`}
                        >
                          <div
                            className="h-full rounded-full bg-[var(--success)]"
                            style={{ width: `${progress.percent}%` }}
                          />
                        </div>
                        <span className="shrink-0 tabular-nums text-[10px] text-[var(--muted)]">
                          {progress.done}/{progress.total}
                        </span>
                        {progress.overdue > 0 && (
                          <span
                            className="shrink-0 tabular-nums text-[10px] text-[var(--danger)]"
                            title={`${progress.overdue} atrasadas`}
                          >
                            !{progress.overdue}
                          </span>
                        )}
                      </div>
                    )
                  )}
                </div>
              );
            })}
              </div>
            </>
          )}

          {archivedTopics.length > 0 && (
            <div className="pb-3">
              <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                Arquivados
              </p>
              {archivedTopics.map((topic) => (
                <button
                  key={topic.id}
                  onClick={() => selectTopic(topic.id)}
                  className="flex min-h-[36px] w-full items-center gap-2 rounded-md px-2 text-left text-sm text-[var(--muted)] opacity-70 hover:bg-[var(--surface)] hover:opacity-100"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: topic.color }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{topic.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleAddTopic} className="border-t border-[var(--border)] p-3">
          <div className="mb-1.5 flex gap-1">
            {(["project", "wishlist"] as TopicKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setNewTopicKind(k)}
                aria-pressed={newTopicKind === k}
                className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
                  newTopicKind === k
                    ? "bg-[var(--brand)] text-[var(--accent-ink)]"
                    : "bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface2)]"
                }`}
              >
                {k === "project" ? "Projeto" : "Desejos"}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              placeholder={
                newTopicKind === "wishlist" ? "Nova lista de desejos..." : "Novo tópico..."
              }
              aria-label="Nome do novo tópico"
              className="min-h-[40px] min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--focus)]"
            />
            <button
              type="submit"
              aria-label="Adicionar tópico"
              className="min-h-[40px] shrink-0 rounded-md bg-[var(--brand)] px-3 text-sm font-medium text-[var(--accent-ink)] hover:bg-[var(--accent-hover)]"
            >
              +
            </button>
          </div>
        </form>

        {syncAvailable && (
          <button
            onClick={onOpenAccount}
            className="flex min-h-[44px] items-center gap-2 border-t border-[var(--border)] px-3 text-left text-xs text-[var(--muted)] hover:bg-[var(--surface)]"
          >
            {user ? (
              <>
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: SYNC_DOT_COLOR[syncStatus] }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{user.email}</span>
              </>
            ) : (
              <span>Entrar pra sincronizar entre aparelhos</span>
            )}
          </button>
        )}
      </aside>

      {confirmDelete && pendingDelete && (
        <ConfirmDialog
          title="Excluir tópico"
          message={
            pendingDeleteActive > 0
              ? `"${pendingDelete.name}" ainda tem ${pendingDeleteActive} ${pendingDeleteActive === 1 ? "tarefa ativa" : "tarefas ativas"}. Elas vão para a lixeira e podem ser restauradas.`
              : `As tarefas de "${pendingDelete.name}" vão para a lixeira e podem ser restauradas.`
          }
          confirmLabel="Excluir tópico"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            deleteTopic(confirmDelete);
            if (selectedTopicId === confirmDelete) onSelectTopic(null);
            setConfirmDelete(null);
            showToast("Tópico excluído. As tarefas estão na lixeira.");
          }}
        />
      )}
    </>
  );
}
