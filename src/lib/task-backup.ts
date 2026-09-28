import { Board, Grupo, Meta, Programacao, ScheduleBlock, Task, Topic, WeeklyReviewNote } from "./types";
import { migrateBoard } from "./task-migrations";

/** Registros do dia unidos pelo maior valor — nunca perde nem inventa progresso. */
function unirMetas(locais: Meta[], entrantes: Meta[]): { unidas: Meta[]; adicionadas: number } {
  const ids = new Set(locais.map((m) => m.id));
  const unidas = locais.map((m) => {
    const outra = entrantes.find((e) => e.id === m.id);
    if (!outra) return m;
    const registros = { ...m.registros };
    for (const [dia, valor] of Object.entries(outra.registros)) {
      registros[dia] = Math.max(registros[dia] ?? 0, valor);
    }
    return { ...m, registros };
  });
  const novas = entrantes.filter((m) => !ids.has(m.id));
  return { unidas: [...unidas, ...novas], adicionadas: novas.length };
}

/** Dias pulados unidos — um feriado marcado num lado precisa valer nos dois. */
function unirProgramacoes(
  locais: Programacao[],
  entrantes: Programacao[]
): { unidas: Programacao[]; adicionadas: number } {
  const ids = new Set(locais.map((p) => p.id));
  const unidas = locais.map((p) => {
    const outra = entrantes.find((e) => e.id === p.id);
    if (!outra) return p;
    return {
      ...p,
      diasPulados: [...new Set([...(p.diasPulados ?? []), ...(outra.diasPulados ?? [])])],
    };
  });
  const novas = entrantes.filter((p) => !ids.has(p.id));
  return { unidas: [...unidas, ...novas], adicionadas: novas.length };
}

export interface BackupValidation {
  valid: boolean;
  error?: string;
  topics: number;
  tasks: number;
  schedule: number;
  metas: number;
  programacoes: number;
  groups: number;
  weeklyReviews: number;
  dailyFocusDays: number;
}

const VALIDACAO_VAZIA = {
  topics: 0,
  tasks: 0,
  schedule: 0,
  metas: 0,
  programacoes: 0,
  groups: 0,
  weeklyReviews: 0,
  dailyFocusDays: 0,
};

export function validateBackup(json: string): BackupValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { valid: false, error: "Arquivo não é um JSON válido.", ...VALIDACAO_VAZIA };
  }
  if (!parsed || typeof parsed !== "object") {
    return { valid: false, error: "Conteúdo inesperado no arquivo.", ...VALIDACAO_VAZIA };
  }
  const r = parsed as Record<string, unknown>;
  if (!Array.isArray(r.topics) || !Array.isArray(r.tasks)) {
    return {
      valid: false,
      error: "Backup precisa ter as listas de tópicos e tarefas.",
      ...VALIDACAO_VAZIA,
    };
  }
  const board = migrateBoard(parsed);
  return {
    valid: true,
    topics: board.topics.length,
    tasks: board.tasks.length,
    schedule: board.schedule.length,
    metas: (board.metas ?? []).length,
    programacoes: (board.programacoes ?? []).length,
    groups: (board.groups ?? []).length,
    weeklyReviews: board.weeklyReviews.length,
    dailyFocusDays: Object.keys(board.dailyFocus ?? {}).length,
  };
}

export interface MergeReport {
  topicsAdded: number;
  tasksAdded: number;
  groupsAdded: number;
  scheduleAdded: number;
  weeklyReviewsAdded: number;
  metasAdded: number;
  programacoesAdded: number;
  dailyFocusAdded: number;
  duplicatesSkipped: number;
}

/**
 * Mescla por id: o que já existe fica como está, o que é novo entra.
 *
 * Cobre TODAS as coleções do board — cronograma, metas, programações,
 * grupos, foco do dia e revisões, não só tópicos e tarefas. Um backup
 * completo que só trouxesse tópico e tarefa de volta faria a pessoa achar
 * que restaurou tudo e só descobrir depois, no meio de um dia de trabalho,
 * que o cronograma e as metas continuavam vazios.
 */
export function mergeImportedData(
  current: Board,
  incoming: Board
): { board: Board; report: MergeReport } {
  const topicIds = new Set(current.topics.map((t) => t.id));
  const taskIds = new Set(current.tasks.map((t) => t.id));

  const newTopics: Topic[] = [];
  const newTasks: Task[] = [];
  let duplicatesSkipped = 0;

  for (const topic of incoming.topics) {
    if (topicIds.has(topic.id)) {
      duplicatesSkipped++;
      continue;
    }
    topicIds.add(topic.id);
    newTopics.push(topic);
  }
  for (const task of incoming.tasks) {
    if (taskIds.has(task.id)) {
      duplicatesSkipped++;
      continue;
    }
    // Tarefa órfã (tópico não existe nem aqui nem no backup) seria invisível.
    if (!topicIds.has(task.topicId)) {
      duplicatesSkipped++;
      continue;
    }
    taskIds.add(task.id);
    newTasks.push(task);
  }

  const gruposAtuais = current.groups ?? [];
  const idsGruposAtuais = new Set(gruposAtuais.map((g) => g.id));
  const newGroups: Grupo[] = [];
  for (const grupo of incoming.groups ?? []) {
    if (idsGruposAtuais.has(grupo.id)) {
      duplicatesSkipped++;
      continue;
    }
    newGroups.push(grupo);
  }

  const blockIds = new Set(current.schedule.map((b) => b.id));
  const newBlocks: ScheduleBlock[] = [];
  for (const block of incoming.schedule) {
    if (blockIds.has(block.id)) {
      duplicatesSkipped++;
      continue;
    }
    newBlocks.push(block);
  }

  // Mesma regra da sincronização: revisão é por SEMANA, não por id — duas
  // revisões da mesma semana com ids diferentes não deveriam virar duas.
  const semanasAtuais = new Set(current.weeklyReviews.map((w) => w.weekStart));
  const newReviews: WeeklyReviewNote[] = [];
  for (const review of incoming.weeklyReviews) {
    if (semanasAtuais.has(review.weekStart)) {
      duplicatesSkipped++;
      continue;
    }
    newReviews.push(review);
  }

  const { unidas: metasUnidas, adicionadas: metasAdded } = unirMetas(
    current.metas ?? [],
    incoming.metas ?? []
  );
  const { unidas: programacoesUnidas, adicionadas: programacoesAdded } = unirProgramacoes(
    current.programacoes ?? [],
    incoming.programacoes ?? []
  );

  const diasNovos = Object.keys(incoming.dailyFocus ?? {}).filter(
    (dia) => !(dia in current.dailyFocus)
  );

  return {
    board: {
      ...current,
      topics: [...current.topics, ...newTopics],
      tasks: [...current.tasks, ...newTasks],
      groups: [...gruposAtuais, ...newGroups],
      schedule: [...current.schedule, ...newBlocks],
      weeklyReviews: [...current.weeklyReviews, ...newReviews],
      // Dia em comum fica com o que já está aqui — o backup é o lado "de
      // fora" entrando, igual à sincronização entre aparelhos.
      dailyFocus: { ...(incoming.dailyFocus ?? {}), ...current.dailyFocus },
      metas: metasUnidas,
      programacoes: programacoesUnidas,
    },
    report: {
      topicsAdded: newTopics.length,
      tasksAdded: newTasks.length,
      groupsAdded: newGroups.length,
      scheduleAdded: newBlocks.length,
      weeklyReviewsAdded: newReviews.length,
      metasAdded,
      programacoesAdded,
      dailyFocusAdded: diasNovos.length,
      duplicatesSkipped,
    },
  };
}

export function estimateSizeKb(board: Board): number {
  return Math.round((JSON.stringify(board).length / 1024) * 10) / 10;
}
