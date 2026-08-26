import { Task, TaskPriority, TaskStatus, Topic, TopicKind } from "./types";

export function topicKind(topic: Topic | undefined): TopicKind {
  return topic?.kind ?? "project";
}

export function isWishlist(topic: Topic | undefined): boolean {
  return topicKind(topic) === "wishlist";
}

/**
 * Os mesmos três status, ditos na língua de cada tipo de pasta. "Feito"
 * numa lista de compras não quer dizer nada — "Comprado" quer.
 */
const STATUS_LABELS: Record<TopicKind, Record<TaskStatus, string>> = {
  project: { todo: "A fazer", doing: "Fazendo", done: "Feito" },
  wishlist: { todo: "Quero", doing: "Pesquisando", done: "Comprado" },
};

export function statusLabel(status: TaskStatus, kind: TopicKind = "project"): string {
  return STATUS_LABELS[kind][status];
}

export function statusLabels(kind: TopicKind = "project"): Record<TaskStatus, string> {
  return STATUS_LABELS[kind];
}

/** Numa lista de desejos, prioridade é o quanto se quer aquilo. */
const PRIORITY_LABELS: Record<TopicKind, Record<TaskPriority, string>> = {
  project: { critical: "Crítica", high: "Alta", medium: "Média", low: "Baixa" },
  wishlist: { critical: "Preciso", high: "Quero muito", medium: "Quero", low: "Talvez" },
};

export function priorityLabel(priority: TaskPriority, kind: TopicKind = "project"): string {
  return PRIORITY_LABELS[kind][priority];
}

export interface WishlistTotals {
  /** Soma do que ainda não foi comprado. */
  wantedCents: number;
  boughtCents: number;
  itemsWanted: number;
  itemsBought: number;
  /**
   * Itens sem preço preenchido ainda em aberto. Existe pra o total poder ser
   * honesto: "R$ 2.500 + 3 itens sem preço" em vez de fingir que o total
   * está fechado.
   */
  itemsWithoutPrice: number;
}

export function wishlistTotals(tasks: Task[], topicId: string): WishlistTotals {
  const items = tasks.filter(
    (t) => t.topicId === topicId && !t.deletedAt && !t.archivedAt
  );

  let wantedCents = 0;
  let boughtCents = 0;
  let itemsWanted = 0;
  let itemsBought = 0;
  let itemsWithoutPrice = 0;

  for (const item of items) {
    const price = item.priceCents ?? 0;
    if (item.status === "done") {
      itemsBought++;
      boughtCents += price;
    } else {
      itemsWanted++;
      wantedCents += price;
      if (item.priceCents === undefined) itemsWithoutPrice++;
    }
  }

  return { wantedCents, boughtCents, itemsWanted, itemsBought, itemsWithoutPrice };
}

/** Domínio do link, pra mostrar "amazon.com.br" em vez da URL inteira. */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Normaliza o que a pessoa colou num link clicável. Colar "amazon.com.br/x"
 * sem esquema viraria um link relativo do próprio app e daria 404.
 * Só http/https passam — `javascript:` num href é execução de script.
 */
export function normalizeUrl(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}
