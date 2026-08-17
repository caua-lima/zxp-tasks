"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { Task } from "@/lib/types";
import { getNextAction, getRecentlyCompleted, topicStats } from "@/lib/project-utils";
import { getOverdueTasks } from "@/lib/task-utils";
import { formatMinutes } from "@/lib/weekly-review";
import { formatDateShort } from "@/lib/date-utils";
import { TaskModal } from "../TaskModal";
import { TaskRow } from "../today/TaskRow";
import { MindMap } from "../MindMap";
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
  const [showMap, setShowMap] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");

  const topic = topics.find((t) => t.id === topicId);

  const stats = useMemo(() => topicStats(tasks, topicId), [tasks, topicId]);
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
    showToast("Tarefa concluída.", () => setTaskStatus(task.id, "todo"));
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
              + Nova tarefa
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
      </header>

      <Block title="Próxima ação">
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
            Nada em aberto neste tópico.
          </p>
        )}
      </Block>

      {doing.length > 0 && (
        <Block title="Em andamento" count={doing.length}>
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

      <Block title="Concluídas recentemente" count={recent.length}>
        {recent.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">Nada concluído por aqui ainda.</p>
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
                    {formatDateShort(task.completedAt.slice(0, 10))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Mapa mental do tópico">
        <button
          onClick={() => setShowMap((v) => !v)}
          className="mb-3 min-h-[36px] rounded-md border border-[var(--border)] px-3 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface2)]"
        >
          {showMap ? "Ocultar mapa" : "Mostrar mapa"}
        </button>
        {showMap && (
          <div className="h-[420px] overflow-hidden rounded-lg border border-[var(--border)]">
            <MindMap topicId={topicId} filters={{}} />
          </div>
        )}
      </Block>

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
