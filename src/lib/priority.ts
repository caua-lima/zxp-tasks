import { TaskEnergy, TaskPriority } from "./types";

export const PRIORITY_ORDER: TaskPriority[] = ["critical", "high", "medium", "low"];

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

/**
 * Cores funcionais da identidade: vermelho = risco, laranja = atenção,
 * dourado = marca/foco, neutro = sem urgência. O ícone acompanha porque
 * cor sozinha não pode ser o único sinal.
 */
export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  critical: "#D65A4A",
  high: "#F0A74A",
  medium: "#F4B942",
  low: "#B5B2A6",
};

export const PRIORITY_ICON: Record<TaskPriority, string> = {
  critical: "▲▲",
  high: "▲",
  medium: "■",
  low: "▽",
};

export const ENERGY_LABEL: Record<TaskEnergy, string> = {
  deep: "Profunda",
  normal: "Normal",
  quick: "Rápida",
};

export const ENERGY_ORDER: TaskEnergy[] = ["deep", "normal", "quick"];

export const ESTIMATE_PRESETS = [5, 15, 30, 60, 120];

export function formatEstimate(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = minutes / 60;
  return Number.isInteger(h) ? `${h} h` : `${h.toFixed(1)} h`;
}
