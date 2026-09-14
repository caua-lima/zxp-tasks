"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { montarRelatorio, tarefasConcluidasNoPeriodo } from "@/lib/report";
import { formatDuration, rotuloDeConcorrencia } from "@/lib/schedule";
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

function Cartao({
  valor,
  rotulo,
  destaque,
}: {
  valor: string;
  rotulo: string;
  destaque?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <p
        className="font-[family-name:var(--font-display)] text-xl font-semibold tabular-nums"
        style={{ color: destaque ?? "var(--foreground)" }}
      >
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

  // Relógio, igual ao cartão do topo: a barra do dia com dois cronômetros
  // juntos ficaria o dobro do tamanho pra um dia que não foi maior.
  const maiorDoPeriodo = Math.max(1, ...relatorio.dias.map((d) => d.relogioMs));

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
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface)]"
              }`}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cartao valor={formatDuration(relatorio.totalRelogioMs)} rotulo="tempo de relógio" />
        <Cartao
          valor={`${relatorio.blocosFeitos}/${relatorio.blocosTotal}`}
          rotulo="blocos concluídos"
        />
        <Cartao valor={String(relatorio.tarefasConcluidas)} rotulo="tarefas feitas" />
        <Cartao
          valor={String(relatorio.blocosNaoFeitos)}
          rotulo="não fiz"
          destaque={relatorio.blocosNaoFeitos > 0 ? "var(--warning)" : undefined}
        />
      </div>

      {/* Só aparece quando houve mesmo cronômetro em paralelo — pra quem nunca
          usa dois de uma vez, explicar a diferença seria ruído. */}
      {relatorio.concorrencia.some((f) => f.nivel > 1) && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            Tempo dividido entre tarefas
          </h2>
          <ul className="mt-2 space-y-1">
            {relatorio.concorrencia.map((f) => (
              <li
                key={f.nivel}
                className="flex items-baseline justify-between gap-3 rounded-md bg-[var(--surface2)] px-2.5 py-1.5 text-xs"
              >
                <span className="text-[var(--muted)]">{rotuloDeConcorrencia(f.nivel)}</span>
                <span className="shrink-0 font-medium tabular-nums text-[var(--foreground)]">
                  {formatDuration(f.ms)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
            Somando tarefa por tarefa daria{" "}
            <span className="tabular-nums">
              {formatDuration(relatorio.totalTrabalhadoMs)}
            </span>
            , porque o mesmo minuto conta uma vez em cada tarefa ligada. O tempo de
            relógio — <span className="tabular-nums">{formatDuration(relatorio.totalRelogioMs)}</span>{" "}
            — é o que o período realmente ocupou.
          </p>
        </section>
      )}

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
                  className="block h-full rounded-full bg-[var(--accent)]"
                  style={{ width: `${(d.relogioMs / maiorDoPeriodo) * 100}%` }}
                />
              </span>
              <span className="w-16 shrink-0 text-right tabular-nums text-[var(--foreground)]">
                {d.relogioMs > 0 ? formatDuration(d.relogioMs) : "—"}
              </span>
              <span
                className="w-8 shrink-0 text-right tabular-nums text-[var(--success)]"
                title={`${d.tarefasConcluidas} tarefas concluídas`}
              >
                {d.tarefasConcluidas > 0 ? `${d.tarefasConcluidas}✓` : ""}
              </span>
              <span
                className="w-8 shrink-0 text-right tabular-nums text-[var(--warning)]"
                title={`${d.blocosNaoFeitos} blocos não feitos`}
              >
                {d.blocosNaoFeitos > 0 ? `${d.blocosNaoFeitos}✕` : ""}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          {relatorio.melhorDia &&
            `Melhor dia: ${diaLegivel(relatorio.melhorDia.date)} com ${formatDuration(
              relatorio.melhorDia.relogioMs
            )}. `}
          {formatDuration(relatorio.totalIntervaloMs)} em intervalo no período.
        </p>
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
