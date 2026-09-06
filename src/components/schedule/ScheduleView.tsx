"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { ScheduleBlock } from "@/lib/types";
import {
  DURATION_PRESETS,
  BREAK_MINUTES,
  EXTEND_MINUTES,
  blocksOfDay,
  elapsedMs,
  formatDuration,
  isOvertime,
  isRunning,
  progressPercent,
  ordenarParaExibicao,
  remainingMs,
  scheduleTotals,
} from "@/lib/schedule";
import { addDaysISO, todayISO } from "@/lib/date-utils";
import { topicKind } from "@/lib/wishlist";
import {
  agendarFim,
  avisarInicio,
  cancelarFim,
  limparAvisoDeInicio,
  pedirPermissao,
  permissaoAtual,
} from "@/lib/notifications";
import { BotaoNotificacoes } from "./BotaoNotificacoes";
import { EditarBloco } from "./EditarBloco";
import { useToast } from "../shared/Toast";
import { ConfirmDialog } from "../shared/ConfirmDialog";

function BlockRow({
  block,
  projeto,
  onEdit,
  onExtend,
  now,
  onStart,
  onPause,
  onFinish,
  onSkip,
  onReopen,
  onRemove,
}: {
  block: ScheduleBlock;
  now: number;
  projeto?: string;
  onStart: () => void;
  onEdit: () => void;
  onExtend: () => void;
  onPause: () => void;
  onFinish: () => void;
  onSkip: () => void;
  onReopen: () => void;
  onRemove: () => void;
}) {
  const running = isRunning(block);
  const done = !!block.completedAt;
  const naoFeito = !!block.skippedAt;
  // "Encerrado" cobre os dois desfechos; só o aberto ainda aceita cronômetro.
  const encerrado = done || naoFeito;
  const over = isOvertime(block, now);
  const remaining = remainingMs(block, now);
  const spent = elapsedMs(block, now);

  const timeColor = naoFeito
    ? "var(--muted)"
    : done
    ? "var(--success)"
    : over
      ? "var(--danger)"
      : running
        ? "var(--brand)"
        : "var(--muted)";

  return (
    <li
      className={`rounded-xl border p-3 transition ${
        block.isBreak ? "bg-[var(--surface2)]" : "bg-[var(--surface)]"
      } ${
        running
          ? "border-[var(--brand)]"
          : naoFeito
            ? "border-dashed border-[var(--border)] opacity-70"
            : "border-[var(--border)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm font-medium ${
              encerrado ? "text-[var(--muted)] line-through" : "text-[var(--foreground)]"
            }`}
          >
            {block.isBreak && "☕ "}
            {block.title}
          </p>
          <p className="mt-0.5 text-[11px] tabular-nums text-[var(--muted)]">
            {block.plannedMinutes} min planejados
            {spent > 0 && ` · ${formatDuration(spent)} feitos`}
          </p>
          {projeto && (
            <p className="mt-0.5 truncate text-[11px] text-[var(--brand)]">{projeto}</p>
          )}
        </div>

        <div className="flex shrink-0 items-start gap-1">
          {!encerrado && (
            <button
              onClick={onExtend}
              aria-label={`Somar ${EXTEND_MINUTES} minutos em ${block.title}`}
              title={`+${EXTEND_MINUTES} min`}
              className="min-h-[32px] rounded-md px-1.5 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-[var(--brand)]"
            >
              +{EXTEND_MINUTES}
            </button>
          )}
          <button
            onClick={onEdit}
            aria-label={`Editar ${block.title}`}
            title="Editar"
            className="min-h-[32px] rounded-md px-1.5 text-xs text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-[var(--foreground)]"
          >
            ✎
          </button>
        </div>

        <div className="shrink-0 text-right">
          <p
            className="font-[family-name:var(--font-display)] text-2xl font-semibold tabular-nums"
            style={{ color: timeColor }}
            aria-label={
              naoFeito
                ? `Não feito. ${formatDuration(spent)} gastos`
                : done
                  ? `Concluído em ${formatDuration(spent)}`
                  : over
                  ? `Passou ${formatDuration(-remaining)} do tempo`
                  : `Faltam ${formatDuration(remaining)}`
            }
          >
            {over && !encerrado
              ? `+${formatDuration(-remaining)}`
              : formatDuration(Math.max(0, remaining))}
          </p>
          {naoFeito && (
            <p className="text-[10px] font-medium text-[var(--muted)]">não fiz</p>
          )}
          {over && !encerrado && (
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
            backgroundColor: naoFeito
              ? "var(--surface3)"
              : done
                ? "var(--success)"
                : over
                  ? "var(--danger)"
                  : "var(--brand)",
          }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!encerrado && !running && (
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
        {!encerrado ? (
          <>
            <button
              onClick={onFinish}
              className="min-h-[44px] rounded-md border border-[var(--border)] px-4 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface2)]"
            >
              Concluir
            </button>
            <button
              onClick={onSkip}
              title="Encerra o bloco sem ter feito"
              className="min-h-[44px] rounded-md border border-[var(--border)] px-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface2)]"
            >
              Não fiz
            </button>
          </>
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
    topics,
    tasks,
    setTaskStatus,
    addBlock,
    addBreak,
    extendPlanned,
    settings,
    setParallelTimers,
    removeBlock,
    startTimer,
    pauseTimer,
    finishBlock,
    skipBlockToday,
    reopenTimer,
    copyDay,
  } = useApp();
  const { showToast } = useToast();

  const [date, setDate] = useState(todayISO());
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState(40);
  const [topicId, setTopicId] = useState("");
  const [tarefaExistenteId, setTarefaExistenteId] = useState("");
  const [semTitulo, setSemTitulo] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<ScheduleBlock | null>(null);
  const [editando, setEditando] = useState<ScheduleBlock | null>(null);

  const blocks = useMemo(
    () => ordenarParaExibicao(blocksOfDay(schedule, date)),
    [schedule, date]
  );

  // Lista de desejos não recebe bloco de tempo: "comprar uma calça" não é
  // uma sessão de trabalho cronometrada.
  const projetosDisponiveis = useMemo(
    () => topics.filter((t) => !t.archivedAt && topicKind(t) !== "wishlist"),
    [topics]
  );
  /**
   * Tarefas que já existem no projeto escolhido e ainda não foram feitas.
   *
   * O que não vai ser feito hoje é criado direto no projeto; quando o dia
   * chega, escolher a tarefa daqui evita criar uma segunda cópia dela — que
   * é o que acontecia antes, e deixava a mesma coisa em dois cartões.
   */
  const tarefasEmAberto = useMemo(() => {
    if (!topicId) return [];
    return tasks.filter(
      (t) =>
        t.topicId === topicId &&
        t.status !== "done" &&
        !t.deletedAt &&
        !t.archivedAt &&
        // Já tem bloco hoje: escolher de novo criaria dois cronômetros pra
        // mesma tarefa e o total do dia contaria o trabalho em dobro.
        !schedule.some((b) => b.date === date && b.taskId === t.id)
    );
  }, [tasks, topicId, schedule, date]);

  const nomeDoProjeto = useMemo(() => {
    const mapa = new Map(topics.map((t) => [t.id, t.name]));
    return (id: string | undefined) => (id ? mapa.get(id) : undefined);
  }, [topics]);
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

  // Intervalo tem seu próprio total: somar o café às horas produzidas faria
  // o número do dia mentir na direção mais fácil de acreditar.
  const totals = useMemo(
    () => scheduleTotals(blocks.filter((b) => !b.isBreak), now),
    [blocks, now]
  );
  // Conta TODOS os cronômetros do dia, intervalo incluído: um intervalo
  // correndo junto com uma tarefa distorce o total do mesmo jeito, e o
  // aviso existe justamente pra isso não passar batido.
  const rodandoAgora = useMemo(() => blocks.filter(isRunning).length, [blocks]);
  const intervaloMs = useMemo(
    () =>
      blocks.filter((b) => b.isBreak).reduce((soma, b) => soma + elapsedMs(b, now), 0),
    [blocks, now]
  );
  const isToday = date === todayISO();

  /**
   * Começar o bloco também avisa na central de notificações do aparelho.
   *
   * A permissão é pedida aqui, no clique, e não ao abrir o app: é o único
   * momento em que o pedido faz sentido pra quem está usando — e navegador
   * nenhum aceita o pedido fora de um gesto do usuário.
   */
  async function iniciarComAviso(block: ScheduleBlock) {
    // Quem estava rodando ANTES do clique — depois já é tarde pra saber.
    const pausados = settings.parallelTimers
      ? []
      : blocks.filter((b) => b.id !== block.id && isRunning(b));

    startTimer(block.id);

    if (pausados.length > 0) {
      // Pausar por baixo dos panos é o que fazia parecer que rodar duas
      // coisas juntas era impossível. Agora o app diz o que fez e oferece a
      // opção no mesmo toque, em vez de esperar que a caixinha seja achada.
      showToast(
        `Pausei "${pausados[0].title}" pra começar esta.`,
        () => {
          setParallelTimers(true);
          pausados.forEach((b) => startTimer(b.id));
        },
        "Rodar as duas"
      );
    }

    const restanteMs = Math.max(0, remainingMs(block));
    // Usa o resultado do pedido em vez de reler a permissão: no iPhone a
    // releitura logo depois do prompt ainda vinha "default" e o aviso era
    // descartado justo na vez em que a pessoa acabara de autorizar.
    const permissao =
      permissaoAtual() === "default" ? await pedirPermissao() : permissaoAtual();
    if (permissao !== "granted") return;

    avisarInicio(block.title, block.plannedMinutes, restanteMs, permissao);
    agendarFim(block.id, block.title, block.plannedMinutes, restanteMs);
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    // Antes o clique em Add simplesmente não fazia nada quando faltava o
    // nome — dava a impressão de que o botão tinha falhado.
    if (!t) {
      setSemTitulo(true);
      showToast("Escreva o que vai fazer antes de adicionar.");
      return;
    }
    addBlock(date, t, minutes, {
      topicId: topicId || undefined,
      taskId: tarefaExistenteId || undefined,
    });
    setTitle("");
    setTarefaExistenteId("");
    setSemTitulo(false);
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
            {intervaloMs > 0 && (
              <span className="tabular-nums text-[var(--muted)]">
                <strong className="text-[var(--foreground)]">
                  {formatDuration(intervaloMs)}
                </strong>{" "}
                de intervalo
              </span>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--muted)]">
            <input
              type="checkbox"
              checked={settings.parallelTimers}
              onChange={(e) => setParallelTimers(e.target.checked)}
              className="accent-[var(--brand)]"
            />
            Deixar mais de um cronômetro rodando
          </label>
          {rodandoAgora > 1 && (
            <span className="tabular-nums text-[11px] font-medium text-[var(--warning)]">
              {rodandoAgora} cronômetros rodando — o total soma todos
            </span>
          )}
        </div>
      </header>

      <form
        onSubmit={handleAdd}
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
      >
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setSemTitulo(false);
            }}
            placeholder="O que vai fazer? Ex: Chamar leads"
            aria-label="Nome do bloco"
            aria-invalid={semTitulo}
            className={`min-h-[44px] min-w-0 flex-1 rounded-md border bg-[var(--surface2)] px-3 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--focus)] ${
              semTitulo ? "border-[var(--danger)]" : "border-[var(--border)]"
            }`}
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

        {projetosDisponiveis.length > 0 && (
          <div className="mt-2">
            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              aria-label="Projeto do bloco"
              className="min-h-[36px] w-full rounded-md border border-[var(--border)] bg-[var(--surface2)] px-2 text-xs text-[var(--foreground)] outline-none focus:border-[var(--focus)]"
            >
              <option value="">Sem projeto</option>
              {projetosDisponiveis.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {topicId && tarefasEmAberto.length > 0 && (
              <select
                value={tarefaExistenteId}
                onChange={(e) => {
                  setTarefaExistenteId(e.target.value);
                  const escolhida = tasks.find((t) => t.id === e.target.value);
                  if (escolhida) {
                    setTitle(escolhida.title);
                    setSemTitulo(false);
                    if (escolhida.estimatedMinutes) setMinutes(escolhida.estimatedMinutes);
                  }
                }}
                aria-label="Tarefa que já existe no projeto"
                className="mt-1.5 min-h-[36px] w-full rounded-md border border-[var(--border)] bg-[var(--surface2)] px-2 text-xs text-[var(--foreground)] outline-none focus:border-[var(--focus)]"
              >
                <option value="">Criar uma tarefa nova</option>
                {tarefasEmAberto.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            )}
            {topicId && (
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                {tarefaExistenteId
                  ? "Vai usar essa tarefa que já existe — nenhuma cópia é criada."
                  : "A tarefa também vai ser criada dentro do projeto — não precisa escrever nos dois lugares."}
              </p>
            )}
          </div>
        )}

        <BotaoNotificacoes />
      </form>

      <button
        type="button"
        onClick={() => {
          addBreak(date, BREAK_MINUTES);
          showToast(`Intervalo de ${BREAK_MINUTES} min começou. Use o + pra esticar.`);
        }}
        className="min-h-[44px] w-full rounded-xl border border-dashed border-[var(--border)] text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
      >
        ☕ Intervalo de {BREAK_MINUTES} min
      </button>

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
              projeto={nomeDoProjeto(block.topicId)}
              onEdit={() => setEditando(block)}
              onExtend={() => extendPlanned(block.id, EXTEND_MINUTES)}
              onStart={() => iniciarComAviso(block)}
              onPause={() => {
                pauseTimer(block.id);
                cancelarFim(block.id);
                limparAvisoDeInicio();
              }}
              onFinish={() => {
                // Olha a tarefa ANTES de concluir: depois ela já estará feita
                // e não daria pra saber se foi este bloco que a fechou.
                const vinculada = block.taskId
                  ? tasks.find((t) => t.id === block.taskId && t.status !== "done")
                  : undefined;
                finishBlock(block.id);
                cancelarFim(block.id);
                limparAvisoDeInicio();
                showToast(
                  vinculada
                    ? "Bloco concluído — e a tarefa no projeto também."
                    : "Bloco concluído.",
                  // Um bloco pode ser só uma sessão de uma tarefa maior; nesse
                  // caso concluir a tarefa é errado, e desfazer tem que ser um
                  // toque.
                  vinculada ? () => setTaskStatus(vinculada.id, "todo") : undefined
                );
              }}
              onSkip={() => {
                skipBlockToday(block.id);
                cancelarFim(block.id);
                limparAvisoDeInicio();
                showToast("Marcado como não feito.", () => reopenTimer(block.id));
              }}
              onReopen={() => reopenTimer(block.id)}
              onRemove={() => setConfirmRemove(block)}
            />
          ))}
        </ul>
      )}

      {editando && (
        <EditarBloco
          block={editando}
          projetos={projetosDisponiveis}
          onClose={() => setEditando(null)}
        />
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
