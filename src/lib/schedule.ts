import { ScheduleBlock } from "./types";

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
  return {
    ...block,
    accumulatedMs: elapsedMs(block, now),
    startedAt: undefined,
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
      continuaDe: block.id,
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

/** Minutos padrão de um intervalo — o "10 minutinhos off". */
export const BREAK_MINUTES = 10;
/** Quanto cada toque no "+" acrescenta. */
export const EXTEND_MINUTES = 5;
