import { TaskEnergy, TaskPriority } from "./types";

export const PRIORITY_ORDER: TaskPriority[] = ["critical", "high", "medium", "low"];

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

/**
 * Cores funcionais: vermelho = risco, laranja = atenção, azul de assinatura
 * = foco, neutro = sem urgência. O ícone acompanha porque cor sozinha não
 * pode ser o único sinal.
 *
 * Espelham os tokens de `globals.css` em hexadecimal porque são usadas em
 * `style` inline e como base das versões translúcidas — `var(--x)` não
 * serve de origem pra calcular uma transparência.
 */
export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  critical: "#D65A4A",
  high: "#E8913A",
  medium: "#3D8BFF",
  low: "#A5A49C",
};

/**
 * Fundo suave de cada prioridade.
 *
 * Existe como mapa próprio porque antes o código concatenava alfa no hex
 * (`${cor}1f`) — um truque que quebra em silêncio no dia em que a cor virar
 * `rgb()`, `var()` ou um hex de 4 dígitos.
 */
export const PRIORITY_TINT: Record<TaskPriority, string> = {
  critical: "rgba(214, 90, 74, 0.12)",
  high: "rgba(232, 145, 58, 0.12)",
  medium: "rgba(61, 139, 255, 0.12)",
  low: "rgba(165, 164, 156, 0.12)",
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
