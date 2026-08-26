import { Task, TaskEnergy, TaskPriority, TaskStatus } from "./types";

export interface NewTaskInput {
  topicId: string;
  title: string;
  description?: string;
  dueDate?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  energy?: TaskEnergy;
  estimatedMinutes?: number;
  tags?: string[];
  priceCents?: number;
  url?: string;
  store?: string;
}

/**
 * Monta uma tarefa nova a partir do que o formulário mandou.
 *
 * Existe como função pura (em vez de inline no contexto) porque o formato
 * anterior — montar o objeto campo a campo dentro do `addTask` — silenciosamente
 * DESCARTAVA todo campo novo que o formulário passasse mas o construtor não
 * conhecesse: foi assim que preço/loja/link sumiram ao criar um item de
 * desejo, mesmo funcionando ao editar. Aqui dá pra travar isso com teste.
 */
export function createTask(input: NewTaskInput, id: string, now: string): Task {
  return {
    id,
    topicId: input.topicId,
    title: input.title.trim(),
    description: input.description?.trim() ?? "",
    status: input.status ?? "todo",
    priority: input.priority ?? "medium",
    dueDate: input.dueDate ?? undefined,
    energy: input.energy,
    estimatedMinutes: input.estimatedMinutes,
    priceCents: input.priceCents,
    url: input.url,
    store: input.store,
    tags: input.tags ?? [],
    checklist: [],
    createdAt: now,
    updatedAt: now,
  };
}
