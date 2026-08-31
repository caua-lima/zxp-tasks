"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { ScheduleBlock } from "@/lib/types";
import {
  DURATION_PRESETS,
  blocksOfDay,
  elapsedMs,
  formatDuration,
  isOvertime,
  isRunning,
  progressPercent,
  remainingMs,
  scheduleTotals,
} from "@/lib/schedule";
import { addDaysISO, todayISO } from "@/lib/date-utils";
import { useToast } from "../shared/Toast";
import { ConfirmDialog } from "../shared/ConfirmDialog";

function BlockRow({
  block,
  now,
  onStart,
  onPause,
  onFinish,
  onReopen,
  onRemove,
}: {
  block: ScheduleBlock;
  now: number;
  onStart: () => void;
  onPause: () => void;
  onFinish: () => void;
  onReopen: () => void;
  onRemove: () => void;
}) {
  const running = isRunning(block);
  const done = !!block.completedAt;
  const over = isOvertime(block, now);
  const remaining = remainingMs(block, now);
  const spent = elapsedMs(block, now);

  const timeColor = done
    ? "var(--success)"
    : over
      ? "var(--danger)"
      : running
        ? "var(--brand)"
        : "var(--muted)";

  return (
    <li
      className={`rounded-xl border bg-[var(--surface)] p-3 transition ${
        running ? "border-[var(--brand)]" : "border-[var(--border)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm font-medium ${
              done ? "text-[var(--muted)] line-through" : "text-[var(--foreground)]"
            }`}
          >
            {block.title}
          </p>
          <p className="mt-0.5 text-[11px] tabular-nums text-[var(--muted)]">
            {block.plannedMinutes} min planejados
            {spent > 0 && ` · ${formatDuration(spent)} feitos`}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p
            className="font-[family-name:var(--font-display)] text-2xl font-semibold tabular-nums"
            style={{ color: timeColor }}
            aria-label={
              done
                ? `Concluído em ${formatDuration(spent)}`
                : over
                  ? `Passou ${formatDuration(-remaining)} do tempo`
                  : `Faltam ${formatDuration(remaining)}`
            }
          >
            {over && !done ? `+${formatDuration(-remaining)}` : formatDuration(Math.max(0, remaining))}
          </p>
          {over && !done && (
            <p className="text-[10px] font-medium text-[var(--danger)]">passou do tempo</p>
          )}
        </div>
      </div>

      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface3)]"
        role="progressbar"
        aria-valuenow={progressPercent(block, now)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progresso de ${block.title}`}
      >
        <div
          className="h-full rounded-full transition-[width]"
          style={{
            width: `${progressPercent(block, now)}%`,
            backgroundColor: done ? "var(--success)" : over ? "var(--danger)" : "var(--brand)",
          }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!done && !running && (
          <button
            onClick={onStart}
            className="min-h-[44px] flex-1 rounded-md bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)]"
          >
            {spent > 0 ? "Continuar" : "Começar"}
          </button>
        )}
        {running && (
          <button
            onClick={onPause}
            className="min-h-[44px] flex-1 rounded-md border border-[var(--brand)] px-4 text-sm font-semibold text-[var(--brand)] hover:bg-[var(--surface2)]"
          >
            Pausar
          </button>
        )}
        {!done ? (
          <button
            onClick={onFinish}
            className="min-h-[44px] rounded-md border border-[var(--border)] px-4 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface2)]"
          >
            Concluir
          </button>
        ) : (
          <button
            onClick={onReopen}
            className="min-h-[44px] flex-1 rounded-md border border-[var(--border)] px-4 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface2)]"
          >
            Reabrir
          </button>
        )}
        <button
          onClick={onRemove}
          aria-label={`Remover ${block.title}`}
          className="min-h-[44px] rounded-md px-3 text-sm text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-[var(--danger)]"
        >
          ×
        </button>
      </div>
    </li>
  );
}

export function ScheduleView() {
  const {
    schedule,
    addBlock,
    removeBlock,
    startTimer,
    pauseTimer,
    finishBlock,
    reopenTimer,
    copyDay,
  } = useApp();
  const { showToast } = useToast();

  const [date, setDate] = useState(todayISO());
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState(40);
  const [confirmRemove, setConfirmRemove] = useState<ScheduleBlock | null>(null);

  const blocks = useMemo(() => blocksOfDay(schedule, date), [schedule, date]);
  const anyRunning = blocks.some(isRunning);

  // Relógio da tela: só liga quando algo está rodando. O tempo em si vem do
  // instante de início salvo — este tick só existe pra redesenhar o número.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyRunning]);

  // Voltar pro app depois de um tempo fora: atualiza na hora, sem esperar
  // o próximo tick de 1s (celular congela timers em segundo plano).
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const totals = useMemo(() => scheduleTotals(blocks, now), [blocks, now]);
  const isToday = date === todayISO();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    addBlock(date, t, minutes);
    setTitle("");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <header className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--foreground)]">
              {isToday ? "Hoje" : "Cronograma"}
            </h1>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {new Date(date + "T00:00:00").toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "long",
              })}
            </p>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || todayISO())}
            aria-label="Dia do cronograma"
            className="min-h-[40px] rounded-md border border-[var(--border)] bg-[var(--surface2)] px-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--focus)] [color-scheme:dark]"
          />
        </div>

        {blocks.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-4 text-xs">
            <span className="tabular-nums text-[var(--muted)]">
              <strong className="text-[var(--foreground)]">
                {Math.round(totals.plannedMs / 60000)} min
              </strong>{" "}
              planejados
            </span>
            <span className="tabular-nums text-[var(--muted)]">
              <strong style={{ color: "var(--brand)" }}>
                {formatDuration(totals.elapsedMs)}
              </strong>{" "}
              feitos
            </span>
            <span className="tabular-nums text-[var(--muted)]">
              <strong style={{ color: "var(--success)" }}>
                {totals.doneCount}/{totals.total}
              </strong>{" "}
              blocos
            </span>
          </div>
        )}
      </header>

      <form
        onSubmit={handleAdd}
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
      >
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="O que vai fazer? Ex: Chamar leads"
            aria-label="Nome do bloco"
            className="min-h-[44px] min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--focus)]"
          />
          <button
            type="submit"
            className="min-h-[44px] shrink-0 rounded-md bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)]"
          >
            Add
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DURATION_PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMinutes(m)}
              aria-pressed={minutes === m}
              className={`min-h-[36px] rounded-md border px-3 text-xs font-medium transition ${
                minutes === m
                  ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--accent-ink)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface2)]"
              }`}
            >
              {m} min
            </button>
          ))}
          <input
            type="number"
            min={1}
            value={DURATION_PRESETS.includes(minutes) ? "" : minutes}
            onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))}
            placeholder="outro"
            aria-label="Duração personalizada em minutos"
            className="min-h-[36px] w-20 rounded-md border border-[var(--border)] bg-[var(--surface2)] px-2 text-xs tabular-nums text-[var(--foreground)] outline-none focus:border-[var(--focus)]"
          />
        </div>
      </form>

      {blocks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center">
          <p className="text-sm text-[var(--muted)]">
            Nenhum bloco neste dia. Escreva o que vai fazer e quanto tempo vai dar.
          </p>
          {(() => {
            const ontem = addDaysISO(date, -1);
            const temOntem = schedule.some((b) => b.date === ontem);
            return temOntem ? (
              <button
                onClick={() => {
                  const n = copyDay(ontem, date);
                  showToast(`${n} ${n === 1 ? "bloco copiado" : "blocos copiados"} do dia anterior.`);
                }}
                className="mt-3 min-h-[40px] rounded-md border border-[var(--border)] px-3 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface2)]"
              >
                Copiar do dia anterior
              </button>
            ) : null;
          })()}
        </div>
      ) : (
        <ul className="space-y-2">
          {blocks.map((block) => (
            <BlockRow
              key={block.id}
              block={block}
              now={now}
              onStart={() => startTimer(block.id)}
              onPause={() => pauseTimer(block.id)}
              onFinish={() => {
                finishBlock(block.id);
                showToast("Bloco concluído.");
              }}
              onReopen={() => reopenTimer(block.id)}
              onRemove={() => setConfirmRemove(block)}
            />
          ))}
        </ul>
      )}

      {confirmRemove && (
        <ConfirmDialog
          title="Remover bloco"
          message={`"${confirmRemove.title}" sai do cronograma deste dia. O tempo já contado nele é perdido.`}
          confirmLabel="Remover"
          danger
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => {
            removeBlock(confirmRemove.id);
            setConfirmRemove(null);
            showToast("Bloco removido.");
          }}
        />
      )}
    </div>
  );
}
