import { Board, ScheduleBlock, Sessao } from "./types";
import { aplicarMetasDoBloco } from "./metas";
import { concluirTarefaNoBoard } from "./task-completion";
import { todayISO } from "./date-utils";

export const MINUTE_MS = 60_000;

/** Durações que aparecem de verdade na agenda: 20, 30, 40, 60, 90 min. */
export const DURATION_PRESETS = [20, 30, 40, 60, 90];

export function isRunning(block: ScheduleBlock): boolean {
  return !!block.startedAt && !isFinished(block);
}

/** Concluído OU marcado como não feito — os dois encerram o bloco. */
/**
 * Encerrado no dia: concluído, marcado como não feito, ou guardado pra
 * depois. Os três tiram o bloco da frente da lista e desligam o cronômetro.
 */
export function isFinished(block: ScheduleBlock): boolean {
  return !!block.completedAt || !!block.skippedAt || !!block.parkedAt;
}

/** Guardado pra depois e ainda não retomado — é o que aparece em "Em espera". */
export function isParked(block: ScheduleBlock): boolean {
  return !!block.parkedAt && !block.resumedAt;
}

/**
 * Tempo já gasto no bloco. O trecho em andamento é calculado a partir do
 * instante de início — por isso o cronômetro continua certo depois de
 * fechar o app, bloquear o celular ou recarregar a página.
 */
export function elapsedMs(block: ScheduleBlock, now: number = Date.now()): number {
  const running = isRunning(block) ? now - new Date(block.startedAt!).getTime() : 0;
  // Relógio do sistema pode andar pra trás (ajuste de fuso/NTP) e gerar
  // trecho negativo; nunca deixar o total encolher por causa disso.
  return block.accumulatedMs + Math.max(0, running);
}

/** Tempo combinado. Zero quando o bloco é de tempo livre — nada foi combinado. */
export function plannedMs(block: ScheduleBlock): number {
  return block.openEnded ? 0 : block.plannedMinutes * MINUTE_MS;
}

/** Positivo = tempo restante. Negativo = passou do combinado. */
export function remainingMs(block: ScheduleBlock, now: number = Date.now()): number {
  return plannedMs(block) - elapsedMs(block, now);
}

export function isOvertime(block: ScheduleBlock, now: number = Date.now()): boolean {
  // Sem tempo combinado não há como passar do tempo.
  if (block.openEnded) return false;
  return remainingMs(block, now) < 0;
}

/** Percentual concluído do bloco, travado em 100 pra barra não estourar. */
export function progressPercent(block: ScheduleBlock, now: number = Date.now()): number {
  const total = plannedMs(block);
  if (total <= 0) return 0;
  return Math.min(100, Math.round((elapsedMs(block, now) / total) * 100));
}

/** "40:00", "1:05:03" — sem casas decimais, sempre legível de relance. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function startBlock(
  block: ScheduleBlock,
  now: string = new Date().toISOString()
): ScheduleBlock {
  if (isRunning(block)) return block;
  // Startar um bloco já concluído reabre — o tempo acumulado é preservado.
  return { ...block, startedAt: now, completedAt: undefined };
}

export function pauseBlock(
  block: ScheduleBlock,
  now: number = Date.now()
): ScheduleBlock {
  if (!isRunning(block)) return block;
  const inicio = new Date(block.startedAt!).getTime();
  // Guarda o trecho de verdade (início e fim), não só quanto durou — é o
  // que permite somar o RELÓGIO do dia sem contar em dobro quando duas
  // tarefas rodam juntas. Relógio andando pra trás (mesma trava de
  // `elapsedMs`) não pode gerar uma sessão de duração negativa.
  const sessions =
    now > inicio
      ? [...(block.sessions ?? []), { start: block.startedAt!, end: new Date(now).toISOString() }]
      : block.sessions;
  return {
    ...block,
    accumulatedMs: elapsedMs(block, now),
    startedAt: undefined,
    sessions,
  };
}

/** Concluir sempre congela o tempo: um bloco feito não pode seguir contando. */
export function completeBlock(
  block: ScheduleBlock,
  nowIso: string = new Date().toISOString()
): ScheduleBlock {
  const frozen = pauseBlock(block, new Date(nowIso).getTime());
  // Concluir depois de ter marcado "não fiz" limpa a marca: o bloco não
  // pode estar nos dois estados ao mesmo tempo.
  return { ...frozen, completedAt: block.completedAt ?? nowIso, skippedAt: undefined };
}

/**
 * Encerra o bloco sem ter feito. Congela o cronômetro igual a concluir — o
 * tempo que já foi gasto tentando é real e continua valendo.
 */
export function skipBlock(
  block: ScheduleBlock,
  nowIso: string = new Date().toISOString()
): ScheduleBlock {
  const frozen = pauseBlock(block, new Date(nowIso).getTime());
  return { ...frozen, skippedAt: block.skippedAt ?? nowIso, completedAt: undefined };
}

/**
 * Guarda o bloco pra depois. Congela o cronômetro como concluir e "não fiz"
 * fazem: o tempo já gasto é trabalho real e fica registrado neste dia.
 */
export function parkBlock(
  block: ScheduleBlock,
  nowIso: string = new Date().toISOString()
): ScheduleBlock {
  const frozen = pauseBlock(block, new Date(nowIso).getTime());
  return {
    ...frozen,
    parkedAt: block.parkedAt ?? nowIso,
    resumedAt: undefined,
    completedAt: undefined,
    skippedAt: undefined,
  };
}

/**
 * Retoma um bloco em espera.
 *
 * No MESMO dia, ele só volta a ficar aberto — nada a separar. Em OUTRO dia,
 * o bloco antigo fica onde está (marcado como retomado) e nasce um bloco
 * novo hoje, ligado à mesma tarefa. Mover o antigo pra hoje levaria junto o
 * tempo trabalhado ontem, e o relatório passaria a mentir sobre os dois dias.
 *
 * O bloco novo começa com o que FALTAVA do planejado; se já tinha estourado,
 * volta com o planejado original em vez de um prazo zero ou negativo.
 */
export function retomarBloco(
  block: ScheduleBlock,
  hoje: string,
  nowIso: string,
  novoId: string,
  proximaOrdem: number
): { antigo: ScheduleBlock; novo: ScheduleBlock | null } {
  if (block.date === hoje) {
    return { antigo: { ...block, parkedAt: undefined, resumedAt: undefined }, novo: null };
  }

  const faltavaMin = Math.ceil((block.plannedMinutes * MINUTE_MS - block.accumulatedMs) / MINUTE_MS);
  const plannedMinutes = block.openEnded
    ? block.plannedMinutes
    : faltavaMin > 0
      ? faltavaMin
      : block.plannedMinutes;

  return {
    antigo: { ...block, resumedAt: nowIso },
    novo: {
      id: novoId,
      date: hoje,
      title: block.title,
      plannedMinutes,
      accumulatedMs: 0,
      order: proximaOrdem,
      topicId: block.topicId,
      taskId: block.taskId,
      openEnded: block.openEnded,
      // A meta e a classificação de intervalo são do TRABALHO que continua,
      // não do bloco de ontem em si — sem isto, retomar em outro dia parava
      // de contar pra meta e um intervalo retomado virava trabalho comum.
      metaIds: block.metaIds,
      isBreak: block.isBreak,
      continuaDe: block.id,
      // `programacaoId` fica de fora de propósito: o bloco novo não é o
      // expediente de hoje gerado pela programação, é uma continuação
      // manual — copiar o id faria dois blocos reivindicarem a mesma
      // identidade de ocorrência programada.
    },
  };
}

export function reopenBlock(block: ScheduleBlock): ScheduleBlock {
  return {
    ...block,
    completedAt: undefined,
    skippedAt: undefined,
    parkedAt: undefined,
    resumedAt: undefined,
  };
}

/** Zera o cronômetro sem apagar o bloco. */
export function resetBlock(block: ScheduleBlock): ScheduleBlock {
  return {
    ...block,
    accumulatedMs: 0,
    // Sem isto, o relatório de relógio (que lê `sessions`) continuava
    // mostrando o tempo de antes do reset enquanto o "acumulado" já
    // mostrava zero — dois números diferentes pro mesmo bloco.
    sessions: undefined,
    startedAt: undefined,
    completedAt: undefined,
    skippedAt: undefined,
    parkedAt: undefined,
    resumedAt: undefined,
  };
}

export interface ScheduleTotals {
  plannedMs: number;
  elapsedMs: number;
  doneCount: number;
  /** Encerrados sem terem sido feitos. */
  skippedCount: number;
  total: number;
  runningId: string | null;
  /** Todos os que estão correndo — pode ser mais de um em modo paralelo. */
  runningIds: string[];
}

export function scheduleTotals(
  blocks: ScheduleBlock[],
  now: number = Date.now()
): ScheduleTotals {
  let planned = 0;
  let elapsed = 0;
  let doneCount = 0;
  let skippedCount = 0;
  const runningIds: string[] = [];

  for (const b of blocks) {
    planned += plannedMs(b);
    elapsed += elapsedMs(b, now);
    if (b.completedAt) doneCount++;
    else if (b.skippedAt) skippedCount++;
    if (isRunning(b)) runningIds.push(b.id);
  }

  return {
    plannedMs: planned,
    elapsedMs: elapsed,
    doneCount,
    skippedCount,
    total: blocks.length,
    runningId: runningIds[0] ?? null,
    runningIds,
  };
}

/**
 * Todos os trechos em que o bloco esteve ligado, incluindo o que está
 * rodando agora (se estiver).
 *
 * Bloco de antes deste campo existir não tem `sessions` registrada — vira
 * UMA sessão aproximada, do tamanho do que já está em `accumulatedMs`,
 * ancorada no que se sabe de mais concreto (o próprio `sessions[0]`, ou o
 * início do trecho atual, ou o instante do desfecho). Não é exata (um bloco
 * antigo pausado várias vezes vira um intervalo só), mas nunca finge um
 * relógio mais preciso do que o dado disponível permite — e não é pior do
 * que a soma simples que existia antes deste recurso.
 */
export function allSessions(block: ScheduleBlock, now: number = Date.now()): Sessao[] {
  const registradas = block.sessions ?? [];
  const emAndamento: Sessao[] = isRunning(block)
    ? [{ start: block.startedAt!, end: new Date(now).toISOString() }]
    : [];

  const duracao = (s: Sessao) =>
    Math.max(0, new Date(s.end).getTime() - new Date(s.start).getTime());
  // Só as sessões FECHADAS entram nessa soma. `accumulatedMs` só junta o que
  // já foi pausado (ver `elapsedMs`) — o trecho em andamento nunca fez parte
  // dele. Incluir `emAndamento` aqui subtraía o mesmo tempo duas vezes e
  // escondia parte do acumulado de um bloco legado que estivesse rodando.
  const somaFechada = registradas.reduce((soma, s) => soma + duracao(s), 0);
  const faltante = block.accumulatedMs - somaFechada;
  if (faltante <= 0) return [...registradas, ...emAndamento];

  const ancora = registradas[0]?.start ?? block.completedAt ?? block.skippedAt ??
    block.parkedAt ?? emAndamento[0]?.start;
  if (!ancora) return [...registradas, ...emAndamento];

  const aproximada: Sessao = {
    start: new Date(new Date(ancora).getTime() - faltante).toISOString(),
    end: ancora,
  };
  return [aproximada, ...registradas, ...emAndamento];
}

/**
 * Tempo de RELÓGIO de um conjunto de blocos — a união dos intervalos, não a
 * soma das durações. Duas tarefas de 3h rodando juntas viram 3h aqui, nunca
 * 6h; é essa diferença que faz a média diária dizer a verdade quando existe
 * mais de um cronômetro ligado ao mesmo tempo (`settings.parallelTimers`).
 * Intervalo (`isBreak`) fica de fora, como em todo outro total do dia.
 */
export function wallClockMs(blocks: ScheduleBlock[], now: number = Date.now()): number {
  const intervalos = blocks
    .filter((b) => !b.isBreak)
    .flatMap((b) => allSessions(b, now))
    .map((s) => [new Date(s.start).getTime(), new Date(s.end).getTime()] as const)
    .filter(([inicio, fim]) => fim > inicio)
    .sort((a, b) => a[0] - b[0]);

  let total = 0;
  let inicioAtual: number | null = null;
  let fimAtual = 0;
  for (const [inicio, fim] of intervalos) {
    if (inicioAtual === null) {
      inicioAtual = inicio;
      fimAtual = fim;
    } else if (inicio <= fimAtual) {
      fimAtual = Math.max(fimAtual, fim);
    } else {
      total += fimAtual - inicioAtual;
      inicioAtual = inicio;
      fimAtual = fim;
    }
  }
  if (inicioAtual !== null) total += fimAtual - inicioAtual;
  return total;
}

export function blocksOfDay(blocks: ScheduleBlock[], date: string): ScheduleBlock[] {
  return blocks.filter((b) => b.date === date).sort((a, b) => a.order - b.order);
}

/**
 * Ordem de exibição do dia: o que ainda não foi feito primeiro, o concluído
 * no fim.
 *
 * Um bloco concluído no meio da lista empurra pra baixo justamente o que
 * ainda importa, e a cada tarefa terminada a próxima ficava mais escondida.
 * A `order` original é preservada dentro de cada grupo — reordenar tudo por
 * horário de conclusão embaralharia o plano do dia.
 */
export function ordenarParaExibicao(blocks: ScheduleBlock[]): ScheduleBlock[] {
  return [...blocks].sort((a, b) => {
    const feitoA = isFinished(a) ? 1 : 0;
    const feitoB = isFinished(b) ? 1 : 0;
    if (feitoA !== feitoB) return feitoA - feitoB;
    return a.order - b.order;
  });
}

/** Estica o tempo planejado do bloco. Nunca encolhe abaixo de 1 minuto. */
export function extendBlock(block: ScheduleBlock, minutos: number): ScheduleBlock {
  return { ...block, plannedMinutes: Math.max(1, block.plannedMinutes + minutos) };
}

/**
 * Cria um bloco já concluído, pro que foi feito sem cronômetro ligado.
 *
 * `minutosGastos` vira tempo acumulado E tempo planejado: registrar depois
 * significa que o combinado e o realizado são a mesma coisa, e inventar uma
 * diferença entre eles só sujaria o relatório.
 */
export function completedBlockData(minutosGastos: number, nowIso: string) {
  const minutos = Math.max(1, Math.round(minutosGastos));
  return {
    plannedMinutes: minutos,
    accumulatedMs: minutos * MINUTE_MS,
    completedAt: nowIso,
  };
}

/**
 * Fecha sozinho um bloco que passou do teto de tempo do PROJETO — "pedido de
 * agência não passa de 30 min, se chegou lá é porque esqueci de concluir".
 *
 * Só bloco de trabalho (não intervalo) rodando de verdade entra na checagem;
 * sem `topicId` não há de onde ler o teto. Idempotente como
 * `materializarProgramacoes`: sem nada pra fechar, devolve o MESMO board.
 */
export function autoConcluirBlocos(
  board: Board,
  now: number = Date.now(),
  gerarId: () => string = () => crypto.randomUUID()
): { board: Board; mudou: boolean } {
  const nowIso = new Date(now).toISOString();
  const dia = todayISO();
  let atual = board;
  let mudou = false;

  for (const block of board.schedule) {
    if (block.isBreak || !block.topicId || !isRunning(block)) continue;
    const limite = atual.topics.find((t) => t.id === block.topicId)?.autoCompleteMinutes;
    if (!limite || elapsedMs(block, now) < limite * MINUTE_MS) continue;

    mudou = true;
    atual = {
      ...atual,
      schedule: atual.schedule.map((x) => (x.id === block.id ? completeBlock(x, nowIso) : x)),
    };
    // Mesma função de conclusão dos outros caminhos — sem isso, uma tarefa
    // recorrente concluída sozinha por tempo nunca gerava a próxima.
    if (block.taskId) atual = concluirTarefaNoBoard(atual, block.taskId, nowIso, dia, gerarId);
    atual = aplicarMetasDoBloco(atual, block, dia);
  }

  return mudou ? { board: atual, mudou } : { board, mudou };
}

/** Minutos padrão de um intervalo — o "10 minutinhos off". */
export const BREAK_MINUTES = 10;
/** Quanto cada toque no "+" acrescenta. */
export const EXTEND_MINUTES = 5;
