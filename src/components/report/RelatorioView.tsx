"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { montarRelatorio, tarefasConcluidasNoPeriodo } from "@/lib/report";
import { formatDuration } from "@/lib/schedule";
import { addDaysISO, todayISO } from "@/lib/date-utils";

const PERIODOS = [
  { dias: 7, rotulo: "7 dias" },
  { dias: 30, rotulo: "30 dias" },
  { dias: 90, rotulo: "90 dias" },
];

function diaLegivel(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function Cartao({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="font-[family-name:var(--font-display)] text-xl font-semibold tabular-nums text-[var(--foreground)]">
        {valor}
      </p>
      <p className="mt-0.5 text-[11px] text-[var(--muted)]">{rotulo}</p>
    </div>
  );
}

/**
 * Relatório do que foi feito: tempo por dia, tarefas concluídas e — o caso
 * que mais confunde — os blocos que começaram num dia e terminaram no outro.
 */
export function RelatorioView() {
  const { board, topics } = useApp();
  const [dias, setDias] = useState(7);

  const hoje = todayISO();
  const de = addDaysISO(hoje, -(dias - 1));

  const relatorio = useMemo(() => montarRelatorio(board, de, hoje), [board, de, hoje]);
  const concluidas = useMemo(
    () => tarefasConcluidasNoPeriodo(board, de, hoje),
    [board, de, hoje]
  );
  const nomeDoTopico = useMemo(
    () => new Map(topics.map((t) => [t.id, t.name])),
    [topics]
  );

  const maiorDoPeriodo = Math.max(1, ...relatorio.dias.map((d) => d.elapsedMs));

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--foreground)]">
            Relatório
          </h1>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {diaLegivel(de)} até {diaLegivel(hoje)}
          </p>
        </div>
        <div className="flex gap-1.5">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              onClick={() => setDias(p.dias)}
              aria-pressed={dias === p.dias}
              className={`min-h-[36px] rounded-md border px-3 text-xs font-medium transition ${
                dias === p.dias
                  ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--accent-ink)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface)]"
              }`}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cartao valor={formatDuration(relatorio.totalTrabalhadoMs)} rotulo="trabalhado" />
        <Cartao
          valor={`${relatorio.blocosFeitos}/${relatorio.blocosTotal}`}
          rotulo="blocos concluídos"
        />
        <Cartao valor={String(relatorio.tarefasConcluidas)} rotulo="tarefas feitas" />
        <Cartao valor={formatDuration(relatorio.totalIntervaloMs)} rotulo="em intervalo" />
      </div>

      {relatorio.viradas.length > 0 && (
        <section className="rounded-xl border border-[var(--warning)] bg-[var(--surface)] p-3">
          <h2 className="text-sm font-semibold text-[var(--warning)]">
            Começou num dia, terminou no outro
          </h2>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            O tempo fica contado no dia em que o bloco foi planejado — é a mesma
            sessão de trabalho. A tarefa, essa sim, conta como concluída no dia em
            que você a fechou.
          </p>
          <ul className="mt-2 space-y-1.5">
            {relatorio.viradas.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-baseline gap-x-2 rounded-md bg-[var(--surface2)] px-2.5 py-2 text-xs"
              >
                <span className="font-medium text-[var(--foreground)]">{v.title}</span>
                <span className="tabular-nums text-[var(--muted)]">
                  {formatDuration(v.elapsedMs)} contados em {diaLegivel(v.diaDoBloco)}
                </span>
                <span className="tabular-nums text-[var(--warning)]">
                  concluído em {diaLegivel(v.diaDaConclusao)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <h2 className="mb-2 text-sm font-semibold text-[var(--foreground)]">Por dia</h2>
        <ul className="space-y-1">
          {[...relatorio.dias].reverse().map((d) => (
            <li key={d.date} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 text-[var(--muted)]">{diaLegivel(d.date)}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface3)]">
                <span
                  className="block h-full rounded-full bg-[var(--brand)]"
                  style={{ width: `${(d.elapsedMs / maiorDoPeriodo) * 100}%` }}
                />
              </span>
              <span className="w-16 shrink-0 text-right tabular-nums text-[var(--foreground)]">
                {d.elapsedMs > 0 ? formatDuration(d.elapsedMs) : "—"}
              </span>
              <span
                className="w-8 shrink-0 text-right tabular-nums text-[var(--success)]"
                title={`${d.tarefasConcluidas} tarefas concluídas`}
              >
                {d.tarefasConcluidas > 0 ? `${d.tarefasConcluidas}✓` : ""}
              </span>
            </li>
          ))}
        </ul>
        {relatorio.melhorDia && (
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            Melhor dia: {diaLegivel(relatorio.melhorDia.date)} com{" "}
            {formatDuration(relatorio.melhorDia.elapsedMs)}.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <h2 className="mb-2 text-sm font-semibold text-[var(--foreground)]">
          Tarefas concluídas{" "}
          <span className="tabular-nums text-[var(--muted)]">({concluidas.length})</span>
        </h2>
        {concluidas.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">
            Nada concluído neste período ainda.
          </p>
        ) : (
          <ul className="space-y-1">
            {concluidas.map(({ task, dia }) => (
              <li
                key={task.id}
                className="flex flex-wrap items-baseline justify-between gap-x-2 border-b border-[var(--border)] py-1.5 text-xs last:border-0"
              >
                <span className="min-w-0 flex-1 truncate text-[var(--foreground)]">
                  {task.title}
                </span>
                <span className="shrink-0 text-[var(--muted)]">
                  {nomeDoTopico.get(task.topicId) ?? "sem projeto"}
                </span>
                <span className="w-20 shrink-0 text-right tabular-nums text-[var(--success)]">
                  {diaLegivel(dia)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
