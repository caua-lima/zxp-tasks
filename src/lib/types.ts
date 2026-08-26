export type TaskStatus = "todo" | "doing" | "done";
export type TaskPriority = "critical" | "high" | "medium" | "low";
export type TaskEnergy = "deep" | "normal" | "quick";

/**
 * Um tópico é uma pasta de trabalho ("projeto") ou uma pasta de coisas que
 * quero comprar ("lista de desejos"). Muda os rótulos de status, os campos
 * do item e o resumo da pasta — o modelo de dados por baixo é o mesmo.
 */
export type TopicKind = "project" | "wishlist";

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

export interface Recurrence {
  frequency: "daily" | "weekly" | "monthly";
  interval?: number;
  weekdays?: number[];
}

export interface Task {
  id: string;
  topicId: string;
  title: string;
  description: string;
  status: TaskStatus;

  priority: TaskPriority;
  dueDate?: string | null;
  completedAt?: string | null;

  estimatedMinutes?: number;
  energy?: TaskEnergy;

  /**
   * Campos de desejo/compra — só aparecem quando o tópico é uma lista de
   * desejos. Preço em CENTAVOS (inteiro) de propósito: somar float dá
   * "R$ 1.234,5600000001" na hora de totalizar a pasta.
   */
  priceCents?: number;
  url?: string;
  store?: string;

  tags: string[];
  checklist: ChecklistItem[];

  recurrence?: Recurrence | null;
  /**
   * Marca que a próxima ocorrência desta tarefa recorrente já foi criada.
   * Sobrevive a reabrir/concluir de novo — sem isso, reabrir limpa o
   * `completedAt` e a segunda conclusão geraria uma ocorrência duplicada.
   */
  recurrenceSpawned?: boolean;

  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  deletedAt?: string | null;
}

export interface Topic {
  id: string;
  name: string;
  color: string;
  icon?: string;
  description?: string;
  /** Ausente em tópicos criados antes das listas de desejos = "project". */
  kind?: TopicKind;
  /** Meta de gasto da lista de desejos, em centavos. */
  budgetCents?: number;
  createdAt: string;
  archivedAt?: string | null;
}

export interface WeeklyReviewNote {
  id: string;
  weekStart: string;
  stuck: string;
  toArchive: string;
  nextPriority: string;
  wastingTime: string;
  createdAt: string;
}

export interface Board {
  schemaVersion: number;
  topics: Topic[];
  tasks: Task[];
  dailyFocus: Record<string, string[]>;
  weeklyReviews: WeeklyReviewNote[];
}

export const CURRENT_SCHEMA_VERSION = 3;

export function emptyBoard(): Board {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    topics: [],
    tasks: [],
    dailyFocus: {},
    weeklyReviews: [],
  };
}
