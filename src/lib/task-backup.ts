import { Board, Task, Topic } from "./types";
import { migrateBoard } from "./task-migrations";

export interface BackupValidation {
  valid: boolean;
  error?: string;
  topics: number;
  tasks: number;
}

export function validateBackup(json: string): BackupValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { valid: false, error: "Arquivo não é um JSON válido.", topics: 0, tasks: 0 };
  }
  if (!parsed || typeof parsed !== "object") {
    return { valid: false, error: "Conteúdo inesperado no arquivo.", topics: 0, tasks: 0 };
  }
  const r = parsed as Record<string, unknown>;
  if (!Array.isArray(r.topics) || !Array.isArray(r.tasks)) {
    return {
      valid: false,
      error: "Backup precisa ter as listas de tópicos e tarefas.",
      topics: 0,
      tasks: 0,
    };
  }
  const board = migrateBoard(parsed);
  return { valid: true, topics: board.topics.length, tasks: board.tasks.length };
}

export interface MergeReport {
  topicsAdded: number;
  tasksAdded: number;
  duplicatesSkipped: number;
}

/** Mescla por id: o que já existe fica como está, o que é novo entra. */
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

  return {
    board: {
      ...current,
      topics: [...current.topics, ...newTopics],
      tasks: [...current.tasks, ...newTasks],
    },
    report: {
      topicsAdded: newTopics.length,
      tasksAdded: newTasks.length,
      duplicatesSkipped,
    },
  };
}

export interface SyncMergeReport {
  topicsAdded: number;
  tasksAdded: number;
  blocksAdded: number;
  reviewsAdded: number;
  metasAdded: number;
  programacoesAdded: number;
}

/**
 * Une dois boards sem perder nada de nenhum lado — é o que roda quando o
 * mesmo login abre num aparelho novo.
 *
 * Diferente de `mergeImportedData` (que só trata tópicos e tarefas, porque
 * nasceu para importar backup), aqui TODAS as coleções entram: cronograma,
 * revisões e foco do dia inclusive. Numa mesclagem automática e silenciosa,
 * deixar uma coleção de fora apagaria o cronograma montado no outro
 * aparelho sem ninguém perceber.
 *
 * Em empate de id, o lado local vence: é o que a pessoa acabou de ver na
 * tela, e sobrescrever isso por trás seria pior do que ficar um instante
 * desatualizado (a próxima escrita reconcilia).
 */
export function mergeBoards(
  local: Board,
  remote: Board
): { board: Board; report: SyncMergeReport } {
  const topicIds = new Set(local.topics.map((t) => t.id));
  const novosTopicos = remote.topics.filter((t) => !topicIds.has(t.id));
  for (const t of novosTopicos) topicIds.add(t.id);

  const taskIds = new Set(local.tasks.map((t) => t.id));
  const novasTarefas = remote.tasks.filter(
    // Tarefa cujo tópico não existe em lugar nenhum ficaria invisível.
    (t) => !taskIds.has(t.id) && topicIds.has(t.topicId)
  );

  const blockIds = new Set(local.schedule.map((b) => b.id));
  const novosBlocos = remote.schedule.filter((b) => !blockIds.has(b.id));

  // Revisão é deduplicada por SEMANA, não por id: os dois aparelhos podem
  // ter criado a revisão da mesma semana com ids diferentes, e mostrar duas
  // revisões da mesma semana não faria sentido nenhum.
  const semanas = new Set(local.weeklyReviews.map((w) => w.weekStart));
  const novasRevisoes = remote.weeklyReviews.filter((w) => !semanas.has(w.weekStart));

  /**
   * Metas: por id, e com os REGISTROS unidos dia a dia pelo maior valor.
   *
   * A mesma meta é anotada nos dois aparelhos — duas páginas no celular de
   * manhã, uma no PC à noite. Ficar só com a versão local apagaria o que foi
   * anotado no outro; somar contaria em dobro o que sincronizou antes. O
   * maior valor de cada dia é o único que não perde nem inventa progresso.
   */
  const metasLocais = local.metas ?? [];
  const metasRemotas = remote.metas ?? [];
  const idsMetasLocais = new Set(metasLocais.map((m) => m.id));
  const metasUnidas = metasLocais.map((m) => {
    const outra = metasRemotas.find((r) => r.id === m.id);
    if (!outra) return m;
    const registros = { ...m.registros };
    for (const [dia, valor] of Object.entries(outra.registros)) {
      registros[dia] = Math.max(registros[dia] ?? 0, valor);
    }
    return { ...m, registros };
  });
  const novasMetas = metasRemotas.filter((m) => !idsMetasLocais.has(m.id));

  /**
   * Programações: por id, com os DIAS PULADOS unidos. Um feriado tirado no
   * celular precisa valer no PC — senão o PC recriaria o bloco que foi
   * apagado de propósito. Os blocos gerados já se deduplicam sozinhos, porque
   * o id deles é derivado da programação e do dia.
   */
  const progLocais = local.programacoes ?? [];
  const progRemotas = remote.programacoes ?? [];
  const idsProgLocais = new Set(progLocais.map((p) => p.id));
  const programacoesUnidas = progLocais.map((p) => {
    const outra = progRemotas.find((r) => r.id === p.id);
    if (!outra) return p;
    return {
      ...p,
      diasPulados: [...new Set([...(p.diasPulados ?? []), ...(outra.diasPulados ?? [])])],
    };
  });
  const novasProgramacoes = progRemotas.filter((p) => !idsProgLocais.has(p.id));

  return {
    board: {
      ...local,
      topics: [...local.topics, ...novosTopicos],
      tasks: [...local.tasks, ...novasTarefas],
      schedule: [...local.schedule, ...novosBlocos],
      weeklyReviews: [...local.weeklyReviews, ...novasRevisoes],
      // Foco do dia: dias que só existem do lado remoto entram; dias em
      // comum ficam com a versão local (o limite de 3 não pode ser furado
      // por uma união cega).
      dailyFocus: { ...remote.dailyFocus, ...local.dailyFocus },
      // Preferência é do aparelho que está na mão da pessoa agora.
      settings: local.settings,
      metas: [...metasUnidas, ...novasMetas],
      programacoes: [...programacoesUnidas, ...novasProgramacoes],
    },
    report: {
      topicsAdded: novosTopicos.length,
      tasksAdded: novasTarefas.length,
      blocksAdded: novosBlocos.length,
      reviewsAdded: novasRevisoes.length,
      metasAdded: novasMetas.length,
      programacoesAdded: novasProgramacoes.length,
    },
  };
}

export function estimateSizeKb(board: Board): number {
  return Math.round((JSON.stringify(board).length / 1024) * 10) / 10;
}
