"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { Task } from "@/lib/types";
import {
  getNextAction,
  getRecentlyCompleted,
  topicStats,
  topicInsights,
} from "@/lib/project-utils";
import { PRIORITY_COLOR, PRIORITY_ORDER } from "@/lib/priority";
import { getOverdueTasks } from "@/lib/task-utils";
import { formatMinutes } from "@/lib/weekly-review";
import { formatDateShort, localDayOf } from "@/lib/date-utils";
import { isWishlist, priorityLabel, wishlistTotals } from "@/lib/wishlist";
import { formatBRL } from "@/lib/money";
import { TaskModal } from "../TaskModal";
import { TaskRow } from "../today/TaskRow";
import { MindMap } from "../MindMap";
import { KanbanBoard } from "../KanbanBoard";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { useToast } from "../shared/Toast";

function Block({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold text-[var(--foreground)]">
          {title}
        </h2>
        {count !== undefined && (
          <span className="tabular-nums text-xs text-[var(--muted)]">{count}</span>
        )}
      </div>
      {children}
    </section>
  );
}

export function ProjectView({ topicId }: { topicId: string }) {
  const {
    topics,
    tasks,
    updateTopic,
    archiveTopic,
    restoreTopic,
    setTaskStatus,
  } = useApp();
  const { showToast } = useToast();
  const [modalTask, setModalTask] = useState<Task | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  // Quadro aberto por padrão: é a visão que responde "o que falta aqui".
  const [visual, setVisual] = useState<"kanban" | "mapa" | "nenhum">("kanban");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");

  const topic = topics.find((t) => t.id === topicId);

  const stats = useMemo(() => topicStats(tasks, topicId), [tasks, topicId]);
  const insights = useMemo(() => topicInsights(tasks, topicId), [tasks, topicId]);
  const wishlist = isWishlist(topic);
  const totals = useMemo(
    () => (wishlist ? wishlistTotals(tasks, topicId) : null),
    [wishlist, tasks, topicId]
  );
  const nextAction = useMemo(() => getNextAction(tasks, topicId), [tasks, topicId]);
  const recent = useMemo(() => getRecentlyCompleted(tasks, topicId), [tasks, topicId]);
  const doing = useMemo(
    () =>
      tasks.filter(
        (t) => t.topicId === topicId && !t.deletedAt && !t.archivedAt && t.status === "doing"
      ),
    [tasks, topicId]
  );
  const overdue = useMemo(
    () => getOverdueTasks(tasks).filter((t) => t.topicId === topicId),
    [tasks, topicId]
  );

  if (!topic) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-[var(--muted)]">
        Tópico não encontrado.
      </div>
    );
  }

  function open(task: Task) {
    setModalTask(task);
    setModalOpen(true);
  }

  function complete(task: Task) {
    setTaskStatus(task.id, "done");
    showToast(wishlist ? "Comprado!" : "Tarefa concluída.", () =>
      setTaskStatus(task.id, "todo")
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <header className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: topic.color }}
                aria-hidden="true"
              />
              <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--foreground)]">
                {topic.name}
              </h1>
              {topic.archivedAt && (
                <span className="rounded bg-[var(--surface3)] px-1.5 py-0.5 text-[11px] text-[var(--muted)]">
                  Arquivado
                </span>
              )}
            </div>

            {editingDescription ? (
              <div className="mt-2 flex gap-1.5">
                <input
                  autoFocus
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      updateTopic(topicId, { description: descriptionDraft });
                      setEditingDescription(false);
                    }
                    if (e.key === "Escape") setEditingDescription(false);
                  }}
                  aria-label="Descrição do projeto"
                  className="min-h-[36px] flex-1 rounded-md border border-[var(--border)] bg-[var(--surface2)] px-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--focus)]"
                />
                <button
                  onClick={() => {
                    updateTopic(topicId, { description: descriptionDraft });
                    setEditingDescription(false);
                  }}
                  className="rounded-md bg-[var(--brand)] px-2.5 text-xs font-medium text-[var(--accent-ink)]"
                >
                  Salvar
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setDescriptionDraft(topic.description ?? "");
                  setEditingDescription(true);
                }}
                className="mt-1 text-left text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                {topic.description || "+ Adicionar descrição"}
              </button>
            )}
          </div>

          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => {
                setModalTask(null);
                setModalOpen(true);
              }}
              className="min-h-[36px] rounded-md bg-[var(--brand)] px-3 text-sm font-medium text-[var(--accent-ink)] hover:bg-[var(--accent-hover)]"
            >
              {wishlist ? "+ Novo item" : "+ Nova tarefa"}
            </button>
            {topic.archivedAt ? (
              <button
                onClick={() => {
                  restoreTopic(topicId);
                  showToast("Tópico restaurado.");
                }}
                className="min-h-[36px] rounded-md border border-[var(--border)] px-3 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface2)]"
              >
                Restaurar
              </button>
            ) : (
              <button
                onClick={() => setConfirmArchive(true)}
                className="min-h-[36px] rounded-md border border-[var(--border)] px-3 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface2)]"
              >
                Arquivar
              </button>
            )}
          </div>
        </div>

        {totals ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-3">
              <p className="font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums text-[var(--brand)]">
                {formatBRL(totals.wantedCents)}
              </p>
              <p className="text-[11px] text-[var(--muted)]">
                {totals.itemsWanted} {totals.itemsWanted === 1 ? "item" : "itens"} que quero
                {totals.itemsWithoutPrice > 0 && (
                  <span className="text-[var(--warning)]">
                    {" "}
                    · {totals.itemsWithoutPrice} sem preço
                  </span>
                )}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-3">
              <p className="font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums text-[var(--success)]">
                {formatBRL(totals.boughtCents)}
              </p>
              <p className="text-[11px] text-[var(--muted)]">
                {totals.itemsBought} já {totals.itemsBought === 1 ? "comprado" : "comprados"}
              </p>
            </div>
            <div className="col-span-2 rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-3 sm:col-span-1">
              <p className="font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums text-[var(--foreground)]">
                {formatBRL(totals.wantedCents + totals.boughtCents)}
              </p>
              <p className="text-[11px] text-[var(--muted)]">Lista inteira</p>
            </div>
          </div>
        ) : (
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-[var(--muted)]">Progresso</span>
            <span className="tabular-nums text-[var(--foreground)]">
              {stats.done}/{stats.total} · {stats.percent}%
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-[var(--surface3)]"
            role="progressbar"
            aria-valuenow={stats.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progresso de ${topic.name}`}
          >
            <div
              className="h-full rounded-full bg-[var(--success)]"
              style={{ width: `${stats.percent}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[var(--muted)]">
            <span className="tabular-nums">{stats.todo} a fazer</span>
            <span className="tabular-nums">{stats.doing} em andamento</span>
            {stats.overdue > 0 && (
              <span className="tabular-nums text-[var(--danger)]">
                {stats.overdue} atrasadas
              </span>
            )}
            {stats.estimatedMinutesPending > 0 && (
              <span className="tabular-nums">
                {formatMinutes(stats.estimatedMinutesPending)} estimados pendentes
              </span>
            )}
          </div>
        </div>
        )}
      </header>

      <Block title={wishlist ? "Próximo a comprar" : "Próxima ação"}>
        {nextAction ? (
          <ul>
            <TaskRow
              task={nextAction}
              topic={topic}
              onOpen={() => open(nextAction)}
              onComplete={() => complete(nextAction)}
            />
          </ul>
        ) : (
          <p className="text-xs text-[var(--muted)]">
            {wishlist ? "Nenhum item em aberto nesta lista." : "Nada em aberto neste tópico."}
          </p>
        )}
      </Block>

      {doing.length > 0 && (
        <Block title={wishlist ? "Pesquisando" : "Em andamento"} count={doing.length}>
          <ul className="space-y-2">
            {doing.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                topic={topic}
                onOpen={() => open(task)}
                onComplete={() => complete(task)}
              />
            ))}
          </ul>
        </Block>
      )}

      {overdue.length > 0 && (
        <Block title="Atrasadas" count={overdue.length}>
          <ul className="space-y-2">
            {overdue.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                topic={topic}
                onOpen={() => open(task)}
                onComplete={() => complete(task)}
              />
            ))}
          </ul>
        </Block>
      )}

      <Block title={wishlist ? "Comprados recentemente" : "Concluídas recentemente"} count={recent.length}>
        {recent.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">{wishlist ? "Nada comprado por aqui ainda." : "Nada concluído por aqui ainda."}</p>
        ) : (
          <ul className="space-y-1.5">
            {recent.map((task) => (
              <li
                key={task.id}
                className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-2"
              >
                <button
                  onClick={() => open(task)}
                  className="min-w-0 flex-1 truncate text-left text-sm text-[var(--muted)] line-through"
                >
                  {task.title}
                </button>
                {task.completedAt && (
                  <span className="shrink-0 tabular-nums text-[11px] text-[var(--success)]">
                    {formatDateShort(localDayOf(task.completedAt))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Estatísticas">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-3">
            <p className="font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums text-[var(--success)]">
              {insights.completedLast7}
            </p>
            <p className="text-[11px] text-[var(--muted)]">{wishlist ? "Comprados em 7 dias" : "Concluídas em 7 dias"}</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-3">
            <p className="font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums text-[var(--foreground)]">
              {insights.completedLast30}
            </p>
            <p className="text-[11px] text-[var(--muted)]">{wishlist ? "Comprados em 30 dias" : "Concluídas em 30 dias"}</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-3">
            <p className="font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums text-[var(--foreground)]">
              {insights.medianDaysToComplete === null
                ? "—"
                : `${insights.medianDaysToComplete}d`}
            </p>
            <p className="text-[11px] text-[var(--muted)]">{wishlist ? "Tempo típico até comprar" : "Tempo típico até concluir"}</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-3">
            <p
              className="font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums"
              style={{
                color:
                  insights.daysSinceActivity !== null && insights.daysSinceActivity > 7
                    ? "var(--warning)"
                    : "var(--foreground)",
              }}
            >
              {insights.daysSinceActivity === null ? "—" : `${insights.daysSinceActivity}d`}
            </p>
            <p className="text-[11px] text-[var(--muted)]">Desde a última mexida</p>
          </div>
        </div>

        {stats.total > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-[11px] text-[var(--muted)]">
              {wishlist ? "Em aberto por desejo" : "Abertas por prioridade"}
              {insights.overdueShare > 0 && (
                <span className="text-[var(--danger)]">
                  {" "}
                  · {insights.overdueShare}% já passou do prazo
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRIORITY_ORDER.filter((p) => insights.byPriority[p] > 0).map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium tabular-nums"
                  style={{
                    color: PRIORITY_COLOR[p],
                    backgroundColor: `${PRIORITY_COLOR[p]}1f`,
                  }}
                >
                  {priorityLabel(p, wishlist ? "wishlist" : "project")}: {insights.byPriority[p]}
                </span>
              ))}
              {PRIORITY_ORDER.every((p) => insights.byPriority[p] === 0) && (
                <span className="text-[11px] text-[var(--muted)]">
                  {wishlist ? "Nenhum item em aberto nesta lista." : "Nada em aberto neste tópico."}
                </span>
              )}
            </div>
          </div>
        )}

        {insights.daysSinceActivity !== null && insights.daysSinceActivity > 14 && (
          <p className="mt-3 rounded-md bg-[var(--surface2)] px-3 py-2 text-xs text-[var(--warning)]">
            Este tópico está parado há {insights.daysSinceActivity} dias. Vale revisar se
            ainda faz sentido ou arquivar.
          </p>
        )}
      </Block>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex flex-wrap items-center gap-1 border-b border-[var(--border)] p-2">
          {(
            [
              ["kanban", wishlist ? "Quadro" : "Kanban"],
              ["mapa", "Mapa mental"],
            ] as const
          ).map(([chave, rotulo]) => (
            <button
              key={chave}
              onClick={() => setVisual(visual === chave ? "nenhum" : chave)}
              aria-pressed={visual === chave}
              className={`min-h-[40px] rounded-md px-3 text-sm font-medium transition ${
                visual === chave
                  ? "bg-[var(--brand)] text-[var(--accent-ink)]"
                  : "text-[var(--muted)] hover:bg-[var(--surface2)]"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {visual === "kanban" && (
          <div className="h-[560px] overflow-hidden">
            <KanbanBoard topicId={topicId} filters={{}} sortKey="priority" />
          </div>
        )}
        {visual === "mapa" && (
          <div className="h-[480px] overflow-hidden">
            <MindMap topicId={topicId} filters={{}} />
          </div>
        )}
      </section>

      {modalOpen && (
        <TaskModal
          task={modalTask}
          defaultTopicId={topicId}
          defaultStatus="todo"
          onClose={() => setModalOpen(false)}
        />
      )}

      {confirmArchive && (
        <ConfirmDialog
          title="Arquivar tópico"
          message={
            stats.todo + stats.doing > 0
              ? `"${topic.name}" ainda tem ${stats.todo + stats.doing} tarefas em aberto. Arquivar tira o tópico da barra lateral, mas nada é apagado — dá pra restaurar depois.`
              : `"${topic.name}" sai da barra lateral e pode ser restaurado depois. Nada é apagado.`
          }
          confirmLabel="Arquivar"
          onCancel={() => setConfirmArchive(false)}
          onConfirm={() => {
            archiveTopic(topicId);
            setConfirmArchive(false);
            showToast("Tópico arquivado.", () => restoreTopic(topicId));
          }}
        />
      )}
    </div>
  );
}
