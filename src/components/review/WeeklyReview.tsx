"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { calculateWeeklyMetrics, formatMinutes } from "@/lib/weekly-review";
import { startOfWeekISO, todayISO, formatDateShort } from "@/lib/date-utils";
import { useToast } from "../shared/Toast";

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-3">
      <p
        className="font-[family-name:var(--font-display)] text-xl font-semibold tabular-nums"
        style={{ color: tone ?? "var(--foreground)" }}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-[var(--muted)]">{label}</p>
    </div>
  );
}

const field =
  "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--focus)]";

export function WeeklyReview() {
  const { tasks, topics, board, saveWeeklyReview } = useApp();
  const { showToast } = useToast();
  const today = todayISO();
  const weekStart = startOfWeekISO(today);

  const metrics = useMemo(
    () => calculateWeeklyMetrics(tasks, topics, today),
    [tasks, topics, today]
  );

  const existing = board.weeklyReviews.find((w) => w.weekStart === weekStart);
  const [stuck, setStuck] = useState(existing?.stuck ?? "");
  const [toArchive, setToArchive] = useState(existing?.toArchive ?? "");
  const [nextPriority, setNextPriority] = useState(existing?.nextPriority ?? "");
  const [wastingTime, setWastingTime] = useState(existing?.wastingTime ?? "");

  // A revisão anterior fecha o ciclo: o que você definiu como prioridade da
  // semana que vem é justamente o que precisa ser cobrado agora.
  const previous = useMemo(
    () =>
      board.weeklyReviews
        .filter((w) => w.weekStart < weekStart)
        .sort((a, b) => b.weekStart.localeCompare(a.weekStart)),
    [board.weeklyReviews, weekStart]
  );
  const lastReview = previous[0];

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--foreground)]">
          Revisão semanal
        </h1>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Semana de {formatDateShort(metrics.weekStart)} a {formatDateShort(metrics.weekEnd)}
        </p>
      </header>

      {lastReview?.nextPriority && (
        <section className="rounded-lg border border-[var(--planning)] bg-[var(--surface2)] p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--planning)]">
            Você definiu como prioridade desta semana
          </p>
          <p className="mt-1 text-sm text-[var(--foreground)]">{lastReview.nextPriority}</p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Anotado na revisão de {formatDateShort(lastReview.weekStart)}.
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--foreground)]">Execução</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Concluídas" value={String(metrics.completed)} tone="var(--success)" />
          <Stat label="Criadas" value={String(metrics.created)} tone="var(--info)" />
          <Stat label="Arquivadas" value={String(metrics.archived)} />
          <Stat
            label="Atrasadas agora"
            value={String(metrics.overdue)}
            tone={metrics.overdue > 0 ? "var(--danger)" : undefined}
          />
          <Stat label="Concluídas / criadas" value={`${metrics.completionRate}%`} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--foreground)]">Prioridades</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat
            label="Críticas concluídas"
            value={String(metrics.criticalCompleted)}
            tone="var(--success)"
          />
          <Stat
            label="Críticas abertas"
            value={String(metrics.criticalOpen)}
            tone={metrics.criticalOpen > 0 ? "var(--danger)" : undefined}
          />
          <Stat
            label="Alta/crítica atrasadas"
            value={String(metrics.highOverdue)}
            tone={metrics.highOverdue > 0 ? "var(--warning)" : undefined}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--foreground)]">Tópicos</h2>
        <div className="space-y-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-3 text-sm">
          <p className="text-[var(--muted)]">
            Maior avanço:{" "}
            <span className="text-[var(--foreground)]">
              {metrics.topTopic?.name ?? "—"}
            </span>
          </p>
          <p className="text-[var(--muted)]">
            Mais parado:{" "}
            <span className="text-[var(--foreground)]">
              {metrics.stuckTopic?.name ?? "—"}
            </span>
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--foreground)]">Tempo estimado</h2>
        <p className="mb-2 text-xs text-[var(--muted)]">
          Soma das estimativas que você preencheu — não é tempo medido.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label="Estimado das concluídas"
            value={formatMinutes(metrics.estimatedMinutesCompleted)}
          />
          <Stat
            label="Estimado das pendentes"
            value={formatMinutes(metrics.estimatedMinutesPending)}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--foreground)]">
          Perguntas da semana
        </h2>
        <div className="space-y-3">
          <div>
            <label htmlFor="r-stuck" className="mb-1 block text-xs text-[var(--muted)]">
              O que ficou travado?
            </label>
            <textarea id="r-stuck" rows={2} value={stuck} onChange={(e) => setStuck(e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="r-archive" className="mb-1 block text-xs text-[var(--muted)]">
              O que deve ser arquivado?
            </label>
            <textarea id="r-archive" rows={2} value={toArchive} onChange={(e) => setToArchive(e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="r-next" className="mb-1 block text-xs text-[var(--muted)]">
              Qual é a prioridade da próxima semana?
            </label>
            <textarea id="r-next" rows={2} value={nextPriority} onChange={(e) => setNextPriority(e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="r-waste" className="mb-1 block text-xs text-[var(--muted)]">
              Que tarefa está ocupando espaço sem gerar resultado?
            </label>
            <textarea id="r-waste" rows={2} value={wastingTime} onChange={(e) => setWastingTime(e.target.value)} className={field} />
          </div>
          <button
            onClick={() => {
              saveWeeklyReview({ weekStart, stuck, toArchive, nextPriority, wastingTime });
              showToast("Revisão da semana salva neste dispositivo.");
            }}
            className="rounded-md bg-[var(--brand)] px-3 py-2 text-sm font-medium text-[var(--accent-ink)] hover:bg-[var(--accent-hover)]"
          >
            Salvar revisão
          </button>
        </div>
      </section>

      {previous.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-[var(--foreground)]">
            Revisões anteriores{" "}
            <span className="tabular-nums text-[var(--muted)]">({previous.length})</span>
          </h2>
          <div className="space-y-2">
            {previous.map((review) => (
              <details
                key={review.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface2)]"
              >
                <summary className="cursor-pointer px-3 py-2 text-sm text-[var(--foreground)]">
                  Semana de {formatDateShort(review.weekStart)}
                </summary>
                <dl className="space-y-2 border-t border-[var(--border)] px-3 py-2 text-xs">
                  {[
                    ["O que ficou travado", review.stuck],
                    ["O que arquivar", review.toArchive],
                    ["Prioridade da semana seguinte", review.nextPriority],
                    ["Ocupando espaço sem resultado", review.wastingTime],
                  ]
                    .filter(([, value]) => value)
                    .map(([question, answer]) => (
                      <div key={question}>
                        <dt className="text-[var(--muted)]">{question}</dt>
                        <dd className="text-[var(--foreground)]">{answer}</dd>
                      </div>
                    ))}
                  {!review.stuck &&
                    !review.toArchive &&
                    !review.nextPriority &&
                    !review.wastingTime && (
                      <p className="text-[var(--muted)]">Revisão sem anotações.</p>
                    )}
                </dl>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
