"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { calculateWeeklyMetrics } from "@/lib/weekly-review";
import { addDaysISO, startOfWeekISO, todayISO, formatDateShort } from "@/lib/date-utils";
import { useToast } from "../shared/Toast";
import { CartaoDaSemana } from "./CartaoDaSemana";

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
  const semanaAtual = startOfWeekISO(today);
  // Dá pra voltar semanas: a foto que a pessoa quer postar costuma ser a da
  // semana que acabou, não a que mal começou.
  const [weekStart, setWeekStart] = useState(semanaAtual);
  const ehSemanaAtual = weekStart === semanaAtual;
  // Modo foto: esconde tudo menos o cartão, pra o print sair limpo.
  const [modoFoto, setModoFoto] = useState(false);
  // Filtro de período do cartão. 7 dias segue a semana do calendário
  // (segunda a domingo); os maiores são janelas corridas terminando hoje.
  const [dias, setDias] = useState(7);
  const inicioDoCartao = dias === 7 ? weekStart : addDaysISO(today, -(dias - 1));

  const metrics = useMemo(
    // A revisão de uma semana passada usa o último dia daquela semana como
    // "hoje": calcular com a data de agora contaria atrasos que ainda nem
    // existiam quando a semana fechou.
    () => calculateWeeklyMetrics(tasks, topics, ehSemanaAtual ? today : addDaysISO(weekStart, 6)),
    [tasks, topics, today, weekStart, ehSemanaAtual]
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
    <div
      className={
        modoFoto
          ? "mx-auto max-w-lg p-4"
          : "mx-auto max-w-3xl space-y-4 p-4"
      }
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekStart((w) => addDaysISO(w, -7))}
            disabled={dias !== 7}
            aria-label="Semana anterior"
            className="min-h-[36px] rounded-md border border-[var(--border)] px-2.5 text-sm text-[var(--muted)] hover:bg-[var(--surface)] disabled:opacity-30"
          >
            ←
          </button>
          <button
            onClick={() => setWeekStart((w) => addDaysISO(w, 7))}
            disabled={ehSemanaAtual || dias !== 7}
            aria-label="Próxima semana"
            className="min-h-[36px] rounded-md border border-[var(--border)] px-2.5 text-sm text-[var(--muted)] hover:bg-[var(--surface)] disabled:opacity-30"
          >
            →
          </button>
          {!ehSemanaAtual && dias === 7 && (
            <button
              onClick={() => setWeekStart(semanaAtual)}
              className="ml-1 min-h-[36px] rounded-md px-2 text-xs font-medium text-[var(--accent)] hover:underline"
            >
              Voltar pra esta semana
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {[7, 14, 30].map((n) => (
            <button
              key={n}
              onClick={() => setDias(n)}
              aria-pressed={dias === n}
              className={`min-h-[36px] rounded-md border px-2.5 text-xs font-medium transition ${
                dias === n
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface)]"
              }`}
            >
              {n}d
            </button>
          ))}
        </div>
        <button
          onClick={() => setModoFoto((v) => !v)}
          aria-pressed={modoFoto}
          className={`min-h-[36px] rounded-md border px-3 text-xs font-semibold transition ${
            modoFoto
              ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
              : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface)]"
          }`}
        >
          {modoFoto ? "✕ Sair do modo foto" : "📷 Modo foto"}
        </button>
      </header>

      <div className={modoFoto ? "mt-4" : undefined}>
        <CartaoDaSemana weekStart={inicioDoCartao} dias={dias} />
      </div>

      {modoFoto && (
        <p className="mt-3 text-center text-[11px] text-[var(--muted)]">
          Tire o print e recorte no cartão. Toque de novo no botão pra voltar.
        </p>
      )}

      {!modoFoto && lastReview?.nextPriority && (
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

      {!modoFoto && (
        <>
      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--foreground)]">Execução</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Concluídas" value={String(metrics.completed)} tone="var(--success)" />
          <Stat label="Criadas" value={String(metrics.created)} />
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

      {/* A seção "Tempo estimado" saiu daqui. Ela somava as estimativas que
          a pessoa digitou, e agora aparecia logo abaixo de um cartão com
          tempo MEDIDO pelo cronômetro — duas horas diferentes na mesma tela,
          com a pior das duas parecendo desmentir a melhor. As estimativas
          continuam vivas na tarefa e no planejamento do dia. */}
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
            className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-ink)] hover:bg-[var(--accent-dark)]"
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
        </>
      )}
    </div>
  );
}
