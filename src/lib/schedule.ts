import { ScheduleBlock } from "./types";

export const MINUTE_MS = 60_000;

/** Durações que aparecem de verdade na agenda: 20, 30, 40, 60, 90 min. */
export const DURATION_PRESETS = [20, 30, 40, 60, 90];

export function isRunning(block: ScheduleBlock): boolean {
  return !!block.startedAt && !block.completedAt;
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

export function plannedMs(block: ScheduleBlock): number {
  return block.plannedMinutes * MINUTE_MS;
}

/** Positivo = tempo restante. Negativo = passou do combinado. */
export function remainingMs(block: ScheduleBlock, now: number = Date.now()): number {
  return plannedMs(block) - elapsedMs(block, now);
}

export function isOvertime(block: ScheduleBlock, now: number = Date.now()): boolean {
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
  return { ...frozen, completedAt: block.completedAt ?? nowIso };
}

export function reopenBlock(block: ScheduleBlock): ScheduleBlock {
  return { ...block, completedAt: undefined };
}

/** Zera o cronômetro sem apagar o bloco. */
export function resetBlock(block: ScheduleBlock): ScheduleBlock {
  return { ...block, accumulatedMs: 0, startedAt: undefined, completedAt: undefined };
}

export interface ScheduleTotals {
  plannedMs: number;
  elapsedMs: number;
  doneCount: number;
  total: number;
  runningId: string | null;
}

export function scheduleTotals(
  blocks: ScheduleBlock[],
  now: number = Date.now()
): ScheduleTotals {
  let planned = 0;
  let elapsed = 0;
  let doneCount = 0;
  let runningId: string | null = null;

  for (const b of blocks) {
    planned += plannedMs(b);
    elapsed += elapsedMs(b, now);
    if (b.completedAt) doneCount++;
    if (isRunning(b)) runningId = b.id;
  }

  return { plannedMs: planned, elapsedMs: elapsed, doneCount, total: blocks.length, runningId };
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
    const feitoA = a.completedAt ? 1 : 0;
    const feitoB = b.completedAt ? 1 : 0;
    if (feitoA !== feitoB) return feitoA - feitoB;
    return a.order - b.order;
  });
}

/** Estica o tempo planejado do bloco. Nunca encolhe abaixo de 1 minuto. */
export function extendBlock(block: ScheduleBlock, minutos: number): ScheduleBlock {
  return { ...block, plannedMinutes: Math.max(1, block.plannedMinutes + minutos) };
}

/** Minutos padrão de um intervalo — o "10 minutinhos off". */
export const BREAK_MINUTES = 10;
/** Quanto cada toque no "+" acrescenta. */
export const EXTEND_MINUTES = 5;
