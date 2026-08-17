"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { Task, TaskPriority } from "@/lib/types";
import { PRIORITY_LABEL } from "@/lib/priority";
import { todayISO, addDaysISO, localDayOf } from "@/lib/date-utils";
import {
  getOverdueTasks,
  getQuickWins,
  getTasksDueToday,
  getUpcomingTasks,
  suggestFocusTasks,
  visibleTasks,
} from "@/lib/task-utils";
import { TaskModal } from "../TaskModal";
import { TaskRow } from "./TaskRow";
import { useToast } from "../shared/Toast";

function Section({
  title,
  hint,
  count,
  children,
}: {
  title: string;
  hint?: string;
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
      {hint && <p className="mb-3 text-xs text-[var(--muted)]">{hint}</p>}
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-xs text-[var(--muted)]">{children}</p>;
}

export function TodayView({
  onOpenKanban,
  priorityFilter = null,
}: {
  onOpenKanban: () => void;
  priorityFilter?: TaskPriority | null;
}) {
  const { tasks, topics, setTaskStatus, updateTask, archiveTask, focusToday, toggleFocus } =
    useApp();
  const { showToast } = useToast();
  const [modalTask, setModalTask] = useState<Task | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const today = todayISO();
  // O filtro de prioridade vale para as seções de trabalho (atrasadas,
  // próximas, vitórias rápidas). O progresso do dia continua contando tudo:
  // filtrar a régua junto faria o número do cabeçalho mentir.
  const active = useMemo(
    () =>
      visibleTasks(tasks).filter((t) => !priorityFilter || t.priority === priorityFilter),
    [tasks, priorityFilter]
  );
  const allActive = useMemo(() => visibleTasks(tasks), [tasks]);
  const topicMap = useMemo(
    () => Object.fromEntries(topics.map((t) => [t.id, t])),
    [topics]
  );

  const overdue = useMemo(() => getOverdueTasks(active, today), [active, today]);
  const dueToday = useMemo(() => getTasksDueToday(active, today), [active, today]);
  const upcoming = useMemo(() => getUpcomingTasks(active, 7, today), [active, today]);
  const quickWins = useMemo(() => getQuickWins(active, today), [active, today]);
  const suggestions = useMemo(() => suggestFocusTasks(active, today), [active, today]);

  const focusTasks = focusToday
    .map((id) => active.find((t) => t.id === id))
    .filter((t): t is Task => !!t);

  const doneToday = allActive.filter(
    (t) => t.completedAt && localDayOf(t.completedAt) === today
  ).length;
  const totalToday =
    doneToday +
    getTasksDueToday(allActive, today).length +
    focusTasks.filter((t) => t.status !== "done").length;

  function complete(task: Task) {
    setTaskStatus(task.id, "done");
    showToast("Tarefa concluída.", () => setTaskStatus(task.id, "todo"));
  }

  function openTask(task: Task) {
    setModalTask(task);
    setModalOpen(true);
  }

  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <header className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--foreground)]">
              {saudacao}
            </h1>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {new Date().toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "long",
              })}
            </p>
            <p className="mt-2 tabular-nums text-sm text-[var(--foreground)]">
              {doneToday} de {Math.max(totalToday, doneToday)} tarefas concluídas hoje
            </p>
            {priorityFilter && (
              <p className="mt-1 text-xs text-[var(--brand)]">
                Filtrando por prioridade {PRIORITY_LABEL[priorityFilter].toLowerCase()} — as
                listas abaixo mostram só essas.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setModalTask(null);
                setModalOpen(true);
              }}
              className="rounded-md bg-[var(--brand)] px-3 py-2 text-sm font-medium text-[var(--accent-ink)] hover:bg-[var(--accent-hover)]"
            >
              + Nova tarefa
            </button>
            <button
              onClick={() => setShowSuggestions((s) => !s)}
              className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface2)]"
            >
              Planejar dia
            </button>
          </div>
        </div>
      </header>

      <Section
        title="Foco de hoje"
        hint="Até 3 tarefas. Você escolhe — nada entra aqui sozinho."
        count={focusTasks.length}
      >
        {focusTasks.length === 0 ? (
          <Empty>
            Nenhum foco definido. Use &ldquo;Planejar dia&rdquo; para ver sugestões.
          </Empty>
        ) : (
          <ul className="space-y-2">
            {focusTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                topic={topicMap[task.topicId]}
                onOpen={() => openTask(task)}
                onComplete={() => complete(task)}
                actions={
                  <button
                    onClick={() => toggleFocus(task.id)}
                    aria-label={`Remover ${task.title} do foco`}
                    className="shrink-0 rounded px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--surface3)]"
                  >
                    Remover
                  </button>
                }
              />
            ))}
          </ul>
        )}

        {showSuggestions && (
          <div className="mt-3 rounded-lg border border-[var(--planning)] bg-[var(--surface2)] p-3">
            <p className="mb-2 text-xs font-medium text-[var(--planning)]">
              Sugestões (críticas, atrasadas ou com prazo hoje)
            </p>
            {suggestions.length === 0 ? (
              <Empty>Nada urgente por aqui.</Empty>
            ) : (
              <ul className="space-y-2">
                {suggestions.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    topic={topicMap[task.topicId]}
                    onOpen={() => openTask(task)}
                    onComplete={() => complete(task)}
                    actions={
                      <button
                        onClick={() => toggleFocus(task.id)}
                        disabled={focusToday.length >= 3 && !focusToday.includes(task.id)}
                        className="shrink-0 rounded px-2 py-1 text-xs font-medium text-[var(--brand)] hover:bg-[var(--surface3)] disabled:opacity-40"
                      >
                        {focusToday.includes(task.id) ? "No foco" : "Focar"}
                      </button>
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </Section>

      <Section
        title="Atrasadas"
        hint={
          overdue.length > 0
            ? `${overdue.length} ${overdue.length === 1 ? "tarefa precisa" : "tarefas precisam"} de revisão`
            : undefined
        }
        count={overdue.length}
      >
        {overdue.length === 0 ? (
          <Empty>Nada atrasado. </Empty>
        ) : (
          <ul className="space-y-2">
            {overdue.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                topic={topicMap[task.topicId]}
                onOpen={() => openTask(task)}
                onComplete={() => complete(task)}
                actions={
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => {
                        updateTask(task.id, { dueDate: today });
                        showToast("Reagendada para hoje.");
                      }}
                      className="rounded px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--surface3)]"
                    >
                      Hoje
                    </button>
                    <button
                      onClick={() => {
                        updateTask(task.id, { dueDate: addDaysISO(today, 1) });
                        showToast("Reagendada para amanhã.");
                      }}
                      className="rounded px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--surface3)]"
                    >
                      Amanhã
                    </button>
                    <button
                      onClick={() => {
                        archiveTask(task.id);
                        showToast("Tarefa arquivada.");
                      }}
                      className="rounded px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--surface3)]"
                    >
                      Arquivar
                    </button>
                  </div>
                }
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Próximas" count={dueToday.length + upcoming.length}>
        {dueToday.length + upcoming.length === 0 ? (
          <Empty>Nenhuma tarefa com prazo nos próximos 7 dias.</Empty>
        ) : (
          <ul className="space-y-2">
            {[...dueToday, ...upcoming].map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                topic={topicMap[task.topicId]}
                onOpen={() => openTask(task)}
                onComplete={() => complete(task)}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Vitória rápida"
        hint="Tarefas curtas pra destravar quando bater a inércia."
        count={quickWins.length}
      >
        {quickWins.length === 0 ? (
          <Empty>
            Marque tarefas como energia &ldquo;rápida&rdquo; para elas aparecerem aqui.
          </Empty>
        ) : (
          <ul className="space-y-2">
            {quickWins.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                topic={topicMap[task.topicId]}
                onOpen={() => openTask(task)}
                onComplete={() => complete(task)}
              />
            ))}
          </ul>
        )}
      </Section>

      <button
        onClick={onOpenKanban}
        className="w-full rounded-xl border border-dashed border-[var(--border)] py-3 text-sm text-[var(--muted)] hover:bg-[var(--surface)]"
      >
        Ver quadro completo
      </button>

      {modalOpen && (
        <TaskModal
          task={modalTask}
          defaultTopicId={null}
          defaultStatus="todo"
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
