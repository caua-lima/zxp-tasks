import {
  Board,
  ChecklistItem,
  ScheduleBlock,
  CURRENT_SCHEMA_VERSION,
  Recurrence,
  Task,
  TaskPriority,
  TaskStatus,
  Topic,
  WeeklyReviewNote,
  emptyBoard,
} from "./types";

/**
 * Sem createdAt confiável não dá pra inventar "quando" a tarefa nasceu —
 * usar época (1970) empurra a tarefa pro fim de qualquer ordenação por data
 * de criação, sem fingir que ela é recente.
 */
const SAFE_FALLBACK_DATE = "1970-01-01T00:00:00.000Z";

const VALID_PRIORITIES: TaskPriority[] = ["critical", "high", "medium", "low"];
const VALID_STATUSES: TaskStatus[] = ["todo", "doing", "done"];

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function migratePriority(v: unknown): TaskPriority {
  return VALID_PRIORITIES.includes(v as TaskPriority) ? (v as TaskPriority) : "medium";
}

function migrateStatus(v: unknown): TaskStatus {
  return VALID_STATUSES.includes(v as TaskStatus) ? (v as TaskStatus) : "todo";
}

function migrateChecklist(v: unknown): ChecklistItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      id: asString(item.id) ?? crypto.randomUUID(),
      label: asString(item.label) ?? "",
      completed: item.completed === true,
    }))
    .filter((item) => item.label.length > 0);
}

function migrateTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((t): t is string => typeof t === "string" && t.length > 0);
}

function migrateRecurrence(v: unknown): Recurrence | undefined {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  const frequency = r.frequency;
  if (frequency !== "daily" && frequency !== "weekly" && frequency !== "monthly") return undefined;
  return {
    frequency,
    interval: typeof r.interval === "number" ? r.interval : undefined,
    weekdays: Array.isArray(r.weekdays) ? (r.weekdays as number[]) : undefined,
  };
}

function migrateTask(raw: unknown): Task | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const id = asString(r.id) ?? crypto.randomUUID();
  const topicId = asString(r.topicId);
  if (!topicId) return null;

  // Regra: tarefa sem título não é permitida — mas na migração não dá pra
  // simplesmente descartar dado do usuário, então marca visivelmente em vez
  // de apagar silenciosamente.
  const title = asString(r.title) ?? "(sem título)";

  const createdAt = asString(r.createdAt) ?? asString(r.updatedAt) ?? SAFE_FALLBACK_DATE;
  const updatedAt = asString(r.updatedAt) ?? createdAt;

  const status = migrateStatus(r.status);
  // `date` era o nome antigo do prazo (v1); nunca inventar prazo novo.
  const dueDate = asString(r.dueDate) ?? asString(r.date) ?? undefined;
  const completedAt =
    asString(r.completedAt) ?? (status === "done" ? updatedAt : undefined);

  return {
    id,
    topicId,
    title,
    description: asString(r.description) ?? "",
    status,
    priority: migratePriority(r.priority),
    dueDate: dueDate ?? undefined,
    completedAt: completedAt ?? undefined,
    estimatedMinutes: typeof r.estimatedMinutes === "number" ? r.estimatedMinutes : undefined,
    // Preço tem que ser inteiro não-negativo: NaN/Infinity/negativo vindo de
    // um backup editado à mão envenenaria a soma da lista inteira.
    priceCents:
      typeof r.priceCents === "number" && Number.isFinite(r.priceCents) && r.priceCents >= 0
        ? Math.round(r.priceCents)
        : undefined,
    url: asString(r.url),
    store: asString(r.store),
    energy:
      r.energy === "deep" || r.energy === "normal" || r.energy === "quick"
        ? r.energy
        : undefined,
    tags: migrateTags(r.tags),
    checklist: migrateChecklist(r.checklist),
    recurrence: migrateRecurrence(r.recurrence) ?? undefined,
    recurrenceSpawned: r.recurrenceSpawned === true,
    createdAt,
    updatedAt,
    archivedAt: asString(r.archivedAt) ?? undefined,
    deletedAt: asString(r.deletedAt) ?? undefined,
  };
}

function migrateTopic(raw: unknown): Topic | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id) ?? crypto.randomUUID();
  const name = asString(r.name);
  if (!name) return null;
  return {
    id,
    name,
    color: asString(r.color) ?? "#F4B942",
    icon: asString(r.icon),
    description: asString(r.description),
    // Tópico salvo antes das listas de desejos não tem `kind` — vira projeto,
    // que é o que ele sempre foi na prática.
    kind: r.kind === "wishlist" ? "wishlist" : "project",
    budgetCents:
      typeof r.budgetCents === "number" && Number.isFinite(r.budgetCents) && r.budgetCents >= 0
        ? Math.round(r.budgetCents)
        : undefined,
    createdAt: asString(r.createdAt) ?? SAFE_FALLBACK_DATE,
    archivedAt: asString(r.archivedAt) ?? undefined,
  };
}

function migrateScheduleBlock(raw: unknown): ScheduleBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const date = asString(r.date);
  const title = asString(r.title);
  if (!date || !title) return null;
  const planned =
    typeof r.plannedMinutes === "number" && Number.isFinite(r.plannedMinutes) && r.plannedMinutes > 0
      ? Math.round(r.plannedMinutes)
      : 30;
  return {
    id: asString(r.id) ?? crypto.randomUUID(),
    date,
    title,
    plannedMinutes: planned,
    startedAt: asString(r.startedAt),
    // Tempo acumulado inválido viraria NaN e contaminaria o total do dia.
    accumulatedMs:
      typeof r.accumulatedMs === "number" && Number.isFinite(r.accumulatedMs) && r.accumulatedMs >= 0
        ? r.accumulatedMs
        : 0,
    completedAt: asString(r.completedAt),
    order: typeof r.order === "number" && Number.isFinite(r.order) ? r.order : 0,
  };
}

function migrateWeeklyReview(raw: unknown): WeeklyReviewNote | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const weekStart = asString(r.weekStart);
  if (!weekStart) return null;
  return {
    id: asString(r.id) ?? crypto.randomUUID(),
    weekStart,
    stuck: asString(r.stuck) ?? "",
    toArchive: asString(r.toArchive) ?? "",
    nextPriority: asString(r.nextPriority) ?? "",
    wastingTime: asString(r.wastingTime) ?? "",
    createdAt: asString(r.createdAt) ?? SAFE_FALLBACK_DATE,
  };
}

/**
 * Migra qualquer formato salvo anteriormente (v0 sem prioridade, v1 com
 * `date`/prioridade de 3 níveis, ou já v2) pro modelo atual. Nunca lança —
 * dado que não dá pra recuperar vira lista vazia, não erro.
 */
export function migrateBoard(raw: unknown): Board {
  if (!raw || typeof raw !== "object") return emptyBoard();
  const r = raw as Record<string, unknown>;

  const topics = Array.isArray(r.topics)
    ? r.topics.map(migrateTopic).filter((t): t is Topic => t !== null)
    : [];
  const tasks = Array.isArray(r.tasks)
    ? r.tasks.map(migrateTask).filter((t): t is Task => t !== null)
    : [];
  const weeklyReviews = Array.isArray(r.weeklyReviews)
    ? r.weeklyReviews.map(migrateWeeklyReview).filter((w): w is WeeklyReviewNote => w !== null)
    : [];
  const schedule = Array.isArray(r.schedule)
    ? r.schedule.map(migrateScheduleBlock).filter((b): b is ScheduleBlock => b !== null)
    : [];
  const dailyFocus =
    r.dailyFocus && typeof r.dailyFocus === "object"
      ? (r.dailyFocus as Record<string, string[]>)
      : {};

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    topics,
    tasks,
    schedule,
    dailyFocus,
    weeklyReviews,
  };
}
