"use client";

import { FormEvent, useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { Meta } from "@/lib/types";
import { descreverMeta, progressoDaMeta } from "@/lib/metas";
import { todayISO } from "@/lib/date-utils";
import { useToast } from "../shared/Toast";
import { ConfirmDialog } from "../shared/ConfirmDialog";

const DURACOES = [7, 21, 30, 66, 90];

const campo =
  "min-h-[40px] w-full rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--focus)]";

/**
 * Metas diárias com prazo: "ler 2 páginas por dia durante 30 dias".
 *
 * A tela gira em torno de uma pergunta só — "bati hoje?" —, por isso o
 * controle de hoje vem grande e o histórico vem como uma fileira de dias,
 * não como um gráfico: o que motiva numa meta dessas é não quebrar a
 * sequência, e isso se vê de relance numa fileira de pontos.
 */
export function MetasView() {
  const { metas, tasks, addMeta, registrarMeta, arquivarMeta } = useApp();
  const { showToast } = useToast();
  const hoje = todayISO();

  const [titulo, setTitulo] = useState("");
  const [alvo, setAlvo] = useState(2);
  const [unidade, setUnidade] = useState("páginas");
  const [dias, setDias] = useState(30);
  const [inicio, setInicio] = useState(hoje);
  const [arquivando, setArquivando] = useState<Meta | null>(null);

  const ativas = useMemo(() => metas.filter((m) => !m.archivedAt), [metas]);

  function criar(e: FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || !unidade.trim()) {
      showToast("Diga o que fazer e em que se mede — ex: Ler, páginas.");
      return;
    }
    const m = addMeta({ title: titulo, unit: unidade, dailyTarget: alvo, startDate: inicio, days: dias });
    setTitulo("");
    showToast(`Meta criada: ${descreverMeta(m)}, por ${m.days} dias.`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--foreground)]">
          Metas
        </h1>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Um pouco todo dia, por um tempo definido. Tarefas ligadas a uma meta marcam o
          dia sozinhas quando você as conclui.
        </p>
      </header>

      <form
        onSubmit={criar}
        className="space-y-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
      >
        <div className="grid grid-cols-[1fr_4.5rem_1fr] gap-2">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="O que fazer — ex: Ler"
            aria-label="O que fazer"
            className={campo}
          />
          <input
            type="number"
            min={1}
            value={alvo}
            onChange={(e) => setAlvo(Math.max(1, Number(e.target.value) || 1))}
            aria-label="Quantidade por dia"
            className={`${campo} text-center tabular-nums`}
          />
          <input
            value={unidade}
            onChange={(e) => setUnidade(e.target.value)}
            placeholder="páginas"
            aria-label="Unidade"
            className={campo}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-[var(--muted)]">por</span>
          {DURACOES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDias(d)}
              aria-pressed={dias === d}
              className={`min-h-[34px] rounded-md border px-2.5 text-xs font-medium transition ${
                dias === d
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface2)]"
              }`}
            >
              {d} dias
            </button>
          ))}
          <label className="ml-auto flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
            começa
            <input
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value || hoje)}
              className="min-h-[34px] rounded-md border border-[var(--border)] bg-[var(--surface2)] px-2 text-xs text-[var(--foreground)] outline-none focus:border-[var(--focus)] [color-scheme:dark]"
            />
          </label>
        </div>

        <button
          type="submit"
          className="min-h-[42px] w-full rounded-md bg-[var(--accent)] text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-dark)]"
        >
          Criar meta
        </button>
      </form>

      {ativas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
          Nenhuma meta ainda. Ex: Ler · 2 · páginas, por 30 dias.
        </p>
      ) : (
        <ul className="space-y-3">
          {ativas.map((m) => (
            <CartaoDaMeta
              key={m.id}
              meta={m}
              hoje={hoje}
              tarefasLigadas={tasks.filter((t) => !t.deletedAt && (t.metaIds ?? []).includes(m.id)).length}
              onRegistrar={(delta) => registrarMeta(m.id, hoje, delta)}
              onArquivar={() => setArquivando(m)}
            />
          ))}
        </ul>
      )}

      {arquivando && (
        <ConfirmDialog
          title="Arquivar meta"
          message={`"${descreverMeta(arquivando)}" sai da lista. O histórico fica guardado e as tarefas ligadas continuam existindo.`}
          confirmLabel="Arquivar"
          onCancel={() => setArquivando(null)}
          onConfirm={() => {
            arquivarMeta(arquivando.id);
            setArquivando(null);
            showToast("Meta arquivada.");
          }}
        />
      )}
    </div>
  );
}

function CartaoDaMeta({
  meta,
  hoje,
  tarefasLigadas,
  onRegistrar,
  onArquivar,
}: {
  meta: Meta;
  hoje: string;
  tarefasLigadas: number;
  onRegistrar: (delta: number) => void;
  onArquivar: () => void;
}) {
  const p = useMemo(() => progressoDaMeta(meta, hoje), [meta, hoje]);
  const faltaHoje = Math.max(0, meta.dailyTarget - p.hojeFeito);
  const hojeNaMeta = !p.naoComecou && !p.terminou;

  return (
    <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-[family-name:var(--font-display)] text-base font-semibold text-[var(--foreground)]">
            {descreverMeta(meta)}
          </p>
          <p className="mt-0.5 text-[11px] tabular-nums text-[var(--muted)]">
            {p.naoComecou
              ? `Começa em ${new Date(meta.startDate + "T00:00:00").toLocaleDateString("pt-BR")}`
              : p.terminou
                ? `Terminou — ${p.diasBatidos} de ${meta.days} dias batidos`
                : `Dia ${p.diaAtual} de ${meta.days}`}
            {tarefasLigadas > 0 &&
              ` · ${tarefasLigadas} ${tarefasLigadas === 1 ? "tarefa ligada" : "tarefas ligadas"}`}
          </p>
        </div>
        {p.sequencia > 0 && (
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums"
            style={{ color: "var(--warning)", backgroundColor: "rgba(232, 145, 58, 0.14)" }}
            title="Dias seguidos batendo a meta"
          >
            🔥 {p.sequencia}
          </span>
        )}
      </div>

      {hojeNaMeta && (
        <div
          className={`mt-3 flex items-center gap-3 rounded-lg border p-3 ${
            p.hojeBateu ? "border-[var(--success)]" : "border-[var(--border)]"
          }`}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              Hoje
            </p>
            <p className="font-[family-name:var(--font-display)] text-2xl font-bold leading-tight tabular-nums">
              <span style={{ color: p.hojeBateu ? "var(--success)" : "var(--foreground)" }}>
                {p.hojeFeito}
              </span>
              <span className="text-base text-[var(--muted)]">
                {" "}
                / {meta.dailyTarget} {meta.unit}
              </span>
            </p>
            <p className="text-[11px] text-[var(--muted)]">
              {p.hojeBateu ? "Dia batido." : `Faltam ${faltaHoje} ${meta.unit}.`}
            </p>
          </div>
          <button
            onClick={() => onRegistrar(-1)}
            disabled={p.hojeFeito === 0}
            aria-label={`Tirar 1 ${meta.unit}`}
            className="min-h-[44px] min-w-[44px] rounded-md border border-[var(--border)] text-lg text-[var(--muted)] hover:bg-[var(--surface2)] disabled:opacity-30"
          >
            −
          </button>
          <button
            onClick={() => onRegistrar(1)}
            aria-label={`Somar 1 ${meta.unit}`}
            className="min-h-[44px] min-w-[44px] rounded-md border border-[var(--accent)] text-lg font-semibold text-[var(--accent)] hover:bg-[var(--surface2)]"
          >
            +
          </button>
          {!p.hojeBateu && (
            <button
              onClick={() => onRegistrar(faltaHoje)}
              className="min-h-[44px] rounded-md bg-[var(--accent)] px-3 text-xs font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-dark)]"
            >
              Bati
            </button>
          )}
        </div>
      )}

      {/* Uma bolinha por dia. Fileira em vez de gráfico: numa meta de
          sequência, o que importa é ver o buraco que quebrou a corrente. */}
      <div className="mt-3 flex flex-wrap gap-1" aria-label="Dias da meta">
        {p.dias.map((d) => (
          <span
            key={d.date}
            title={`${new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR")}: ${d.feito} ${meta.unit}`}
            className="h-3.5 w-3.5 rounded-full"
            style={{
              backgroundColor: d.bateu
                ? "var(--success)"
                : d.futuro
                  ? "var(--surface3)"
                  : d.hoje
                    ? "transparent"
                    : "var(--danger-bg)",
              boxShadow: d.hoje ? "inset 0 0 0 2px var(--accent)" : undefined,
            }}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] tabular-nums text-[var(--muted)]">
        <span>
          <strong className="text-[var(--foreground)]">{p.diasBatidos}</strong>/{meta.days} dias
        </span>
        <span>
          <strong className="text-[var(--foreground)]">{p.totalFeito}</strong> {meta.unit} no total
        </span>
        <span>{p.percentual}%</span>
        <button
          onClick={onArquivar}
          className="ml-auto text-[11px] text-[var(--muted)] hover:text-[var(--danger)] hover:underline"
        >
          Arquivar
        </button>
      </div>
    </li>
  );
}
