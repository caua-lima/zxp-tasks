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
  isParked,
  ordenarParaExibicao,
  remainingMs,
  scheduleTotals,
} from "@/lib/schedule";
import { addDaysISO, todayISO } from "@/lib/date-utils";
import { topicKind } from "@/lib/wishlist";
import {
  agendarFim,
  avisarInicio,
  avisarInicioLivre,
  cancelarFim,
  limparAvisoDeInicio,
  pedirPermissao,
  permissaoAtual,
} from "@/lib/notifications";
import { BotaoNotificacoes } from "./BotaoNotificacoes";
import { EditarBloco } from "./EditarBloco";
import { ProgramarModal } from "./ProgramarModal";
import { BotaoDeVoz } from "./BotaoDeVoz";
import { avisarOutrosAparelhos } from "@/lib/push";
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
  onPark,
  onResume,
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
  onPark: () => void;
  onResume: () => void;
  onReopen: () => void;
  onRemove: () => void;
}) {
  const running = isRunning(block);
  const done = !!block.completedAt;
  const naoFeito = !!block.skippedAt;
  const emEspera = !!block.parkedAt;
  const retomadoDepois = !!block.resumedAt;
  const semTempo = !!block.openEnded;
  // "Encerrado" cobre os dois desfechos; só o aberto ainda aceita cronômetro.
  const encerrado = done || naoFeito || emEspera;
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
        ? "var(--accent)"
        : "var(--muted)";

  return (
    <li
      className={`rounded-xl border p-3 transition ${
        block.isBreak ? "bg-[var(--surface2)]" : "bg-[var(--surface)]"
      } ${
        running
          ? "border-[var(--accent)]"
          : naoFeito || emEspera
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
            {semTempo ? "sem tempo definido" : `${block.plannedMinutes} min planejados`}
            {spent > 0 && !semTempo && ` · ${formatDuration(spent)} feitos`}
          </p>
          {projeto && (
            <p className="mt-0.5 truncate text-[11px] text-[var(--accent)]">{projeto}</p>
          )}
          {block.programacaoId && (
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
              ⏰ programado
            </p>
          )}
          {!!block.metaIds?.length && (
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
              🎯 conta pra meta
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-start gap-1">
          {!encerrado && !semTempo && (
            <button
              onClick={onExtend}
              aria-label={`Somar ${EXTEND_MINUTES} minutos em ${block.title}`}
              title={`+${EXTEND_MINUTES} min`}
              className="min-h-[32px] rounded-md px-1.5 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-[var(--accent)]"
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
              semTempo
                ? `${formatDuration(spent)} corridos, sem tempo combinado`
                : naoFeito
                ? `Não feito. ${formatDuration(spent)} gastos`
                : done
                  ? `Concluído em ${formatDuration(spent)}`
                  : over
                  ? `Passou ${formatDuration(-remaining)} do tempo`
                  : `Faltam ${formatDuration(remaining)}`
            }
          >
            {semTempo
              ? formatDuration(spent)
              : over && !encerrado
                ? `+${formatDuration(-remaining)}`
                : formatDuration(Math.max(0, remaining))}
          </p>
          {naoFeito && (
            <p className="text-[10px] font-medium text-[var(--muted)]">não fiz</p>
          )}
          {emEspera && (
            <p className="text-[10px] font-medium text-[var(--accent)]">
              {retomadoDepois ? "retomado depois" : "em espera"}
            </p>
          )}
          {over && !encerrado && (
            <p className="text-[10px] font-medium text-[var(--danger)]">passou do tempo</p>
          )}
        </div>
      </div>

      <div
        className={`mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface3)] ${
          semTempo ? "invisible" : ""
        }`}
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
                  : "var(--accent)",
          }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!encerrado && !running && (
          <button
            onClick={onStart}
            className="min-h-[44px] flex-1 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-dark)]"
          >
            {spent > 0 ? "Continuar" : "Começar"}
          </button>
        )}
        {running && (
          <button
            onClick={onPause}
            className="min-h-[44px] flex-1 rounded-md border border-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--surface2)]"
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
            {spent > 0 && (
              <button
                onClick={onPark}
                title="Começou e vai terminar em outra hora ou outro dia"
                className="min-h-[44px] rounded-md border border-[var(--border)] px-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface2)]"
              >
                Pra depois
              </button>
            )}
          </>
        ) : emEspera && !retomadoDepois ? (
          <button
            onClick={onResume}
            className="min-h-[44px] flex-1 rounded-md border border-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--surface2)]"
          >
            Retomar
          </button>
        ) : retomadoDepois ? (
          // Já continua em outro dia: reabrir aqui criaria dois blocos contando
          // o mesmo trabalho.
          <span className="flex min-h-[44px] flex-1 items-center justify-center text-xs text-[var(--muted)]">
            Continua em outro dia
          </span>
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
    metas,
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
    parkBlockLater,
    resumeParkedBlock,
    reopenTimer,
    copyDay,
  } = useApp();
  const { showToast } = useToast();

  const [date, setDate] = useState(todayISO());
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState(40);
  const [topicId, setTopicId] = useState("");
  const [tarefaExistenteId, setTarefaExistenteId] = useState("");
  // Vínculos extras do que está nascendo agora: outros projetos e metas.
  const [extrasBloco, setExtrasBloco] = useState<string[]>([]);
  const [metasBloco, setMetasBloco] = useState<string[]>([]);
  const [mostrarVinculos, setMostrarVinculos] = useState(false);
  const [semTitulo, setSemTitulo] = useState(false);
  const [tempoLivre, setTempoLivre] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<ScheduleBlock | null>(null);
  const [editando, setEditando] = useState<ScheduleBlock | null>(null);
  const [programando, setProgramando] = useState(false);

  const blocks = useMemo(
    () => ordenarParaExibicao(blocksOfDay(schedule, date)),
    [schedule, date]
  );

  /**
   * Tudo que foi guardado pra depois e ainda não voltou, de QUALQUER dia.
   * Os do dia aberto na tela ficam de fora: já aparecem na própria lista, com
   * o botão "Retomar" — listar duas vezes seria ruído.
   */
  const blocosEmEspera = useMemo(
    () =>
      schedule
        .filter((b) => isParked(b) && b.date !== date)
        .sort((a, b) => (a.parkedAt! < b.parkedAt! ? 1 : -1)),
    [schedule, date]
  );

  // Lista de desejos não recebe bloco de tempo: "comprar uma calça" não é
  // uma sessão de trabalho cronometrada.
  const projetosDisponiveis = useMemo(
    () => topics.filter((t) => !t.archivedAt && topicKind(t) !== "wishlist"),
    [topics]
  );
  const metasAtivas = useMemo(() => metas.filter((m) => !m.archivedAt), [metas]);
  const outrosProjetosBloco = useMemo(
    () => projetosDisponiveis.filter((t) => t.id !== topicId),
    [projetosDisponiveis, topicId]
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

    if (block.openEnded) {
      // Sem tempo combinado não há hora de fim pra prometer nem alarme pra
      // agendar — só o aviso de que começou.
      avisarInicioLivre(block.title, permissao);
      void avisarOutrosAparelhos(`▶ ${block.title}`, "Em andamento, sem tempo definido.");
      return;
    }
    avisarInicio(block.title, block.plannedMinutes, restanteMs, permissao);
    agendarFim(block.id, block.title, block.plannedMinutes, restanteMs);
    void avisarOutrosAparelhos(
      `▶ ${block.title}`,
      `Tarefa de ${block.plannedMinutes} min iniciada em outro aparelho.`
    );
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
    criar(t, { jaFeito: false });
  }

  /** Caminho único de criação — usado pelo Add, pelo "Já fiz" e pela voz. */
  function criar(t: string, { jaFeito }: { jaFeito: boolean }, minutosDitados?: number) {
    addBlock(date, t, minutosDitados ?? minutes, {
      topicId: topicId || undefined,
      taskId: tarefaExistenteId || undefined,
      // "Já fiz" precisa de um tempo pra registrar; tempo livre só faz
      // sentido enquanto o cronômetro ainda vai rodar.
      openEnded: tempoLivre && !jaFeito && minutosDitados === undefined,
      jaFeito,
      // Tarefa que já existe traz os próprios vínculos (editáveis nela); aqui
      // só vale pro que está nascendo agora.
      extraTopicIds: tarefaExistenteId ? undefined : extrasBloco,
      metaIds: tarefaExistenteId ? undefined : metasBloco,
    });
    setTitle("");
    setTarefaExistenteId("");
    setExtrasBloco([]);
    setMetasBloco([]);
    setMostrarVinculos(false);
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
              <strong style={{ color: "var(--accent)" }}>
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
              className="accent-[var(--accent)]"
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
          <BotaoDeVoz
            onComando={(c) => {
              // Ditar já cria: repetir o toque no Add depois de falar
              // desfaria o sentido de ter falado.
              criar(c.titulo, { jaFeito: false }, c.minutos);
              showToast(
                c.minutos
                  ? `"${c.titulo}" — ${c.minutos} min.`
                  : `"${c.titulo}" — sem tempo definido.`
              );
            }}
            onErro={(m) => showToast(m)}
          />
          <button
            type="submit"
            className="min-h-[44px] shrink-0 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-dark)]"
          >
            Add
          </button>
        </div>


        <div className="mt-2 flex flex-wrap gap-1.5">
          {DURATION_PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMinutes(m);
                setTempoLivre(false);
              }}
              aria-pressed={minutes === m && !tempoLivre}
              className={`min-h-[36px] rounded-md border px-3 text-xs font-medium transition ${
                minutes === m
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
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
            onChange={(e) => {
              setMinutes(Math.max(1, Number(e.target.value) || 1));
              setTempoLivre(false);
            }}
            placeholder="outro"
            aria-label="Duração personalizada em minutos"
            className="min-h-[36px] w-20 rounded-md border border-[var(--border)] bg-[var(--surface2)] px-2 text-xs tabular-nums text-[var(--foreground)] outline-none focus:border-[var(--focus)]"
          />
          <button
            type="button"
            onClick={() => setTempoLivre((v) => !v)}
            aria-pressed={tempoLivre}
            title="Cronômetro conta pra cima, sem tempo combinado"
            className={`min-h-[36px] rounded-md border px-3 text-xs font-medium transition ${
              tempoLivre
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface2)]"
            }`}
          >
            sem tempo
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            const t = title.trim();
            if (!t) {
              setSemTitulo(true);
              showToast("Escreva o que você fez antes de registrar.");
              return;
            }
            criar(t, { jaFeito: true });
            showToast(`"${t}" registrado como feito (${minutes} min).`);
          }}
          className="mt-2 w-full rounded-md border border-dashed border-[var(--border)] py-2 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-[var(--foreground)]"
        >
          ✓ Já fiz — registrar {minutes} min sem cronômetro
        </button>

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

        {!tarefaExistenteId &&
          (metasAtivas.length > 0 || (!!topicId && outrosProjetosBloco.length > 0)) &&
          (mostrarVinculos ? (
            <div className="mt-2 space-y-2.5 rounded-lg border border-[var(--border)] p-2.5">
              {!!topicId && outrosProjetosBloco.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] text-[var(--muted)]">Também aparece em</p>
                  <div className="flex flex-wrap gap-1.5">
                    {outrosProjetosBloco.map((t) => {
                      const marcado = extrasBloco.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          aria-pressed={marcado}
                          onClick={() =>
                            setExtrasBloco((atuais) =>
                              marcado ? atuais.filter((x) => x !== t.id) : [...atuais, t.id]
                            )
                          }
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                            marcado
                              ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                              : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface2)]"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: t.color }}
                          />
                          {t.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {metasAtivas.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] text-[var(--muted)]">Conta pra meta</p>
                  <div className="flex flex-wrap gap-1.5">
                    {metasAtivas.map((m) => {
                      const marcado = metasBloco.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          aria-pressed={marcado}
                          onClick={() =>
                            setMetasBloco((atuais) =>
                              marcado ? atuais.filter((x) => x !== m.id) : [...atuais, m.id]
                            )
                          }
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                            marcado
                              ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                              : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface2)]"
                          }`}
                        >
                          {m.title} · {m.dailyTarget} {m.unit}/dia
                        </button>
                      );
                    })}
                  </div>
                  {metasBloco.length > 0 && !topicId && (
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      Sem projeto, a meta fica guardada no próprio bloco e conta quando ele
                      for concluído.
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setMostrarVinculos(true)}
              className="mt-2 block text-xs font-medium text-[var(--accent)] hover:underline"
            >
              + Outro projeto ou meta
            </button>
          ))}

        <BotaoNotificacoes />
      </form>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            addBreak(date, BREAK_MINUTES);
            showToast(`Intervalo de ${BREAK_MINUTES} min começou. Use o + pra esticar.`);
          }}
          className="min-h-[44px] rounded-xl border border-dashed border-[var(--border)] px-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
        >
          ☕ Intervalo de {BREAK_MINUTES} min
        </button>
        <button
          type="button"
          onClick={() => setProgramando(true)}
          className="min-h-[44px] rounded-xl border border-dashed border-[var(--border)] px-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
        >
          ⏰ Programar
        </button>
      </div>

      {blocosEmEspera.length > 0 && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            Em espera{" "}
            <span className="tabular-nums text-[var(--muted)]">({blocosEmEspera.length})</span>
          </h2>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">
            Começados e guardados pra depois. Retomar traz pro dia de hoje, e o
            tempo já feito continua contado no dia em que foi feito.
          </p>
          <ul className="mt-2 space-y-1.5">
            {blocosEmEspera.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--border)] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-[var(--foreground)]">{b.title}</p>
                  <p className="text-[11px] tabular-nums text-[var(--muted)]">
                    {new Date(b.date + "T00:00:00").toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                    })}{" "}
                    · {formatDuration(elapsedMs(b, now))} feitos
                    {nomeDoProjeto(b.topicId) && ` · ${nomeDoProjeto(b.topicId)}`}
                  </p>
                </div>
                <button
                  onClick={() => {
                    resumeParkedBlock(b.id);
                    showToast(`"${b.title}" voltou pro cronograma de hoje.`);
                  }}
                  className="min-h-[40px] shrink-0 rounded-md border border-[var(--accent)] px-3 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--surface2)]"
                >
                  Retomar hoje
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

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
              onPark={() => {
                parkBlockLater(block.id);
                cancelarFim(block.id);
                limparAvisoDeInicio();
                showToast(
                  "Guardado pra depois — o tempo feito fica contado hoje.",
                  () => reopenTimer(block.id)
                );
              }}
              onResume={() => {
                resumeParkedBlock(block.id);
                showToast("De volta ao cronograma. É só tocar em Começar.");
              }}
              onReopen={() => reopenTimer(block.id)}
              onRemove={() => setConfirmRemove(block)}
            />
          ))}
        </ul>
      )}

      {programando && <ProgramarModal onClose={() => setProgramando(false)} />}

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
