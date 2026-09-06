export type TaskStatus = "todo" | "doing" | "done";
export type TaskPriority = "critical" | "high" | "medium" | "low";
export type TaskEnergy = "deep" | "normal" | "quick";

/**
 * A vertente de uma pasta: um projeto pessoal, o trabalho do dia a dia, ou
 * uma lista de coisas que quero comprar. Muda os rótulos de status, os
 * campos do item e o resumo da pasta — o modelo de dados por baixo é o
 * mesmo, e por isso trocar a vertente nunca perde nada.
 */
export type TopicKind = "project" | "work" | "wishlist";

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
  /**
   * O texto exatamente como foi digitado quando o preço é montado por
   * partes ("multimídia 1.200 + mão de obra 300"). `priceCents` guarda só
   * a soma; sem isso, reabrir o item mostraria "1500,00" e a pessoa perderia
   * a conta que ela mesma fez.
   */
  priceParts?: string;
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

/**
 * Um bloco de trabalho do dia: "Chamar leads — 40 min".
 *
 * NÃO é uma tarefa: a mesma atividade aparece várias vezes no mesmo dia
 * (leads de manhã, leads à tarde), cada uma com sua própria duração e seu
 * próprio cronômetro. Por isso é uma sessão, não um item de lista.
 */
export interface ScheduleBlock {
  id: string;
  /** Dia local "AAAA-MM-DD" a que o bloco pertence. */
  date: string;
  title: string;
  plannedMinutes: number;
  /**
   * Instante em que o cronômetro foi ligado, em ISO. Presente = rodando.
   * Guardar o instante (e não um contador) faz o tempo continuar correndo
   * com o app fechado ou o celular bloqueado — que é o uso real.
   */
  startedAt?: string;
  /** Tempo somado das vezes em que já foi pausado. */
  accumulatedMs: number;
  completedAt?: string;
  order: number;
  /**
   * Projeto a que este bloco pertence, e a tarefa criada junto com ele.
   *
   * "Chamar leads" é ao mesmo tempo um bloco de 40 min no cronograma de hoje
   * e uma tarefa do projeto — escrever nos dois lugares era trabalho
   * duplicado. Escolher o projeto ao criar o bloco cria a tarefa e guarda o
   * vínculo aqui.
   *
   * Os dois campos são opcionais: bloco solto (sem projeto) continua sendo o
   * caso normal, e um vínculo pode ficar órfão se a tarefa for apagada — por
   * isso quem lê sempre confere se a tarefa ainda existe.
   */
  topicId?: string;
  taskId?: string;
  /**
   * Bloco de descanso, não de trabalho. Conta no relógio do dia, mas fora
   * do total de trabalho — somar o almoço às horas produzidas faria o
   * número do dia mentir na direção mais fácil de acreditar.
   */
  isBreak?: boolean;
}

export interface BoardSettings {
  /**
   * Deixa mais de um cronômetro correr ao mesmo tempo.
   *
   * Desligado, começar um bloco pausa o que estiver rodando — bom pra quem
   * troca de tarefa. Ligado, os cronômetros somam em paralelo: dez minutos
   * de relógio com dois blocos ligados viram vinte minutos no total do dia.
   * Isso é proposital (o total passa a significar "tempo dedicado", não
   * "tempo de relógio"), e a tela avisa quando está acontecendo.
   */
  parallelTimers: boolean;
}

export interface Board {
  schemaVersion: number;
  topics: Topic[];
  tasks: Task[];
  schedule: ScheduleBlock[];
  dailyFocus: Record<string, string[]>;
  weeklyReviews: WeeklyReviewNote[];
  settings: BoardSettings;
}

export const CURRENT_SCHEMA_VERSION = 4;

export function emptyBoard(): Board {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    topics: [],
    tasks: [],
    schedule: [],
    dailyFocus: {},
    weeklyReviews: [],
    settings: { parallelTimers: false },
  };
}
