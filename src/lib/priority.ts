import { TaskPriority } from "./types";

export const PRIORITY_ORDER: TaskPriority[] = ["high", "medium", "low"];

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

/** Cores funcionais (sinal de urgência), não a cor da marca — o dourado fica reservado pro CTA/estado ativo. */
export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  high: "#d65a4a",
  medium: "#eab308",
  low: "#8a8672",
};
