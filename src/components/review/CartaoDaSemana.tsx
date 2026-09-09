"use client";

import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { montarRelatorio, tempoPorProjeto } from "@/lib/report";
import { addDaysISO } from "@/lib/date-utils";
import { ZxpMark } from "../ZxpMark";

/**
 * O cartão da semana — feito pra virar foto.
 *
 * Diferente do resto do app, este bloco é desenhado pra ser recortado e
 * postado: ele se explica sozinho. Traz a marca, o intervalo de datas e o
 * número que importa em tamanho grande, porque numa imagem sem legenda
 * ninguém tem o contexto que quem está usando o app tem.
 *
 * Os números são TODOS medidos, nunca estimados. Uma semana postada com
 * "12h" que na verdade era um palpite seria a pior coisa que este app
 * poderia produzir.
 */

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** "12h 40" — compacto o suficiente pra caber num número gigante. */
function horas(ms: number): { valor: string; unidade: string } {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return { valor: String(m), unidade: "min" };
  if (m === 0) return { valor: String(h), unidade: "h" };
  return { valor: `${h}h ${String(m).padStart(2, "0")}`, unidade: "min" };
}

function curto(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

function intervaloLegivel(de: string, ate: string): string {
  const a = new Date(de + "T00:00:00");
  const b = new Date(ate + "T00:00:00");
  const dia = (d: Date) => String(d.getDate()).padStart(2, "0");
  const mes = (d: Date) =>
    d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase();
  return a.getMonth() === b.getMonth()
    ? `${dia(a)}–${dia(b)} ${mes(b)}`
    : `${dia(a)} ${mes(a)} – ${dia(b)} ${mes(b)}`;
}

/** Número da semana no ano (ISO 8601) — o "SEMANA 36" do cabeçalho. */
function numeroDaSemana(iso: string): number {
  const d = new Date(iso + "T00:00:00");
  // Quinta-feira da mesma semana define o ano ISO; sem isso, a virada de
  // ano devolveria semana 1 pra dezembro e semana 53 pra janeiro.
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const primeira = new Date(d.getFullYear(), 0, 4);
  primeira.setDate(primeira.getDate() + 3 - ((primeira.getDay() + 6) % 7));
  return 1 + Math.round((d.getTime() - primeira.getTime()) / (7 * 86_400_000));
}

function Metrica({
  valor,
  rotulo,
  cor,
}: {
  valor: string;
  rotulo: string;
  cor?: string;
}) {
  return (
    <div className="min-w-0 flex-1 border-l border-[var(--border)] pl-3 first:border-l-0 first:pl-0">
      <p
        className="font-[family-name:var(--font-display)] text-[22px] font-bold leading-none tabular-nums sm:text-2xl"
        style={{ color: cor ?? "var(--foreground)" }}
      >
        {valor}
      </p>
      {/* Sem quebra: um rótulo em duas linhas empurra o vizinho e a régua
          de métricas perde o alinhamento — logo no pedaço que vira foto. */}
      <p className="mt-1.5 truncate text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
        {rotulo}
      </p>
    </div>
  );
}

export function CartaoDaSemana({
  weekStart,
  dias = 7,
}: {
  /** Primeiro dia do período. Em 7 dias é a segunda-feira da semana. */
  weekStart: string;
  dias?: number;
}) {
  const { board, topics } = useApp();
  const weekEnd = addDaysISO(weekStart, dias - 1);
  const inicioAnterior = addDaysISO(weekStart, -dias);
  // Em 7 dias o cabeçalho fala "Semana 37" e os rótulos são Seg..Dom. Em
  // períodos maiores isso deixa de fazer sentido: viram dias do mês.
  const ehSemana = dias === 7;

  const relatorio = useMemo(
    () => montarRelatorio(board, weekStart, weekEnd),
    [board, weekStart, weekEnd]
  );
  const anterior = useMemo(
    () => montarRelatorio(board, inicioAnterior, addDaysISO(inicioAnterior, dias - 1)),
    [board, inicioAnterior, dias]
  );
  const projetos = useMemo(
    () => tempoPorProjeto(board, weekStart, weekEnd),
    [board, weekStart, weekEnd]
  );
  const nomeDoProjeto = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);

  const foco = horas(relatorio.totalTrabalhadoMs);
  const diasAtivos = relatorio.dias.filter((d) => d.elapsedMs > 0).length;
  const rotuloDoDia = (i: number, iso: string) =>
    ehSemana ? DIAS[i] : String(new Date(iso + "T00:00:00").getDate());
  const mediaPorDia =
    diasAtivos === 0 ? 0 : Math.round(relatorio.totalTrabalhadoMs / diasAtivos);

  // Só compara quando há com o que comparar: "+100%" partindo de zero não
  // diz nada sobre a semana, só que a anterior estava vazia.
  const variacao =
    anterior.totalTrabalhadoMs > 0
      ? Math.round(
          ((relatorio.totalTrabalhadoMs - anterior.totalTrabalhadoMs) /
            anterior.totalTrabalhadoMs) *
            100
        )
      : null;

  const maiorDia = Math.max(1, ...relatorio.dias.map((d) => d.elapsedMs));
  const maiorProjeto = Math.max(1, ...projetos.map((p) => p.elapsedMs));
  const vazia = relatorio.totalTrabalhadoMs === 0 && relatorio.tarefasConcluidas === 0;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-[var(--border)] p-5 sm:p-7"
      style={{
        // Fundo próprio, mais fundo que o da tela: numa foto o cartão precisa
        // se destacar do app em volta pra o recorte ficar óbvio.
        background:
          "radial-gradient(120% 90% at 0% 0%, var(--accent-dim) 0%, transparent 55%), linear-gradient(160deg, var(--onyx-2) 0%, var(--onyx) 100%)",
      }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{
          background: "linear-gradient(90deg, var(--accent) 0%, transparent 70%)",
        }}
      />

      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <ZxpMark size={30} />
          <div>
            <p className="font-[family-name:var(--font-display)] text-sm font-bold leading-none tracking-wide text-[var(--foreground)]">
              ZXP TASKS
            </p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
              Relatório semanal
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-[family-name:var(--font-display)] text-sm font-bold leading-none tabular-nums text-[var(--accent)]">
            {intervaloLegivel(weekStart, weekEnd)}
          </p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
            {ehSemana ? `Semana ${numeroDaSemana(weekStart)}` : `${dias} dias`}
          </p>
        </div>
      </header>

      <div className="mt-6 sm:mt-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
          Tempo em foco
        </p>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span
            className="font-[family-name:var(--font-display)] text-[52px] font-bold leading-none tracking-tight tabular-nums text-[var(--accent)] sm:text-[64px]"
            style={{ textShadow: "0 0 40px rgba(61, 139, 255, 0.28)" }}
          >
            {foco.valor}
          </span>
          <span className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--accent)] opacity-70">
            {foco.unidade}
          </span>
          {variacao !== null && (
            <span
              className="ml-1 rounded-full px-2 py-1 text-[11px] font-bold tabular-nums"
              style={{
                color: variacao >= 0 ? "var(--success)" : "var(--muted)",
                backgroundColor:
                  variacao >= 0
                    ? "rgba(78, 175, 91, 0.14)"
                    : "rgba(246, 243, 232, 0.10)",
              }}
            >
              {variacao >= 0 ? "▲" : "▼"} {Math.abs(variacao)}%
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--muted)]">
          {variacao !== null
            ? `${variacao >= 0 ? "acima" : "abaixo"} do período anterior (${curto(
                anterior.totalTrabalhadoMs
              )})`
            : "tempo medido pelo cronômetro, não estimado"}
        </p>
      </div>

      <div className="mt-6 flex gap-3 border-y border-[var(--border)] py-4">
        <Metrica
          valor={String(relatorio.tarefasConcluidas)}
          rotulo="Tarefas"
          cor="var(--success)"
        />
        <Metrica
          valor={`${relatorio.blocosFeitos}/${relatorio.blocosTotal}`}
          rotulo="Blocos"
        />
        <Metrica valor={`${diasAtivos}/${dias}`} rotulo="Dias" cor="var(--accent)" />
        <Metrica valor={curto(mediaPorDia)} rotulo="Média/dia" />
      </div>

      {!vazia && (
      <div className="mt-5">
        {/* A barra é filha DIRETA do contêiner de altura fixa: dentro de um
            wrapper sem altura, o `height: %` não tinha contra o que resolver
            e o gráfico inteiro saía invisível. */}
        <div className={`flex h-24 items-end sm:h-28 ${ehSemana ? "gap-1.5" : "gap-[2px]"}`}>
          {relatorio.dias.map((d) => {
            const altura = Math.max(3, Math.round((d.elapsedMs / maiorDia) * 100));
            const melhor = d.elapsedMs === maiorDia && d.elapsedMs > 0;
            return (
              <span
                key={d.date}
                title={`${rotuloDoDia(relatorio.dias.indexOf(d), d.date)}: ${curto(d.elapsedMs)}`}
                className="min-w-0 flex-1 rounded-t-[4px]"
                style={{
                  height: `${altura}%`,
                  background: melhor
                    ? "linear-gradient(180deg, var(--focus) 0%, var(--accent) 100%)"
                    : d.elapsedMs > 0
                      ? "linear-gradient(180deg, rgba(61, 139, 255, 0.6) 0%, rgba(61, 139, 255, 0.32) 100%)"
                      : "var(--surface3)",
                }}
              />
            );
          })}
        </div>
        <div className={`mt-2 flex ${ehSemana ? "gap-1.5" : "gap-[2px]"}`}>
          {relatorio.dias.map((d, i) => {
            // Trinta rótulos lado a lado viram borrão: em período longo só
            // um a cada cinco dias aparece.
            const mostra = ehSemana || i % 5 === 0 || i === relatorio.dias.length - 1;
            return (
              <span
                key={d.date}
                className="min-w-0 flex-1 overflow-hidden text-center text-[9px] font-semibold uppercase tracking-wider"
                style={{
                  color:
                    d.elapsedMs === maiorDia && d.elapsedMs > 0
                      ? "var(--accent)"
                      : "var(--muted)",
                }}
              >
                {mostra ? rotuloDoDia(i, d.date) : ""}
              </span>
            );
          })}
        </div>
        {relatorio.melhorDia && (
          <p className="mt-2.5 text-[11px] text-[var(--muted)]">
            Melhor dia:{" "}
            <span className="font-semibold text-[var(--foreground)]">
              {rotuloDoDia(
                relatorio.dias.findIndex((d) => d.date === relatorio.melhorDia!.date),
                relatorio.melhorDia.date
              )}
            </span>{" "}
            com{" "}
            <span className="tabular-nums text-[var(--accent)]">
              {curto(relatorio.melhorDia.elapsedMs)}
            </span>
          </p>
        )}
      </div>
      )}

      {projetos.length > 0 && (
        <div className="mt-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            Onde o tempo foi
          </p>
          <ul className="mt-2.5 space-y-2">
            {projetos.slice(0, 4).map((p) => {
              const topico = p.topicId ? nomeDoProjeto.get(p.topicId) : undefined;
              return (
                <li key={p.topicId ?? "sem"} className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: topico?.color ?? "var(--muted)" }}
                  />
                  <span className="w-28 shrink-0 truncate text-xs font-medium text-[var(--foreground)] sm:w-40">
                    {topico?.name ?? "Sem projeto"}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface3)]">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.max(4, (p.elapsedMs / maiorProjeto) * 100)}%`,
                        backgroundColor: topico?.color ?? "var(--muted)",
                      }}
                    />
                  </span>
                  <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums text-[var(--foreground)]">
                    {curto(p.elapsedMs)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {vazia && (
        <p className="mt-8 rounded-lg border border-dashed border-[var(--border)] px-3 py-6 text-center text-xs leading-relaxed text-[var(--muted)]">
          Nenhum tempo registrado nesta semana ainda. Rode um bloco no Cronograma e
          este cartão se preenche sozinho.
        </p>
      )}

      <p className="mt-6 border-t border-[var(--border)] pt-3 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
        ZXP Solutions · Onyx Blue
      </p>
    </div>
  );
}
