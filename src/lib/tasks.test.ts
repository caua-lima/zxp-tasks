/**
 * Fuso fixo, antes de qualquer `Date`.
 *
 * Boa parte deste app depende de "que dia local é este instante" — concluir
 * às 21h no Brasil é hoje, mas já é amanhã em UTC. Sem fixar o fuso, os
 * testes que protegem exatamente isso passariam ou falhariam conforme a
 * máquina de quem roda, que é a pior forma de um teste mentir.
 */
process.env.TZ = "America/Sao_Paulo";

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Board, ScheduleBlock, Task, Topic, emptyBoard } from "./types";
import { migrateBoard } from "./task-migrations";
import { montarRelatorio, tempoPorProjeto } from "./report";
import {
  aplicarConclusaoNasMetas,
  aplicarMetasDoBloco,
  marcarDiaBatido,
  marcarMetas,
  novaMeta,
  progressoDaMeta,
  registrarNaMeta,
} from "./metas";
import {
  DIAS_UTEIS,
  descreverDias,
  idDoBlocoProgramado,
  materializarProgramacoes,
  novaProgramacao,
  problemaDaProgramacao,
} from "./programacao";
import { interpretarComandoDeVoz } from "./voice-command";
import {
  autoConcluirBlocos,
  completedBlockData,
  extendBlock,
  isFinished,
  isParked,
  ordenarParaExibicao,
  parkBlock,
  plannedMs,
  retomarBloco,
  skipBlock,
} from "./schedule";
import {
  isTaskOverdue,
  getTasksDueToday,
  getUpcomingTasks,
  getQuickWins,
  getOverdueTasks,
  calculateTopicProgress,
  getTaskPriorityScore,
  checklistProgress,
  suggestFocusTasks,
} from "./task-utils";
import { filterTasks, sortTasks } from "./task-filters";
import { classificarErroDeGravacao, interpretarConteudoSalvo } from "./storage";
import { concluirTarefaNoBoard } from "./task-completion";
import { taskBelongsToTopic } from "./task-utils";
import { validateBackup, mergeImportedData, mergeBoards } from "./task-backup";
import { calculateWeeklyMetrics } from "./weekly-review";
import { addDaysISO, startOfWeekISO, localDayOf, daysBetween, todayISO } from "./date-utils";
import {
  createRecurringTask,
  nextOccurrence,
  describeRecurrence,
  skipOccurrence,
} from "./recurrence";
import { parseBRL, formatBRL, centsToInput, parseValorComposto } from "./money";
import { createTask } from "./task-factory";
import { traduzErroAuth } from "./auth-errors";
import {
  MINUTE_MS,
  allSessions,
  blocksOfDay,
  completeBlock,
  elapsedMs,
  formatDuration,
  isOvertime,
  isRunning,
  pauseBlock,
  progressPercent,
  remainingMs,
  reopenBlock,
  resetBlock,
  scheduleTotals,
  startBlock,
  wallClockMs,
} from "./schedule";
import {
  wishlistTotals,
  isWishlist,
  statusLabel,
  priorityLabel,
  linkHost,
  normalizeUrl,
} from "./wishlist";
import {
  getNextAction,
  getRecentlyCompleted,
  topicStats,
  topicInsights,
} from "./project-utils";

const HOJE = "2026-08-16";

/** Hoje no fuso local — para os testes que dependem do relógio de verdade. */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function task(partial: Partial<Task>): Task {
  return {
    id: crypto.randomUUID(),
    topicId: "t1",
    title: "Tarefa",
    description: "",
    status: "todo",
    priority: "medium",
    tags: [],
    checklist: [],
    createdAt: "2026-08-10T10:00:00.000Z",
    updatedAt: "2026-08-10T10:00:00.000Z",
    ...partial,
  };
}

function topic(partial: Partial<Topic> = {}): Topic {
  return {
    id: "t1",
    name: "Tópico",
    color: "#F4B942",
    createdAt: "2026-08-01T10:00:00.000Z",
    ...partial,
  };
}

describe("migração de dados antigos", () => {
  test("tarefa v0 (sem prioridade, sem checklist/tags) vira modelo atual com medium", () => {
    const board = migrateBoard({
      topics: [{ id: "t1", name: "Antigo", color: "#fff", createdAt: "2026-01-01" }],
      tasks: [{ id: "a", topicId: "t1", title: "Velha", status: "todo" }],
    });
    assert.equal(board.tasks[0].priority, "medium");
    assert.deepEqual(board.tasks[0].tags, []);
    assert.deepEqual(board.tasks[0].checklist, []);
  });

  test("campo antigo `date` vira dueDate, e nunca inventa prazo quando não existe", () => {
    const board = migrateBoard({
      topics: [topic()],
      tasks: [
        { id: "a", topicId: "t1", title: "Com prazo", date: "2026-09-01" },
        { id: "b", topicId: "t1", title: "Sem prazo" },
      ],
    });
    assert.equal(board.tasks[0].dueDate, "2026-09-01");
    assert.equal(board.tasks[1].dueDate, undefined);
  });

  test("tarefa sem createdAt recebe data segura, não a data de hoje", () => {
    const board = migrateBoard({
      topics: [topic()],
      tasks: [{ id: "a", topicId: "t1", title: "Sem data" }],
    });
    assert.equal(board.tasks[0].createdAt, "1970-01-01T00:00:00.000Z");
  });

  test("migração preserva o tópico excluído (tombstone), não some ele do array", () => {
    const board = migrateBoard({
      topics: [{ id: "t1", name: "Sumido", createdAt: "2026-01-01", deletedAt: "2026-09-01T10:00:00.000Z" }],
      tasks: [{ id: "a", topicId: "t1", title: "Órfã da lixeira", deletedAt: "2026-09-01T10:00:00.000Z" }],
    });
    assert.equal(board.topics.length, 1);
    assert.ok(board.topics[0].deletedAt);
    assert.equal(board.tasks.length, 1);
  });

  test("prioridade de 3 níveis antiga continua válida; valor inválido cai pra medium", () => {
    const board = migrateBoard({
      topics: [topic()],
      tasks: [
        { id: "a", topicId: "t1", title: "A", priority: "high" },
        { id: "b", topicId: "t1", title: "B", priority: "urgentissima" },
      ],
    });
    assert.equal(board.tasks[0].priority, "high");
    assert.equal(board.tasks[1].priority, "medium");
  });

  test("tarefa já concluída sem completedAt ganha um, a partir do updatedAt", () => {
    const board = migrateBoard({
      topics: [topic()],
      tasks: [
        {
          id: "a",
          topicId: "t1",
          title: "Feita",
          status: "done",
          updatedAt: "2026-08-12T09:00:00.000Z",
        },
      ],
    });
    assert.equal(board.tasks[0].completedAt, "2026-08-12T09:00:00.000Z");
  });

  test("lixo não derruba a migração: entrada inválida vira quadro vazio", () => {
    assert.deepEqual(migrateBoard(null), emptyBoard());
    assert.deepEqual(migrateBoard("nada disso"), emptyBoard());
    assert.equal(migrateBoard({ topics: "x", tasks: 3 }).tasks.length, 0);
  });

  test("tarefa órfã (sem topicId) é descartada em vez de virar tarefa invisível", () => {
    const board = migrateBoard({ topics: [topic()], tasks: [{ id: "a", title: "Solta" }] });
    assert.equal(board.tasks.length, 0);
  });
});

describe("atraso e prazos", () => {
  test("tarefa com prazo anterior a hoje e não concluída está atrasada", () => {
    assert.equal(isTaskOverdue(task({ dueDate: "2026-08-15" }), HOJE), true);
  });

  test("tarefa concluída nunca conta como atrasada", () => {
    assert.equal(
      isTaskOverdue(task({ dueDate: "2026-08-01", status: "done" }), HOJE),
      false
    );
  });

  test("tarefa sem prazo nunca está atrasada", () => {
    assert.equal(isTaskOverdue(task({}), HOJE), false);
  });

  test("prazo hoje ainda não é atraso", () => {
    assert.equal(isTaskOverdue(task({ dueDate: HOJE }), HOJE), false);
  });

  test("tarefa na lixeira/arquivada sai das listas de atraso", () => {
    const lixo = task({ dueDate: "2026-08-01", deletedAt: "2026-08-10T00:00:00Z" });
    const arquivada = task({ dueDate: "2026-08-01", archivedAt: "2026-08-10T00:00:00Z" });
    assert.equal(getOverdueTasks([lixo, arquivada], HOJE).length, 0);
  });

  test("getTasksDueToday pega só o que vence hoje e continua aberto", () => {
    const hoje = task({ dueDate: HOJE });
    const feitaHoje = task({ dueDate: HOJE, status: "done" });
    const amanha = task({ dueDate: "2026-08-17" });
    assert.deepEqual(
      getTasksDueToday([hoje, feitaHoje, amanha], HOJE).map((t) => t.id),
      [hoje.id]
    );
  });

  test("getUpcomingTasks respeita a janela e exclui hoje (que é 'due today')", () => {
    const amanha = task({ dueDate: "2026-08-17" });
    const daquiSete = task({ dueDate: addDaysISO(HOJE, 7) });
    const daquiOito = task({ dueDate: addDaysISO(HOJE, 8) });
    const ids = getUpcomingTasks([amanha, daquiSete, daquiOito], 7, HOJE).map((t) => t.id);
    assert.deepEqual(ids.sort(), [amanha.id, daquiSete.id].sort());
  });
});

describe("prioridade e foco", () => {
  test("crítica pontua mais que alta, que pontua mais que média e baixa", () => {
    assert.ok(getTaskPriorityScore("critical") > getTaskPriorityScore("high"));
    assert.ok(getTaskPriorityScore("high") > getTaskPriorityScore("medium"));
    assert.ok(getTaskPriorityScore("medium") > getTaskPriorityScore("low"));
  });

  test("sugestão de foco prioriza atrasada crítica e devolve no máximo 3", () => {
    const atrasadaCritica = task({ priority: "critical", dueDate: "2026-08-01" });
    const baixaSemPrazo = task({ priority: "low" });
    const venceHoje = task({ priority: "medium", dueDate: HOJE });
    const outra = task({ priority: "high" });
    const foco = suggestFocusTasks(
      [baixaSemPrazo, atrasadaCritica, venceHoje, outra],
      HOJE
    );
    assert.equal(foco.length, 3);
    assert.equal(foco[0].id, atrasadaCritica.id);
  });

  test("tarefa concluída não é sugerida como foco", () => {
    const feita = task({ priority: "critical", status: "done" });
    assert.equal(suggestFocusTasks([feita], HOJE).length, 0);
  });
});

describe("vitórias rápidas", () => {
  test("pega energia rápida, até 15 min, prioridade não-baixa e sem atraso", () => {
    const boa = task({ energy: "quick", estimatedMinutes: 10, priority: "high" });
    const longa = task({ energy: "quick", estimatedMinutes: 60, priority: "high" });
    const profunda = task({ energy: "deep", estimatedMinutes: 10, priority: "high" });
    const atrasada = task({
      energy: "quick",
      estimatedMinutes: 10,
      priority: "high",
      dueDate: "2026-08-01",
    });
    const ids = getQuickWins([boa, longa, profunda, atrasada], HOJE).map((t) => t.id);
    assert.deepEqual(ids, [boa.id]);
  });
});

describe("checklist", () => {
  test("progresso conta itens concluídos", () => {
    const t = task({
      checklist: [
        { id: "1", label: "a", completed: true },
        { id: "2", label: "b", completed: true },
        { id: "3", label: "c", completed: false },
      ],
    });
    assert.deepEqual(checklistProgress(t), { done: 2, total: 3 });
  });

  test("tarefa sem checklist devolve 0/0 em vez de quebrar", () => {
    assert.deepEqual(checklistProgress(task({})), { done: 0, total: 0 });
  });
});

describe("progresso de tópico", () => {
  test("percentual considera só tarefas ativas do tópico", () => {
    const tasks = [
      task({ topicId: "t1", status: "done" }),
      task({ topicId: "t1", status: "todo" }),
      task({ topicId: "t1", deletedAt: "2026-08-10T00:00:00Z" }),
      task({ topicId: "outro", status: "done" }),
    ];
    const progresso = calculateTopicProgress(tasks, "t1", HOJE);
    assert.deepEqual(
      { total: progresso.total, done: progresso.done, percent: progresso.percent },
      { total: 2, done: 1, percent: 50 }
    );
  });

  test("tópico vazio não divide por zero", () => {
    assert.equal(calculateTopicProgress([], "t1", HOJE).percent, 0);
  });
});

describe("filtros e ordenação", () => {
  const tasks = [
    task({ id: "a", title: "Comprar café", priority: "low", tags: ["casa"] }),
    task({ id: "b", title: "Revisar contrato", priority: "critical", dueDate: "2026-08-01" }),
    task({ id: "c", title: "Feita", status: "done", priority: "high" }),
    task({ id: "d", title: "Na lixeira", deletedAt: "2026-08-10T00:00:00Z" }),
  ];

  test("lixeira nunca aparece no quadro", () => {
    const ids = filterTasks(tasks, {}, HOJE).map((t) => t.id);
    assert.ok(!ids.includes("d"));
  });

  test("filtro por prioridade", () => {
    assert.deepEqual(
      filterTasks(tasks, { priority: "critical" }, HOJE).map((t) => t.id),
      ["b"]
    );
  });

  test("filtro só atrasadas", () => {
    assert.deepEqual(
      filterTasks(tasks, { onlyOverdue: true }, HOJE).map((t) => t.id),
      ["b"]
    );
  });

  test("ocultar concluídas", () => {
    const ids = filterTasks(tasks, { hideDone: true }, HOJE).map((t) => t.id);
    assert.ok(!ids.includes("c"));
  });

  test("busca casa com título e tag, sem diferenciar maiúscula", () => {
    assert.deepEqual(filterTasks(tasks, { search: "CAFÉ" }, HOJE).map((t) => t.id), ["a"]);
    assert.deepEqual(filterTasks(tasks, { search: "casa" }, HOJE).map((t) => t.id), ["a"]);
  });

  test("ordenar por prioridade coloca crítica na frente", () => {
    const ordenado = sortTasks(filterTasks(tasks, {}, HOJE), "priority");
    assert.equal(ordenado[0].id, "b");
  });

  test("ordenar por prazo joga sem-prazo pro fim", () => {
    const ordenado = sortTasks(filterTasks(tasks, {}, HOJE), "dueDate");
    assert.equal(ordenado[0].id, "b");
    assert.equal(ordenado[ordenado.length - 1].dueDate, undefined);
  });
});

describe("backup e importação", () => {
  test("valida JSON quebrado sem lançar", () => {
    const r = validateBackup("{ isso não é json");
    assert.equal(r.valid, false);
    assert.ok(r.error);
  });

  test("valida backup sem as listas obrigatórias", () => {
    assert.equal(validateBackup(JSON.stringify({ foo: 1 })).valid, false);
  });

  test("backup válido reporta a contagem que será importada", () => {
    const json = JSON.stringify({
      topics: [topic()],
      tasks: [{ id: "a", topicId: "t1", title: "X" }],
    });
    const r = validateBackup(json);
    assert.equal(r.valid, true);
    assert.equal(r.topics, 1);
    assert.equal(r.tasks, 1);
  });

  test("merge não duplica id já existente e reporta o que pulou", () => {
    const current = { ...emptyBoard(), topics: [topic()], tasks: [task({ id: "a" })] };
    const incoming = {
      ...emptyBoard(),
      topics: [topic()],
      tasks: [task({ id: "a" }), task({ id: "novo" })],
    };
    const { board, report } = mergeImportedData(current, incoming);
    assert.equal(board.tasks.length, 2);
    assert.equal(report.tasksAdded, 1);
    assert.equal(report.duplicatesSkipped, 2);
  });

  test("merge descarta tarefa cujo tópico não existe em lugar nenhum", () => {
    const current = { ...emptyBoard(), topics: [topic()], tasks: [] };
    const incoming = { ...emptyBoard(), topics: [], tasks: [task({ topicId: "fantasma" })] };
    const { board } = mergeImportedData(current, incoming);
    assert.equal(board.tasks.length, 0);
  });
});

describe("métricas semanais", () => {
  test("startOfWeekISO cai na segunda, inclusive quando hoje é domingo", () => {
    assert.equal(startOfWeekISO("2026-08-16"), "2026-08-10"); // domingo
    assert.equal(startOfWeekISO("2026-08-10"), "2026-08-10"); // segunda
  });

  test("conta concluídas da semana e ignora conclusão de outra semana", () => {
    const semana = startOfWeekISO(HOJE);
    const m = calculateWeeklyMetrics(
      [
        task({ status: "done", completedAt: `${semana}T10:00:00.000Z` }),
        task({ status: "done", completedAt: "2026-07-01T10:00:00.000Z" }),
      ],
      [topic()],
      HOJE
    );
    assert.equal(m.completed, 1);
  });

  test("tempo estimado só soma o que foi de fato estimado", () => {
    const semana = startOfWeekISO(HOJE);
    const m = calculateWeeklyMetrics(
      [
        task({ status: "done", completedAt: `${semana}T10:00:00.000Z`, estimatedMinutes: 30 }),
        task({ status: "done", completedAt: `${semana}T11:00:00.000Z` }),
        task({ status: "todo", estimatedMinutes: 15 }),
      ],
      [topic()],
      HOJE
    );
    assert.equal(m.estimatedMinutesCompleted, 30);
    assert.equal(m.estimatedMinutesPending, 15);
  });

  test("críticas abertas e altas atrasadas aparecem separadas", () => {
    const m = calculateWeeklyMetrics(
      [
        task({ priority: "critical", status: "todo" }),
        task({ priority: "high", dueDate: "2026-08-01" }),
      ],
      [topic()],
      HOJE
    );
    assert.equal(m.criticalOpen, 1);
    assert.equal(m.highOverdue, 1);
  });

  test("semana sem tarefa criada não divide por zero", () => {
    const m = calculateWeeklyMetrics([], [], HOJE);
    assert.equal(m.completionRate, 0);
  });
});

describe("recorrência — próxima data", () => {
  test("diária respeita o intervalo", () => {
    assert.equal(nextOccurrence({ frequency: "daily" }, "2026-08-16"), "2026-08-17");
    assert.equal(
      nextOccurrence({ frequency: "daily", interval: 3 }, "2026-08-16"),
      "2026-08-19"
    );
  });

  test("semanal sem dias marcados pula 7 dias", () => {
    assert.equal(nextOccurrence({ frequency: "weekly" }, "2026-08-16"), "2026-08-23");
  });

  test("semanal com dias marcados vai pro próximo dia da semana, não +7", () => {
    // 2026-08-17 é segunda (1). Marcado seg(1) e qui(4) → próxima é quinta.
    assert.equal(
      nextOccurrence({ frequency: "weekly", weekdays: [1, 4] }, "2026-08-17"),
      "2026-08-20"
    );
  });

  test("semanal vira a semana quando não sobra dia marcado à frente", () => {
    // 2026-08-20 é quinta (4); marcado seg(1) e qui(4) → volta pra segunda.
    assert.equal(
      nextOccurrence({ frequency: "weekly", weekdays: [1, 4] }, "2026-08-20"),
      "2026-08-24"
    );
  });

  test("mensal mantém o dia do mês", () => {
    assert.equal(nextOccurrence({ frequency: "monthly" }, "2026-08-16"), "2026-09-16");
  });

  test("mensal não vaza pro mês seguinte quando o dia não existe (31 → fevereiro)", () => {
    assert.equal(nextOccurrence({ frequency: "monthly" }, "2026-01-31"), "2026-02-28");
  });

  test("mensal atravessa a virada de ano", () => {
    assert.equal(
      nextOccurrence({ frequency: "monthly", interval: 2 }, "2026-12-10"),
      "2027-02-10"
    );
  });

  test("intervalo inválido (0) não trava em loop nem repete a mesma data", () => {
    assert.equal(
      nextOccurrence({ frequency: "daily", interval: 0 }, "2026-08-16"),
      "2026-08-17"
    );
  });
});

describe("recorrência — nova ocorrência", () => {
  test("tarefa sem recorrência não gera ocorrência nenhuma", () => {
    assert.equal(createRecurringTask(task({}), "novo"), null);
  });

  test("nova ocorrência nasce aberta, com prazo à frente e sem completedAt", () => {
    const original = task({
      status: "done",
      completedAt: "2026-08-16T10:00:00.000Z",
      dueDate: "2026-08-16",
      recurrence: { frequency: "daily" },
    });
    const proxima = createRecurringTask(original, "novo-id", "2026-08-16T10:00:00.000Z");
    assert.equal(proxima!.id, "novo-id");
    assert.equal(proxima!.status, "todo");
    assert.equal(proxima!.completedAt, undefined);
    assert.equal(proxima!.dueDate, "2026-08-17");
  });

  test("checklist volta desmarcado na nova ocorrência", () => {
    const original = task({
      recurrence: { frequency: "weekly" },
      dueDate: "2026-08-16",
      checklist: [
        { id: "1", label: "a", completed: true },
        { id: "2", label: "b", completed: true },
      ],
    });
    const proxima = createRecurringTask(original, "novo-id");
    assert.deepEqual(
      proxima!.checklist.map((c) => c.completed),
      [false, false]
    );
  });

  test("recorrente sem prazo usa a data de conclusão como base", () => {
    const original = task({ recurrence: { frequency: "daily" }, dueDate: undefined });
    const proxima = createRecurringTask(original, "novo-id", "2026-08-16T10:00:00.000Z");
    assert.equal(proxima!.dueDate, "2026-08-17");
  });

  test("concluir às 22h30 no Brasil usa o dia LOCAL, não o dia UTC (já é 17 lá)", () => {
    const original = task({ recurrence: { frequency: "daily" }, dueDate: undefined });
    // 22h30 de 16/09 em Brasília = 01h30 de 17/09 em UTC.
    const proxima = createRecurringTask(original, "novo-id", "2026-09-17T01:30:00.000Z");
    assert.equal(proxima!.dueDate, "2026-09-17");
  });

  test("nova ocorrência nasce sem a marca de já ter gerado — a corrente continua", () => {
    const original = task({
      recurrence: { frequency: "daily" },
      dueDate: "2026-08-16",
      recurrenceSpawned: true,
    });
    const proxima = createRecurringTask(original, "novo-id");
    assert.equal(proxima!.recurrenceSpawned, false);
  });

  test("descrição legível cobre os três tipos", () => {
    assert.equal(describeRecurrence({ frequency: "daily" }), "Todo dia");
    assert.equal(describeRecurrence({ frequency: "daily", interval: 2 }), "A cada 2 dias");
    assert.equal(
      describeRecurrence({ frequency: "weekly", weekdays: [1, 4] }),
      "Toda semana (seg, qui)"
    );
    assert.equal(describeRecurrence({ frequency: "monthly" }), "Todo mês");
  });
});

describe("visão de projeto", () => {
  test("próxima ação prefere o que já está em andamento", () => {
    const fazendo = task({ id: "fazendo", status: "doing", priority: "low" });
    const criticaParada = task({ id: "critica", status: "todo", priority: "critical" });
    assert.equal(getNextAction([criticaParada, fazendo], "t1", HOJE)!.id, "fazendo");
  });

  test("sem nada em andamento, atrasada ganha da prioridade alta em dia", () => {
    const atrasada = task({ id: "atrasada", priority: "medium", dueDate: "2026-08-01" });
    const alta = task({ id: "alta", priority: "high" });
    assert.equal(getNextAction([alta, atrasada], "t1", HOJE)!.id, "atrasada");
  });

  test("empate de prioridade decide pelo prazo mais próximo", () => {
    const longe = task({ id: "longe", priority: "high", dueDate: "2026-09-30" });
    const perto = task({ id: "perto", priority: "high", dueDate: "2026-08-20" });
    assert.equal(getNextAction([longe, perto], "t1", HOJE)!.id, "perto");
  });

  test("tópico só com tarefas concluídas não tem próxima ação", () => {
    assert.equal(getNextAction([task({ status: "done" })], "t1", HOJE), null);
  });

  test("próxima ação ignora tarefa de outro tópico", () => {
    const outra = task({ topicId: "outro", priority: "critical" });
    assert.equal(getNextAction([outra], "t1", HOJE), null);
  });

  test("concluídas recentemente vêm da mais nova pra mais antiga", () => {
    const antiga = task({ id: "antiga", status: "done", completedAt: "2026-08-10T10:00:00Z" });
    const nova = task({ id: "nova", status: "done", completedAt: "2026-08-15T10:00:00Z" });
    assert.deepEqual(
      getRecentlyCompleted([antiga, nova], "t1").map((t) => t.id),
      ["nova", "antiga"]
    );
  });

  test("estatísticas do tópico somam por status e só estimativa preenchida", () => {
    const stats = topicStats(
      [
        task({ status: "done" }),
        task({ status: "doing", estimatedMinutes: 30 }),
        task({ status: "todo" }),
        task({ status: "todo", dueDate: "2026-08-01" }),
        task({ deletedAt: "2026-08-10T00:00:00Z" }),
      ],
      "t1",
      HOJE
    );
    assert.deepEqual(
      {
        total: stats.total,
        done: stats.done,
        doing: stats.doing,
        todo: stats.todo,
        overdue: stats.overdue,
        estimado: stats.estimatedMinutesPending,
      },
      { total: 4, done: 1, doing: 1, todo: 2, overdue: 1, estimado: 30 }
    );
  });

  test("tópico vazio devolve zeros sem quebrar", () => {
    const stats = topicStats([], "t1", HOJE);
    assert.equal(stats.percent, 0);
    assert.equal(stats.lastActivity, null);
  });
});

describe("dia local vs UTC", () => {
  test("localDayOf usa o dia do fuso do usuário, não o de UTC", () => {
    // Meia-noite e meia UTC = ainda o dia anterior em qualquer fuso negativo.
    const timestamp = "2026-08-17T00:30:00.000Z";
    const esperado = new Date(timestamp);
    const local = `${esperado.getFullYear()}-${String(esperado.getMonth() + 1).padStart(2, "0")}-${String(
      esperado.getDate()
    ).padStart(2, "0")}`;
    assert.equal(localDayOf(timestamp), local);
  });

  test("data pura (sem hora) passa intacta, sem reinterpretar fuso", () => {
    assert.equal(localDayOf("2026-08-16"), "2026-08-16");
  });

  test("timestamp inválido devolve o que dá, sem lançar", () => {
    assert.equal(localDayOf("2026-13-99T99:99:99Z"), "2026-13-99");
  });

  test("daysBetween compara pelo dia local — conclusão à noite não vira dia negativo", () => {
    const agora = new Date();
    const hojeLocal = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(
      agora.getDate()
    ).padStart(2, "0")}`;
    assert.equal(daysBetween(agora.toISOString(), hojeLocal), 0);
  });

  test("daysBetween conta dias inteiros entre datas puras", () => {
    assert.equal(daysBetween("2026-08-10", "2026-08-16"), 6);
  });
});

describe("pular ocorrência", () => {
  test("empurra o prazo sem concluir a tarefa", () => {
    const original = task({
      recurrence: { frequency: "weekly" },
      dueDate: "2026-08-17",
      status: "todo",
    });
    const pulada = skipOccurrence(original, "2026-08-16T10:00:00.000Z");
    assert.equal(pulada!.dueDate, "2026-08-24");
    assert.equal(pulada!.status, "todo");
    assert.equal(pulada!.completedAt, undefined);
  });

  test("não conta como concluída — não polui a métrica da semana", () => {
    const original = task({ recurrence: { frequency: "daily" }, dueDate: "2026-08-16" });
    const pulada = skipOccurrence(original);
    assert.equal(pulada!.completedAt, undefined);
    assert.equal(pulada!.recurrenceSpawned, undefined);
  });

  test("tarefa não recorrente não pode ser pulada", () => {
    assert.equal(skipOccurrence(task({ dueDate: "2026-08-16" })), null);
  });

  test("sem prazo, pular às 22h30 no Brasil usa o dia LOCAL como base", () => {
    const original = task({ recurrence: { frequency: "daily" }, dueDate: undefined });
    // 22h30 de 16/09 em Brasília = 01h30 de 17/09 em UTC.
    const pulada = skipOccurrence(original, "2026-09-17T01:30:00.000Z");
    assert.equal(pulada!.dueDate, "2026-09-17");
  });
});

describe("insights do tópico", () => {
  test("ritmo separa últimos 7 dias dos últimos 30", () => {
    const insights = topicInsights(
      [
        task({ status: "done", completedAt: "2026-08-14T10:00:00Z" }), // 2 dias
        task({ status: "done", completedAt: "2026-08-01T10:00:00Z" }), // 15 dias
        task({ status: "done", completedAt: "2026-06-01T10:00:00Z" }), // 76 dias
      ],
      "t1",
      HOJE
    );
    assert.equal(insights.completedLast7, 1);
    assert.equal(insights.completedLast30, 2);
  });

  test("mediana de dias até concluir ignora createdAt de migração antiga (1970)", () => {
    const insights = topicInsights(
      [
        task({
          status: "done",
          createdAt: "2026-08-10T10:00:00Z",
          completedAt: "2026-08-14T10:00:00Z",
        }),
        task({
          status: "done",
          createdAt: "1970-01-01T00:00:00.000Z",
          completedAt: "2026-08-14T10:00:00Z",
        }),
      ],
      "t1",
      HOJE
    );
    assert.equal(insights.medianDaysToComplete, 4);
  });

  test("mediana é null quando nada foi concluído", () => {
    assert.equal(topicInsights([task({})], "t1", HOJE).medianDaysToComplete, null);
  });

  test("distribuição por prioridade conta só o que está aberto", () => {
    const insights = topicInsights(
      [
        task({ priority: "critical" }),
        task({ priority: "critical", status: "done", completedAt: "2026-08-15T10:00:00Z" }),
        task({ priority: "low" }),
      ],
      "t1",
      HOJE
    );
    assert.equal(insights.byPriority.critical, 1);
    assert.equal(insights.byPriority.low, 1);
  });

  test("percentual de atraso considera só as abertas", () => {
    const insights = topicInsights(
      [
        task({ dueDate: "2026-08-01" }),
        task({ dueDate: "2026-09-01" }),
        task({ status: "done", completedAt: "2026-08-15T10:00:00Z" }),
      ],
      "t1",
      HOJE
    );
    assert.equal(insights.overdueShare, 50);
  });

  test("tópico sem tarefa aberta não divide por zero", () => {
    assert.equal(topicInsights([], "t1", HOJE).overdueShare, 0);
    assert.equal(topicInsights([], "t1", HOJE).daysSinceActivity, null);
  });

  test("dias desde a última atividade nunca é negativo na virada do dia", () => {
    // updatedAt "agora" pode estar no dia seguinte em UTC enquanto o dia
    // local ainda é hoje — antes isso exibia "-1d desde a última mexida".
    const insights = topicInsights(
      [task({ updatedAt: new Date().toISOString() })],
      "t1",
      todayLocal()
    );
    assert.ok(insights.daysSinceActivity !== null && insights.daysSinceActivity >= 0);
  });
});

describe("dinheiro (centavos)", () => {
  test("lê os formatos que a pessoa realmente digita", () => {
    assert.equal(parseBRL("1500"), 150000);
    assert.equal(parseBRL("1500,50"), 150050);
    assert.equal(parseBRL("1.500,50"), 150050);
    assert.equal(parseBRL("R$ 1.500,50"), 150050);
    assert.equal(parseBRL("R$1500"), 150000);
    assert.equal(parseBRL("  89,90 "), 8990);
  });

  test("ponto sozinho: 3 casas é milhar, o resto é decimal", () => {
    assert.equal(parseBRL("1.500"), 150000);
    assert.equal(parseBRL("1.5"), 150);
    assert.equal(parseBRL("1.50"), 150);
    assert.equal(parseBRL("1500.50"), 150050);
  });

  test("campo vazio ou lixo devolve null, não zero", () => {
    assert.equal(parseBRL(""), null);
    assert.equal(parseBRL("   "), null);
    assert.equal(parseBRL("abc"), null);
    assert.equal(parseBRL("R$"), null);
    // Zero de verdade continua sendo zero, não null.
    assert.equal(parseBRL("0"), 0);
  });

  test("formata em real brasileiro", () => {
    // \u00a0 = espaço não separável, é o que o Intl usa depois do "R$".
    assert.equal(formatBRL(150050).replace(/\u00a0/g, " "), "R$ 1.500,50");
    assert.equal(formatBRL(0).replace(/\u00a0/g, " "), "R$ 0,00");
  });

  test("ida e volta entre input e centavos não perde valor", () => {
    for (const cents of [0, 990, 8990, 150050, 99999999]) {
      assert.equal(parseBRL(centsToInput(cents)), cents);
    }
  });

  test("soma de centavos não tem erro de float (o motivo de usar inteiro)", () => {
    const itens = [1010, 2020, 3030, 1099];
    assert.equal(itens.reduce((a, b) => a + b, 0), 7159);
    // O mesmo em reais com float erraria:
    assert.notEqual(0.1 + 0.2, 0.3);
  });
});

describe("lista de desejos", () => {
  function item(partial: Partial<Task>): Task {
    return task({ topicId: "w1", ...partial });
  }

  test("separa o que já foi comprado do que ainda quero", () => {
    const totals = wishlistTotals(
      [
        item({ title: "Insulfilm", priceCents: 45000, status: "todo" }),
        item({ title: "Calça", priceCents: 19990, status: "todo" }),
        item({ title: "Prateleira", priceCents: 12000, status: "done" }),
      ],
      "w1"
    );
    assert.equal(totals.wantedCents, 64990);
    assert.equal(totals.boughtCents, 12000);
    assert.equal(totals.itemsWanted, 2);
    assert.equal(totals.itemsBought, 1);
  });

  test("conta itens sem preço pro total poder ser honesto", () => {
    const totals = wishlistTotals(
      [
        item({ priceCents: 45000 }),
        item({ priceCents: undefined }),
        item({ priceCents: undefined }),
      ],
      "w1"
    );
    assert.equal(totals.wantedCents, 45000);
    assert.equal(totals.itemsWithoutPrice, 2);
  });

  test("item na lixeira ou arquivado não entra no total", () => {
    const totals = wishlistTotals(
      [
        item({ priceCents: 10000 }),
        item({ priceCents: 99900, deletedAt: "2026-08-16T00:00:00Z" }),
        item({ priceCents: 88800, archivedAt: "2026-08-16T00:00:00Z" }),
      ],
      "w1"
    );
    assert.equal(totals.wantedCents, 10000);
  });

  test("item de outra pasta não entra no total", () => {
    const totals = wishlistTotals(
      [item({ priceCents: 10000 }), task({ topicId: "outro", priceCents: 50000 })],
      "w1"
    );
    assert.equal(totals.wantedCents, 10000);
  });

  test("lista vazia soma zero sem quebrar", () => {
    const totals = wishlistTotals([], "w1");
    assert.equal(totals.wantedCents, 0);
    assert.equal(totals.itemsWanted, 0);
  });

  test("tópico antigo sem kind continua sendo projeto", () => {
    assert.equal(isWishlist(topic()), false);
    assert.equal(isWishlist(topic({ kind: "wishlist" })), true);
    assert.equal(isWishlist(undefined), false);
  });

  test("rótulos falam a língua da pasta", () => {
    assert.equal(statusLabel("done", "project"), "Feito");
    assert.equal(statusLabel("done", "wishlist"), "Comprado");
    assert.equal(statusLabel("todo", "wishlist"), "Quero");
    assert.equal(priorityLabel("critical", "project"), "Crítica");
    assert.equal(priorityLabel("critical", "wishlist"), "Preciso");
  });

  test("mostra o domínio do link, não a URL inteira", () => {
    assert.equal(linkHost("https://www.amazon.com.br/dp/B08XYZ?ref=abc"), "amazon.com.br");
    assert.equal(linkHost("não é url"), "não é url");
  });

  test("link colado sem https vira link absoluto", () => {
    assert.equal(normalizeUrl("amazon.com.br/dp/X"), "https://amazon.com.br/dp/X");
    assert.equal(normalizeUrl("https://loja.com/x"), "https://loja.com/x");
    assert.equal(normalizeUrl(""), undefined);
  });

  test("javascript: no link é recusado (nunca vira href executável)", () => {
    // Sem esquema http/https explícito o normalize prefixa https://, então o
    // que importa é que o resultado nunca seja um href javascript:.
    const resultado = normalizeUrl("javascript:alert(1)");
    assert.ok(resultado === undefined || resultado.startsWith("https://"));
  });
});

describe("migração dos campos de desejo", () => {
  test("tópico antigo sem kind vira projeto, não lista de desejos", () => {
    const board = migrateBoard({
      topics: [{ id: "t1", name: "Antigo", createdAt: "2026-01-01" }],
      tasks: [],
    });
    assert.equal(board.topics[0].kind, "project");
  });

  test("kind wishlist é preservado; valor inválido cai pra projeto", () => {
    const board = migrateBoard({
      topics: [
        { id: "a", name: "Desejos", kind: "wishlist", createdAt: "2026-01-01" },
        { id: "b", name: "Estranho", kind: "sei-la", createdAt: "2026-01-01" },
      ],
      tasks: [],
    });
    assert.equal(board.topics[0].kind, "wishlist");
    assert.equal(board.topics[1].kind, "project");
  });

  test("preço inválido em backup adulterado não envenena a soma", () => {
    const board = migrateBoard({
      topics: [topic()],
      tasks: [
        { id: "a", topicId: "t1", title: "Ok", priceCents: 45000 },
        { id: "b", topicId: "t1", title: "NaN", priceCents: Number.NaN },
        { id: "c", topicId: "t1", title: "Negativo", priceCents: -500 },
        { id: "d", topicId: "t1", title: "Texto", priceCents: "1000" },
        { id: "e", topicId: "t1", title: "Quebrado", priceCents: 12.7 },
      ],
    });
    const precos = board.tasks.map((t) => t.priceCents);
    assert.deepEqual(precos, [45000, undefined, undefined, undefined, 13]);
  });

  test("link e loja sobrevivem à migração", () => {
    const board = migrateBoard({
      topics: [topic()],
      tasks: [
        {
          id: "a",
          topicId: "t1",
          title: "Insulfilm",
          url: "https://loja.com/x",
          store: "Loja do Zé",
        },
      ],
    });
    assert.equal(board.tasks[0].url, "https://loja.com/x");
    assert.equal(board.tasks[0].store, "Loja do Zé");
  });
});

describe("criação de tarefa (o construtor não pode engolir campo)", () => {
  test("campos de compra sobrevivem à criação — o bug que fez preço sumir", () => {
    const criada = createTask(
      {
        topicId: "w1",
        title: "Insulfilm G5",
        priceCents: 45000,
        url: "https://loja.com/x",
        store: "Auto Center",
      },
      "id-novo",
      "2026-08-16T10:00:00.000Z"
    );
    assert.equal(criada.priceCents, 45000);
    assert.equal(criada.url, "https://loja.com/x");
    assert.equal(criada.store, "Auto Center");
  });

  test("todo campo do input aparece na tarefa criada", () => {
    // Trava a classe do bug: se alguém adicionar um campo ao input e esquecer
    // de copiar no construtor, este teste quebra em vez de sumir calado.
    const input = {
      topicId: "t1",
      title: "Tudo preenchido",
      description: "desc",
      dueDate: "2026-09-01",
      status: "doing" as const,
      priority: "high" as const,
      energy: "quick" as const,
      estimatedMinutes: 15,
      tags: ["a"],
      priceCents: 1000,
      url: "https://x.com/",
      store: "Loja",
    };
    const criada = createTask(input, "id", "2026-08-16T10:00:00.000Z");
    for (const [chave, valor] of Object.entries(input)) {
      if (chave === "title" || chave === "description") continue; // sofrem trim
      assert.deepEqual(
        criada[chave as keyof typeof criada],
        valor,
        `campo "${chave}" foi descartado na criação`
      );
    }
  });

  test("aplica os padrões quando o formulário manda o mínimo", () => {
    const criada = createTask({ topicId: "t1", title: "  Só título  " }, "id", "2026-08-16T10:00:00.000Z");
    assert.equal(criada.title, "Só título");
    assert.equal(criada.status, "todo");
    assert.equal(criada.priority, "medium");
    assert.deepEqual(criada.tags, []);
    assert.equal(criada.priceCents, undefined);
  });

  test("nascer já concluída carimba completedAt sozinha", () => {
    const criada = createTask(
      { topicId: "t1", title: "Já fiz isso", status: "done" },
      "id",
      "2026-08-16T10:00:00.000Z"
    );
    assert.equal(criada.completedAt, "2026-08-16T10:00:00.000Z");
  });
});

describe("cronograma — cronômetro", () => {
  const T0 = new Date("2026-08-16T10:00:00.000Z").getTime();

  function bloco(partial: Partial<ScheduleBlock> = {}): ScheduleBlock {
    return {
      id: "b1",
      date: "2026-08-16",
      title: "Chamar leads",
      plannedMinutes: 40,
      accumulatedMs: 0,
      order: 0,
      ...partial,
    };
  }

  test("bloco parado não conta tempo", () => {
    assert.equal(elapsedMs(bloco(), T0), 0);
    assert.equal(isRunning(bloco()), false);
  });

  test("bloco rodando conta a partir do instante de início", () => {
    const b = bloco({ startedAt: new Date(T0).toISOString() });
    assert.equal(elapsedMs(b, T0 + 5 * MINUTE_MS), 5 * MINUTE_MS);
    assert.equal(isRunning(b), true);
  });

  test("o tempo continua correndo com o app fechado (é o instante que manda)", () => {
    // Ligou às 10h, voltou ao app 25 min depois: tem que mostrar 25 min,
    // não zero — nada depende de um contador rodando na tela.
    const b = startBlock(bloco(), new Date(T0).toISOString());
    assert.equal(elapsedMs(b, T0 + 25 * MINUTE_MS), 25 * MINUTE_MS);
  });

  test("pausar acumula e parar de contar", () => {
    const rodando = startBlock(bloco(), new Date(T0).toISOString());
    const pausado = pauseBlock(rodando, T0 + 10 * MINUTE_MS);
    assert.equal(pausado.accumulatedMs, 10 * MINUTE_MS);
    assert.equal(isRunning(pausado), false);
    // Meia hora depois, parado, continua marcando os mesmos 10 min.
    assert.equal(elapsedMs(pausado, T0 + 40 * MINUTE_MS), 10 * MINUTE_MS);
  });

  test("retomar soma em cima do que já tinha", () => {
    let b = startBlock(bloco(), new Date(T0).toISOString());
    b = pauseBlock(b, T0 + 10 * MINUTE_MS);
    b = startBlock(b, new Date(T0 + 20 * MINUTE_MS).toISOString());
    assert.equal(elapsedMs(b, T0 + 25 * MINUTE_MS), 15 * MINUTE_MS);
  });

  test("tempo restante e passar do combinado", () => {
    const b = startBlock(bloco({ plannedMinutes: 40 }), new Date(T0).toISOString());
    assert.equal(remainingMs(b, T0 + 30 * MINUTE_MS), 10 * MINUTE_MS);
    assert.equal(isOvertime(b, T0 + 30 * MINUTE_MS), false);
    assert.equal(remainingMs(b, T0 + 45 * MINUTE_MS), -5 * MINUTE_MS);
    assert.equal(isOvertime(b, T0 + 45 * MINUTE_MS), true);
  });

  test("concluir congela o tempo — bloco feito não segue contando", () => {
    const rodando = startBlock(bloco(), new Date(T0).toISOString());
    const feito = completeBlock(rodando, new Date(T0 + 40 * MINUTE_MS).toISOString());
    assert.equal(isRunning(feito), false);
    assert.equal(elapsedMs(feito, T0 + 999 * MINUTE_MS), 40 * MINUTE_MS);
  });

  test("relógio andando pra trás não faz o tempo encolher", () => {
    const b = startBlock(bloco(), new Date(T0).toISOString());
    assert.equal(elapsedMs(b, T0 - 10 * MINUTE_MS), 0);
  });

  test("startar duas vezes não reinicia nem duplica a contagem", () => {
    const b = startBlock(bloco(), new Date(T0).toISOString());
    const denovo = startBlock(b, new Date(T0 + 5 * MINUTE_MS).toISOString());
    assert.equal(denovo.startedAt, b.startedAt);
    assert.equal(elapsedMs(denovo, T0 + 10 * MINUTE_MS), 10 * MINUTE_MS);
  });

  test("zerar limpa o cronômetro mas mantém o bloco", () => {
    let b = startBlock(bloco(), new Date(T0).toISOString());
    b = completeBlock(b, new Date(T0 + 40 * MINUTE_MS).toISOString());
    const zerado = resetBlock(b);
    assert.equal(elapsedMs(zerado, T0 + 99 * MINUTE_MS), 0);
    assert.equal(zerado.completedAt, undefined);
    assert.equal(zerado.title, "Chamar leads");
  });

  test("formata o tempo do jeito que se lê de relance", () => {
    assert.equal(formatDuration(0), "00:00");
    assert.equal(formatDuration(65 * 1000), "01:05");
    assert.equal(formatDuration(40 * MINUTE_MS), "40:00");
    assert.equal(formatDuration(65 * MINUTE_MS), "1:05:00");
    assert.equal(formatDuration(-5000), "00:00");
  });

  test("progresso trava em 100% mesmo passando do tempo", () => {
    const b = startBlock(bloco({ plannedMinutes: 40 }), new Date(T0).toISOString());
    assert.equal(progressPercent(b, T0 + 20 * MINUTE_MS), 50);
    assert.equal(progressPercent(b, T0 + 80 * MINUTE_MS), 100);
  });

  test("totais do dia somam planejado, gasto e concluídos", () => {
    const b1 = completeBlock(
      startBlock(bloco({ id: "1", plannedMinutes: 40 }), new Date(T0).toISOString()),
      new Date(T0 + 40 * MINUTE_MS).toISOString()
    );
    const b2 = bloco({ id: "2", plannedMinutes: 30 });
    const t = scheduleTotals([b1, b2], T0 + 40 * MINUTE_MS);
    assert.equal(t.plannedMs, 70 * MINUTE_MS);
    assert.equal(t.elapsedMs, 40 * MINUTE_MS);
    assert.equal(t.doneCount, 1);
    assert.equal(t.total, 2);
    assert.equal(t.runningId, null);
  });

  test("totais apontam qual bloco está rodando", () => {
    const rodando = startBlock(bloco({ id: "x" }), new Date(T0).toISOString());
    assert.equal(scheduleTotals([bloco({ id: "y" }), rodando], T0).runningId, "x");
  });

  test("a mesma atividade pode aparecer várias vezes no mesmo dia", () => {
    // É o caso da agenda de papel: leads de manhã, leads à tarde.
    const dia = [
      bloco({ id: "1", title: "Leads", plannedMinutes: 40, order: 0 }),
      bloco({ id: "2", title: "Leads", plannedMinutes: 30, order: 5 }),
      bloco({ id: "3", title: "Instagram", plannedMinutes: 30, order: 2, date: "2026-08-17" }),
    ];
    const hoje = blocksOfDay(dia, "2026-08-16");
    assert.deepEqual(hoje.map((b) => b.id), ["1", "2"]);
  });
});

describe("relógio do dia (união dos intervalos, não soma das durações)", () => {
  const T0 = new Date("2026-08-16T10:00:00.000Z").getTime();

  function bloco(partial: Partial<ScheduleBlock> = {}): ScheduleBlock {
    return {
      id: "b1",
      date: "2026-08-16",
      title: "Chamar leads",
      plannedMinutes: 40,
      accumulatedMs: 0,
      order: 0,
      ...partial,
    };
  }

  test("pausar registra a sessão de verdade, com início e fim", () => {
    const rodando = startBlock(bloco(), new Date(T0).toISOString());
    const pausado = pauseBlock(rodando, T0 + 10 * MINUTE_MS);
    assert.deepEqual(pausado.sessions, [
      { start: new Date(T0).toISOString(), end: new Date(T0 + 10 * MINUTE_MS).toISOString() },
    ]);
  });

  test("pausar de novo empilha a sessão nova sem apagar a anterior", () => {
    let b = startBlock(bloco(), new Date(T0).toISOString());
    b = pauseBlock(b, T0 + 10 * MINUTE_MS);
    b = startBlock(b, new Date(T0 + 20 * MINUTE_MS).toISOString());
    b = pauseBlock(b, T0 + 25 * MINUTE_MS);
    assert.equal(b.sessions!.length, 2);
    assert.equal(b.sessions![1].start, new Date(T0 + 20 * MINUTE_MS).toISOString());
  });

  test("bloco rodando agora entra em allSessions com o trecho até o instante pedido", () => {
    const rodando = startBlock(bloco(), new Date(T0).toISOString());
    const sessoes = allSessions(rodando, T0 + 15 * MINUTE_MS);
    assert.deepEqual(sessoes, [
      { start: new Date(T0).toISOString(), end: new Date(T0 + 15 * MINUTE_MS).toISOString() },
    ]);
  });

  test("zerar o cronômetro também limpa as sessões — relatório não mostra dois números diferentes", () => {
    let b = startBlock(bloco(), new Date(T0).toISOString());
    b = pauseBlock(b, T0 + 30 * MINUTE_MS);
    const zerado = resetBlock(b);
    assert.equal(zerado.accumulatedMs, 0);
    assert.deepEqual(allSessions(zerado, T0 + 99 * MINUTE_MS), []);
  });

  test("bloco legado com 60 acumulados e 30 rodando dá 90 no total, não 60", () => {
    // accumulatedMs vem de ANTES deste recurso existir — nenhuma sessão
    // registrada ainda — e o bloco está rodando um trecho novo por cima.
    const b = { ...bloco(), accumulatedMs: 60 * MINUTE_MS, startedAt: new Date(T0).toISOString() };
    const agora = T0 + 30 * MINUTE_MS;
    const sessoes = allSessions(b, agora);
    const total = sessoes.reduce(
      (soma, s) => soma + (new Date(s.end).getTime() - new Date(s.start).getTime()),
      0
    );
    assert.equal(total, 90 * MINUTE_MS);
    assert.equal(wallClockMs([b], agora), 90 * MINUTE_MS);
  });

  test("bloco de antes deste recurso (sem sessions) vira uma aproximação, não some do total", () => {
    const antigo = bloco({ accumulatedMs: 20 * MINUTE_MS, completedAt: new Date(T0).toISOString() });
    const sessoes = allSessions(antigo);
    assert.equal(sessoes.length, 1);
    assert.equal(sessoes[0].end, new Date(T0).toISOString());
    assert.equal(new Date(sessoes[0].end).getTime() - new Date(sessoes[0].start).getTime(), 20 * MINUTE_MS);
  });

  test("duas tarefas de 3h rodando juntas contam 3h de relógio, não 6h", () => {
    const a = { ...startBlock(bloco({ id: "a" }), new Date(T0).toISOString()) };
    const b = { ...startBlock(bloco({ id: "b" }), new Date(T0).toISOString()) };
    const agora = T0 + 3 * 60 * MINUTE_MS;
    assert.equal(wallClockMs([a, b], agora), 3 * 60 * MINUTE_MS);
  });

  test("sessões que não se tocam somam cada uma inteira", () => {
    const a = pauseBlock(startBlock(bloco({ id: "a" }), new Date(T0).toISOString()), T0 + 30 * MINUTE_MS);
    const b = pauseBlock(
      startBlock(bloco({ id: "b" }), new Date(T0 + 60 * MINUTE_MS).toISOString()),
      T0 + 80 * MINUTE_MS
    );
    assert.equal(wallClockMs([a, b]), 50 * MINUTE_MS);
  });

  test("sessões que se sobrepõem em parte contam a união, não a soma", () => {
    // a: 0–40min · b: 20–50min → união é 0–50min = 50min, não os 70min da soma.
    const a = pauseBlock(startBlock(bloco({ id: "a" }), new Date(T0).toISOString()), T0 + 40 * MINUTE_MS);
    const b = pauseBlock(
      startBlock(bloco({ id: "b" }), new Date(T0 + 20 * MINUTE_MS).toISOString()),
      T0 + 50 * MINUTE_MS
    );
    assert.equal(wallClockMs([a, b]), 50 * MINUTE_MS);
  });

  test("intervalo fica fora do relógio do dia", () => {
    const a = pauseBlock(startBlock(bloco({ id: "a" }), new Date(T0).toISOString()), T0 + 30 * MINUTE_MS);
    const cafe = pauseBlock(
      startBlock(bloco({ id: "cafe", isBreak: true }), new Date(T0 + 30 * MINUTE_MS).toISOString()),
      T0 + 40 * MINUTE_MS
    );
    assert.equal(wallClockMs([a, cafe]), 30 * MINUTE_MS);
  });

  test("migração aceita sessão válida e descarta a que termina antes de começar", () => {
    const b = migrateBoard({
      topics: [], tasks: [],
      schedule: [{
        id: "a", date: "2026-09-05", title: "Leads", plannedMinutes: 30, accumulatedMs: 0, order: 0,
        sessions: [
          { start: "2026-09-05T10:00:00.000Z", end: "2026-09-05T10:30:00.000Z" },
          { start: "2026-09-05T11:00:00.000Z", end: "2026-09-05T10:00:00.000Z" },
          { start: "2026-09-05T12:00:00.000Z" },
        ],
      }],
    });
    assert.deepEqual(b.schedule[0].sessions, [
      { start: "2026-09-05T10:00:00.000Z", end: "2026-09-05T10:30:00.000Z" },
    ]);
  });
});

describe("mensagens de erro de login/cadastro", () => {
  test("credencial inválida vira frase clara em português", () => {
    assert.equal(
      traduzErroAuth(new Error("Invalid login credentials")),
      "E-mail ou senha incorretos."
    );
  });

  test("e-mail já cadastrado orienta a entrar em vez de cadastrar", () => {
    assert.match(traduzErroAuth(new Error("User already registered")), /Tente entrar/);
  });

  test("cadastro desativado diz ONDE ligar, não só que falhou", () => {
    const t = traduzErroAuth(new Error("Signups not allowed for this instance"));
    assert.match(t, /Authentication/);
  });

  test("senha curta explica o mínimo", () => {
    assert.match(
      traduzErroAuth(new Error("Password should be at least 6 characters")),
      /6 caracteres/
    );
  });

  test("erro desconhecido devolve o original em vez de escondê-lo", () => {
    // Esconder atrás de "erro inesperado" tiraria a única pista de diagnóstico.
    assert.equal(traduzErroAuth(new Error("Something very specific broke")), "Something very specific broke");
  });

  test("aceita string, objeto com message, e vazio sem quebrar", () => {
    assert.equal(traduzErroAuth("Invalid login credentials"), "E-mail ou senha incorretos.");
    assert.equal(traduzErroAuth({ message: "Rate limit exceeded" }), "Muitas tentativas seguidas. Espere um pouco e tente de novo.");
    assert.match(traduzErroAuth(null), /Tente de novo/);
    assert.match(traduzErroAuth(undefined), /Tente de novo/);
  });

  test("não depende de maiúsculas/minúsculas do texto original", () => {
    assert.equal(traduzErroAuth(new Error("INVALID LOGIN CREDENTIALS")), "E-mail ou senha incorretos.");
  });
});

describe("mescla automática entre aparelhos", () => {
  function board(p: Partial<ReturnType<typeof emptyBoard>> = {}) {
    return { ...emptyBoard(), ...p };
  }
  function bloco(id: string, title = "Bloco"): ScheduleBlock {
    return { id, date: "2026-09-05", title, plannedMinutes: 40, accumulatedMs: 0, order: 0 };
  }
  function revisao(id: string, weekStart: string) {
    return {
      id, weekStart, stuck: "", toArchive: "", nextPriority: "", wastingTime: "",
      createdAt: "2026-09-01T10:00:00Z",
    };
  }

  test("junta tarefas e tópicos dos dois lados", () => {
    const local = board({ topics: [topic({ id: "a" })], tasks: [task({ id: "1", topicId: "a" })] });
    const remoto = board({
      topics: [topic({ id: "b", name: "Outro" })],
      tasks: [task({ id: "2", topicId: "b" })],
    });
    const { board: r, report } = mergeBoards(local, remoto);
    assert.equal(r.topics.length, 2);
    assert.equal(r.tasks.length, 2);
    assert.equal(report.topicsAdded, 1);
    assert.equal(report.tasksAdded, 1);
  });

  test("NÃO perde o cronograma do outro aparelho (o bug que a mescla antiga tinha)", () => {
    const local = board({ schedule: [bloco("1", "Leads")] });
    const remoto = board({ schedule: [bloco("2", "Mercado Livre")] });
    const { board: r } = mergeBoards(local, remoto);
    assert.deepEqual(r.schedule.map((b) => b.title).sort(), ["Leads", "Mercado Livre"]);
  });

  test("não perde revisões semanais do outro aparelho", () => {
    const local = board({ weeklyReviews: [revisao("a", "2026-08-31")] });
    const remoto = board({ weeklyReviews: [revisao("b", "2026-09-07")] });
    const { board: r } = mergeBoards(local, remoto);
    assert.equal(r.weeklyReviews.length, 2);
  });

  test("revisão da MESMA semana não duplica, mesmo com ids diferentes", () => {
    const local = board({ weeklyReviews: [revisao("a", "2026-08-31")] });
    const remoto = board({ weeklyReviews: [revisao("outro-id", "2026-08-31")] });
    const { board: r } = mergeBoards(local, remoto);
    assert.equal(r.weeklyReviews.length, 1);
    assert.equal(r.weeklyReviews[0].id, "a");
  });

  test("id repetido mantém a versão local, sem duplicar", () => {
    const local = board({ topics: [topic({ id: "a", name: "Local" })] });
    const remoto = board({ topics: [topic({ id: "a", name: "Remoto" })] });
    const { board: r } = mergeBoards(local, remoto);
    assert.equal(r.topics.length, 1);
    assert.equal(r.topics[0].name, "Local");
  });

  test("tarefa remota órfã (tópico inexistente) não entra e viraria invisível", () => {
    const local = board({ topics: [topic({ id: "a" })] });
    const remoto = board({ tasks: [task({ id: "x", topicId: "nao-existe" })] });
    const { board: r } = mergeBoards(local, remoto);
    assert.equal(r.tasks.length, 0);
  });

  test("tarefa apontando pra tópico EXCLUÍDO (não removido, só marcado) não é descartada", () => {
    const local = board({ topics: [topic({ id: "a", deletedAt: "2026-09-01T10:00:00.000Z" })] });
    const remoto = board({ tasks: [task({ id: "x", topicId: "a", deletedAt: "2026-09-01T10:00:00.000Z" })] });
    const { board: r } = mergeBoards(local, remoto);
    assert.equal(r.tasks.length, 1);
  });

  test("foco do dia: dia só do remoto entra, dia em comum fica com o local", () => {
    const local = board({ dailyFocus: { "2026-09-05": ["t1"] } });
    const remoto = board({ dailyFocus: { "2026-09-05": ["t9"], "2026-09-04": ["t2"] } });
    const { board: r } = mergeBoards(local, remoto);
    assert.deepEqual(r.dailyFocus["2026-09-05"], ["t1"]);
    assert.deepEqual(r.dailyFocus["2026-09-04"], ["t2"]);
  });

  test("mesclar com nuvem vazia não muda nada nem quebra", () => {
    const local = board({ topics: [topic()], tasks: [task({})], schedule: [bloco("1")] });
    const { board: r } = mergeBoards(local, emptyBoard());
    assert.equal(r.topics.length, 1);
    assert.equal(r.tasks.length, 1);
    assert.equal(r.schedule.length, 1);
  });

  test("aparelho novo (local vazio) recebe tudo da nuvem", () => {
    const remoto = board({
      topics: [topic({ id: "a" })],
      tasks: [task({ id: "1", topicId: "a" })],
      schedule: [bloco("b1")],
    });
    const { board: r } = mergeBoards(emptyBoard(), remoto);
    assert.equal(r.topics.length, 1);
    assert.equal(r.tasks.length, 1);
    assert.equal(r.schedule.length, 1);
  });
});

test("parseValorComposto soma as partes escritas com rótulo", () => {
  const r = parseValorComposto("multimídia 1.200 + mão de obra 300");
  assert.deepEqual(r, { cents: 150000, parts: [120000, 30000] });
});

test("parseValorComposto entende o sufixo k", () => {
  assert.equal(parseValorComposto("1.2k")?.cents, 120000);
  assert.equal(parseValorComposto("multimídia 1.2k + 300")?.cents, 150000);
});

test("parseValorComposto continua lendo um preço simples", () => {
  assert.deepEqual(parseValorComposto("1.500,00"), { cents: 150000, parts: [150000] });
});

test("parseValorComposto devolve null quando não há número — vazio não é zero", () => {
  assert.equal(parseValorComposto(""), null);
  assert.equal(parseValorComposto("mão de obra"), null);
});

test("migração preserva o vínculo do bloco com projeto e tarefa", () => {
  const board = migrateBoard({
    topics: [{ id: "t1", name: "Mercado Livre", kind: "work", createdAt: "2026-01-01" }],
    tasks: [],
    schedule: [
      {
        id: "b1",
        date: "2026-09-05",
        title: "Chamar leads",
        plannedMinutes: 40,
        accumulatedMs: 0,
        order: 0,
        topicId: "t1",
        taskId: "k1",
      },
    ],
  });
  assert.equal(board.topics[0].kind, "work");
  assert.equal(board.schedule[0].topicId, "t1");
  assert.equal(board.schedule[0].taskId, "k1");
});

test("vertente desconhecida vira projeto em vez de quebrar", () => {
  const board = migrateBoard({
    topics: [{ id: "t1", name: "X", kind: "inventado", createdAt: "2026-01-01" }],
    tasks: [],
  });
  assert.equal(board.topics[0].kind, "project");
});

// ── Relatório ─────────────────────────────────────────────────────────────

function boardDeTeste(over: Partial<Board> = {}): Board {
  return { ...emptyBoard(), ...over };
}

function bloco(over: Partial<ScheduleBlock> & { id: string; date: string }): ScheduleBlock {
  return {
    title: "Bloco",
    plannedMinutes: 30,
    accumulatedMs: 0,
    order: 0,
    ...over,
  };
}

test("relatório separa tempo de trabalho do tempo de intervalo", () => {
  const board = boardDeTeste({
    schedule: [
      bloco({ id: "a", date: "2026-09-06", accumulatedMs: 30 * 60_000 }),
      bloco({ id: "b", date: "2026-09-06", accumulatedMs: 10 * 60_000, isBreak: true }),
    ],
  });
  const r = montarRelatorio(board, "2026-09-06", "2026-09-06");
  assert.equal(r.totalTrabalhadoMs, 30 * 60_000);
  assert.equal(r.totalIntervaloMs, 10 * 60_000);
  // Intervalo não pode entrar na contagem de blocos de trabalho.
  assert.equal(r.blocosTotal, 1);
});

test("duas tarefas em paralelo dobram o trabalhado (de propósito) mas não o relógio do dia", () => {
  const board = boardDeTeste({
    schedule: [
      bloco({ id: "a", date: "2026-09-06", accumulatedMs: 3 * 60 * 60_000 }),
      bloco({ id: "b", date: "2026-09-06", accumulatedMs: 3 * 60 * 60_000 }),
    ],
  });
  const r = montarRelatorio(board, "2026-09-06", "2026-09-06");
  // Soma continua contando em dobro — é "tempo dedicado", intencional.
  assert.equal(r.totalTrabalhadoMs, 6 * 60 * 60_000);
  // Sem `sessions` (blocos "antigos") cada um vira uma aproximação isolada;
  // o que importa aqui é que o relógio NUNCA passa da soma das durações.
  assert.ok(r.totalRelogioMs <= r.totalTrabalhadoMs);
});

test("bloco concluído depois da meia-noite aparece como virada de dia", () => {
  const board = boardDeTeste({
    schedule: [
      bloco({
        id: "a",
        date: "2026-09-06",
        title: "Gravar aula",
        accumulatedMs: 40 * 60_000,
        // 00:20 do dia 07, no horário de Brasília.
        completedAt: "2026-09-07T03:20:00.000Z",
      }),
    ],
  });
  const r = montarRelatorio(board, "2026-09-06", "2026-09-07");
  assert.equal(r.viradas.length, 1);
  assert.equal(r.viradas[0].diaDoBloco, "2026-09-06");
  assert.equal(r.viradas[0].diaDaConclusao, "2026-09-07");
  // O tempo continua contando no dia em que o bloco foi planejado.
  assert.equal(r.dias[0].elapsedMs, 40 * 60_000);
  assert.equal(r.dias[1].elapsedMs, 0);
});

test("bloco concluído no mesmo dia não vira virada", () => {
  const board = boardDeTeste({
    schedule: [
      bloco({ id: "a", date: "2026-09-06", completedAt: "2026-09-06T18:00:00.000Z" }),
    ],
  });
  assert.equal(montarRelatorio(board, "2026-09-06", "2026-09-06").viradas.length, 0);
});

test("tarefa é contada no dia local em que foi concluída, não em UTC", () => {
  const board = boardDeTeste({
    topics: [{ id: "t1", name: "P", color: "#000", createdAt: "2026-09-01" }],
    tasks: [
      {
        id: "k1",
        topicId: "t1",
        title: "X",
        description: "",
        status: "done",
        priority: "medium",
        tags: [],
        checklist: [],
        createdAt: "2026-09-06T10:00:00.000Z",
        updatedAt: "2026-09-06T10:00:00.000Z",
        // 21h do dia 06 em Brasília — em UTC já é dia 07.
        completedAt: "2026-09-07T00:00:00.000Z",
      },
    ],
  });
  const r = montarRelatorio(board, "2026-09-06", "2026-09-07");
  assert.equal(r.dias[0].tarefasConcluidas, 1);
  assert.equal(r.dias[1].tarefasConcluidas, 0);
});

test("relatório com intervalo de datas invertido não trava", () => {
  const r = montarRelatorio(boardDeTeste(), "2026-09-10", "2026-09-01");
  assert.equal(r.dias.length, 0);
  assert.equal(r.melhorDia, null);
});

test("ordenarParaExibicao joga os concluídos pro fim mantendo a ordem do plano", () => {
  const blocos = [
    bloco({ id: "a", date: "d", order: 0, completedAt: "2026-09-06T12:00:00.000Z" }),
    bloco({ id: "b", date: "d", order: 1 }),
    bloco({ id: "c", date: "d", order: 2, completedAt: "2026-09-06T11:00:00.000Z" }),
    bloco({ id: "d", date: "d", order: 3 }),
  ];
  assert.deepEqual(
    ordenarParaExibicao(blocos).map((b) => b.id),
    ["b", "d", "a", "c"]
  );
});

test("extendBlock estica o planejado e nunca deixa zerar", () => {
  const b = bloco({ id: "a", date: "d", plannedMinutes: 10 });
  assert.equal(extendBlock(b, 5).plannedMinutes, 15);
  assert.equal(extendBlock(b, -100).plannedMinutes, 1);
});

test("scheduleTotals lista todos os cronômetros em andamento", () => {
  const T0 = new Date("2026-09-06T10:00:00.000Z").getTime();
  const a = { ...bloco({ id: "a", date: "d" }), startedAt: new Date(T0 - 60_000).toISOString() };
  const b = { ...bloco({ id: "b", date: "d" }), startedAt: new Date(T0 - 30_000).toISOString() };
  const t = scheduleTotals([a, b, bloco({ id: "c", date: "d" })], T0);
  assert.deepEqual(t.runningIds, ["a", "b"]);
  assert.equal(t.runningId, "a");
  // Dois relógios somam: 60s + 30s. É proposital — o total vira "tempo
  // dedicado", não "tempo de relógio" — e a tela avisa quando acontece.
  assert.equal(t.elapsedMs, 90_000);
});

test("migração assume um cronômetro por vez em board antigo", () => {
  const board = migrateBoard({ topics: [], tasks: [] });
  assert.equal(board.settings.parallelTimers, false);
});

test("migração preserva a preferência de cronômetros paralelos", () => {
  const board = migrateBoard({ topics: [], tasks: [], settings: { parallelTimers: true } });
  assert.equal(board.settings.parallelTimers, true);
});

test("mergeBoards mantém a preferência do aparelho local", () => {
  const local = { ...emptyBoard(), settings: { parallelTimers: true } };
  const remote = { ...emptyBoard(), settings: { parallelTimers: false } };
  assert.equal(mergeBoards(local, remote).board.settings.parallelTimers, true);
});

test("skipBlock encerra sem virar produtividade e congela o tempo", () => {
  const inicio = new Date("2026-09-06T10:00:00.000Z").toISOString();
  const b = { ...bloco({ id: "a", date: "2026-09-06" }), startedAt: inicio, accumulatedMs: 0 };
  const s = skipBlock(b, "2026-09-06T10:05:00.000Z");
  assert.equal(s.skippedAt, "2026-09-06T10:05:00.000Z");
  assert.equal(s.completedAt, undefined);
  assert.equal(s.startedAt, undefined);
  // O tempo gasto tentando é real e continua valendo.
  assert.equal(s.accumulatedMs, 5 * 60_000);
  assert.equal(isRunning(s), false);
  assert.equal(isFinished(s), true);
});

test("um bloco nunca fica concluído e não feito ao mesmo tempo", () => {
  const b = bloco({ id: "a", date: "d", skippedAt: "2026-09-06T10:00:00.000Z" });
  assert.equal(completeBlock(b, "2026-09-06T11:00:00.000Z").skippedAt, undefined);
  const feito = bloco({ id: "b", date: "d", completedAt: "2026-09-06T10:00:00.000Z" });
  assert.equal(skipBlock(feito, "2026-09-06T11:00:00.000Z").completedAt, undefined);
});

test("reabrir limpa os dois desfechos", () => {
  const b = bloco({ id: "a", date: "d", skippedAt: "2026-09-06T10:00:00.000Z" });
  const r = reopenBlock(b);
  assert.equal(r.skippedAt, undefined);
  assert.equal(r.completedAt, undefined);
  assert.equal(isFinished(r), false);
});

test("não feito também vai pro fim da lista do dia", () => {
  const blocos = [
    bloco({ id: "a", date: "d", order: 0, skippedAt: "2026-09-06T10:00:00.000Z" }),
    bloco({ id: "b", date: "d", order: 1 }),
  ];
  assert.deepEqual(ordenarParaExibicao(blocos).map((x) => x.id), ["b", "a"]);
});

test("relatório separa 'não fiz' de 'concluído'", () => {
  const board = { ...emptyBoard(), schedule: [
    bloco({ id: "a", date: "2026-09-06", completedAt: "2026-09-06T12:00:00.000Z" }),
    bloco({ id: "b", date: "2026-09-06", skippedAt: "2026-09-06T23:00:00.000Z" }),
  ]};
  const r = montarRelatorio(board, "2026-09-06", "2026-09-06");
  assert.equal(r.blocosFeitos, 1);
  assert.equal(r.blocosNaoFeitos, 1);
  assert.equal(r.blocosTotal, 2);
  // "Não fiz" não é conclusão: não pode entrar na seção de virada de dia.
  assert.equal(r.viradas.length, 0);
});

// ── Comando de voz ────────────────────────────────────────────────────────

test("entende o comando ditado do exemplo", () => {
  assert.deepEqual(interpretarComandoDeVoz("Tarefa Chamar Leads por 40 minutos"), {
    titulo: "Chamar Leads",
    minutos: 40,
  });
});

test("aceita as formas que uma pessoa fala de verdade", () => {
  const casos: [string, string, number | undefined][] = [
    ["chamar leads 30 min", "Chamar leads", 30],
    ["nova tarefa gravar aula de 1 hora", "Gravar aula", 60],
    ["criar tarefa revisar contrato durante 20 minutos", "Revisar contrato", 20],
    ["tarefa alinhamento por 2 horas", "Alinhamento", 120],
    ["responder e-mails por quinze minutos", "Responder e-mails", 15],
    ["tarefa reunião de meia hora", "Reunião", 30],
  ];
  for (const [fala, titulo, minutos] of casos) {
    assert.deepEqual(interpretarComandoDeVoz(fala), { titulo, minutos }, fala);
  }
});

test("sem duração ditada, devolve só o título", () => {
  assert.deepEqual(interpretarComandoDeVoz("tarefa atender a pronix"), {
    titulo: "Atender a pronix",
  });
});

test("acento no título não desalinha o corte da duração", () => {
  // O corte usa índices achados no texto sem acento; se o tamanho mudasse,
  // o título sairia picotado.
  assert.deepEqual(interpretarComandoDeVoz("tarefa negociação com João por 25 minutos"), {
    titulo: "Negociação com João",
    minutos: 25,
  });
});

test("duração no meio da frase não deixa preposição sobrando", () => {
  assert.deepEqual(interpretarComandoDeVoz("Chamar leads por 40 minutos"), {
    titulo: "Chamar leads",
    minutos: 40,
  });
});

test("fala sem título nenhum é recusada em vez de virar tarefa vazia", () => {
  assert.equal(interpretarComandoDeVoz(""), null);
  assert.equal(interpretarComandoDeVoz("   "), null);
  assert.equal(interpretarComandoDeVoz("tarefa"), null);
  assert.equal(interpretarComandoDeVoz("tarefa de 40 minutos"), null);
});

test("número dentro do nome não é confundido com duração", () => {
  assert.deepEqual(interpretarComandoDeVoz("tarefa revisar módulo 3"), {
    titulo: "Revisar módulo 3",
  });
});

test("bloco sem tempo combinado não tem meta nem estouro", () => {
  const livre = { ...bloco({ id: "a", date: "d", plannedMinutes: 30 }), openEnded: true,
    accumulatedMs: 90 * 60_000 };
  // Nada foi combinado: não entra como tempo planejado no relatório...
  assert.equal(plannedMs(livre), 0);
  // ...e correr 90 min não é "passou do tempo".
  assert.equal(isOvertime(livre, 0), false);
  assert.equal(progressPercent(livre, 0), 0);
  // O tempo gasto continua valendo normalmente.
  assert.equal(elapsedMs(livre, 0), 90 * 60_000);
});

test("completedBlockData registra o que já foi feito, sem cronômetro", () => {
  const d = completedBlockData(40, "2026-09-06T18:00:00.000Z");
  assert.equal(d.plannedMinutes, 40);
  assert.equal(d.accumulatedMs, 40 * 60_000);
  assert.equal(d.completedAt, "2026-09-06T18:00:00.000Z");
  // Registrar depois nunca cria bloco de duração zero.
  assert.equal(completedBlockData(0, "2026-09-06T18:00:00.000Z").plannedMinutes, 1);
});

test("relatório ignora tempo planejado de bloco livre mas conta o trabalhado", () => {
  const board = { ...emptyBoard(), schedule: [
    { ...bloco({ id: "a", date: "2026-09-06", plannedMinutes: 30 }), openEnded: true,
      accumulatedMs: 2 * 60 * 60_000, completedAt: "2026-09-06T20:00:00.000Z" },
  ]};
  const r = montarRelatorio(board, "2026-09-06", "2026-09-06");
  assert.equal(r.totalPlanejadoMs, 0);
  assert.equal(r.totalTrabalhadoMs, 2 * 60 * 60_000);
  assert.equal(r.blocosFeitos, 1);
});

test("tempoPorProjeto soma por projeto, do maior pro menor", () => {
  const board = { ...emptyBoard(), schedule: [
    bloco({ id: "a", date: "2026-09-01", topicId: "t1", accumulatedMs: 60 * 60_000 }),
    bloco({ id: "b", date: "2026-09-02", topicId: "t2", accumulatedMs: 30 * 60_000 }),
    bloco({ id: "c", date: "2026-09-03", topicId: "t1", accumulatedMs: 90 * 60_000 }),
  ]};
  assert.deepEqual(tempoPorProjeto(board, "2026-09-01", "2026-09-07"), [
    { topicId: "t1", elapsedMs: 150 * 60_000 },
    { topicId: "t2", elapsedMs: 30 * 60_000 },
  ]);
});

test("tempoPorProjeto mantém o tempo sem projeto e ignora intervalo", () => {
  const board = { ...emptyBoard(), schedule: [
    bloco({ id: "a", date: "2026-09-01", topicId: "t1", accumulatedMs: 60 * 60_000 }),
    bloco({ id: "b", date: "2026-09-01", accumulatedMs: 20 * 60_000 }),
    bloco({ id: "c", date: "2026-09-01", accumulatedMs: 15 * 60_000, isBreak: true }),
  ]};
  const fatias = tempoPorProjeto(board, "2026-09-01", "2026-09-07");
  assert.deepEqual(fatias, [
    { topicId: "t1", elapsedMs: 60 * 60_000 },
    { topicId: null, elapsedMs: 20 * 60_000 },
  ]);
  // A soma das fatias tem que fechar com o total trabalhado do relatório.
  const total = montarRelatorio(board, "2026-09-01", "2026-09-07").totalTrabalhadoMs;
  assert.equal(fatias.reduce((a, f) => a + f.elapsedMs, 0), total);
});

test("tempoPorProjeto ignora dias fora do período", () => {
  const board = { ...emptyBoard(), schedule: [
    bloco({ id: "a", date: "2026-08-31", topicId: "t1", accumulatedMs: 60 * 60_000 }),
    bloco({ id: "b", date: "2026-09-08", topicId: "t1", accumulatedMs: 60 * 60_000 }),
  ]};
  assert.deepEqual(tempoPorProjeto(board, "2026-09-01", "2026-09-07"), []);
});

// ── Tarefa em mais de um projeto ──────────────────────────────────────────

function tarefa(over: Partial<Task> & { id: string; topicId: string }): Task {
  return {
    title: "T",
    description: "",
    status: "todo",
    priority: "medium",
    tags: [],
    checklist: [],
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...over,
  };
}

test("tarefa pertence ao projeto principal e aos extras", () => {
  const t = tarefa({ id: "k1", topicId: "a", extraTopicIds: ["b"] });
  assert.equal(taskBelongsToTopic(t, "a"), true);
  assert.equal(taskBelongsToTopic(t, "b"), true);
  assert.equal(taskBelongsToTopic(t, "c"), false);
  // Tarefa antiga, sem o campo, continua funcionando.
  assert.equal(taskBelongsToTopic(tarefa({ id: "k2", topicId: "a" }), "a"), true);
});

test("filtro por projeto encontra a tarefa pelo extra", () => {
  const lista = [
    tarefa({ id: "k1", topicId: "a", extraTopicIds: ["b"] }),
    tarefa({ id: "k2", topicId: "b" }),
    tarefa({ id: "k3", topicId: "c" }),
  ];
  assert.deepEqual(filterTasks(lista, { topicId: "b" }).map((t) => t.id), ["k1", "k2"]);
});

test("progresso do projeto conta as tarefas que vieram por extra", () => {
  const lista = [
    tarefa({ id: "k1", topicId: "a", extraTopicIds: ["b"], status: "done" }),
    tarefa({ id: "k2", topicId: "b" }),
  ];
  const p = calculateTopicProgress(lista, "b", "2026-09-10");
  assert.equal(p.total, 2);
  assert.equal(p.done, 1);
});

test("migração ignora extra repetido e o próprio projeto principal", () => {
  const board = migrateBoard({
    topics: [{ id: "a", name: "A", createdAt: "2026-09-01" }],
    tasks: [
      {
        id: "k1",
        topicId: "a",
        title: "T",
        // "a" é o principal e não pode virar extra; "b" repetido não pode
        // duplicar; 7 não é id de nada.
        extraTopicIds: ["a", "b", "b", 7],
        createdAt: "2026-09-01T10:00:00.000Z",
        updatedAt: "2026-09-01T10:00:00.000Z",
      },
    ],
  });
  assert.deepEqual(board.tasks[0].extraTopicIds, ["b"]);
});

test("dinheiro da lista de desejos NÃO soma nos projetos extras", () => {
  const lista = [
    tarefa({ id: "w1", topicId: "compras", extraTopicIds: ["casa"], priceCents: 50000 }),
  ];
  assert.equal(wishlistTotals(lista, "compras").wantedCents, 50000);
  // Se contasse aqui também, o total diria que se quer gastar o dobro.
  assert.equal(wishlistTotals(lista, "casa").wantedCents, 0);
});

// ── Pra depois (bloco em espera) ─────────────────────────────────────────

test("guardar pra depois congela o tempo e tira o bloco da frente", () => {
  const b = {
    ...bloco({ id: "a", date: "2026-09-09", plannedMinutes: 60 }),
    startedAt: "2026-09-09T12:00:00.000Z",
  };
  const p = parkBlock(b, "2026-09-09T12:20:00.000Z");
  assert.equal(p.accumulatedMs, 20 * 60_000);
  assert.equal(p.startedAt, undefined);
  assert.equal(isFinished(p), true);
  assert.equal(isParked(p), true);
  // Não é conclusão nem "não fiz".
  assert.equal(p.completedAt, undefined);
  assert.equal(p.skippedAt, undefined);
});

test("retomar no mesmo dia só reabre, sem criar bloco novo", () => {
  const p = { ...bloco({ id: "a", date: "2026-09-10" }), parkedAt: "2026-09-10T12:00:00.000Z" };
  const { antigo, novo } = retomarBloco(p, "2026-09-10", "2026-09-10T15:00:00.000Z", "n", 3);
  assert.equal(novo, null);
  assert.equal(antigo.parkedAt, undefined);
  assert.equal(isFinished(antigo), false);
});

test("retomar em outro dia deixa o tempo no dia antigo e cria continuação hoje", () => {
  const p = {
    ...bloco({ id: "a", date: "2026-09-09", plannedMinutes: 60, topicId: "t1", taskId: "k1" }),
    accumulatedMs: 20 * 60_000,
    parkedAt: "2026-09-09T13:00:00.000Z",
  };
  const { antigo, novo } = retomarBloco(p, "2026-09-10", "2026-09-10T09:00:00.000Z", "n1", 2);
  // O antigo não muda de dia nem perde os 20 minutos de ontem.
  assert.equal(antigo.date, "2026-09-09");
  assert.equal(antigo.accumulatedMs, 20 * 60_000);
  assert.equal(antigo.resumedAt, "2026-09-10T09:00:00.000Z");
  assert.equal(isParked(antigo), false);
  // O novo começa do zero, hoje, com o que faltava e o mesmo vínculo.
  assert.ok(novo);
  assert.equal(novo!.date, "2026-09-10");
  assert.equal(novo!.accumulatedMs, 0);
  assert.equal(novo!.plannedMinutes, 40);
  assert.equal(novo!.taskId, "k1");
  assert.equal(novo!.continuaDe, "a");
});

test("retomar em outro dia preserva a meta e a marca de intervalo", () => {
  const p = {
    ...bloco({ id: "a", date: "2026-09-09", plannedMinutes: 60 }),
    accumulatedMs: 20 * 60_000,
    parkedAt: "2026-09-09T13:00:00.000Z",
    metaIds: ["m1"],
    isBreak: true,
  };
  const { novo } = retomarBloco(p, "2026-09-10", "2026-09-10T09:00:00.000Z", "n1", 0);
  assert.deepEqual(novo!.metaIds, ["m1"]);
  assert.equal(novo!.isBreak, true);
});

test("retomar não copia o vínculo de programação — a continuação é manual", () => {
  const p = {
    ...bloco({ id: "a", date: "2026-09-09", plannedMinutes: 60 }),
    accumulatedMs: 20 * 60_000,
    parkedAt: "2026-09-09T13:00:00.000Z",
    programacaoId: "prog-1",
  };
  const { novo } = retomarBloco(p, "2026-09-10", "2026-09-10T09:00:00.000Z", "n1", 0);
  assert.equal(novo!.programacaoId, undefined);
});

test("retomar bloco que já tinha estourado volta com o planejado original", () => {
  const p = {
    ...bloco({ id: "a", date: "2026-09-09", plannedMinutes: 30 }),
    accumulatedMs: 45 * 60_000,
    parkedAt: "2026-09-09T13:00:00.000Z",
  };
  const { novo } = retomarBloco(p, "2026-09-10", "2026-09-10T09:00:00.000Z", "n", 0);
  assert.equal(novo!.plannedMinutes, 30);
});

test("reabrir limpa também a espera", () => {
  const p = { ...bloco({ id: "a", date: "d" }), parkedAt: "2026-09-09T13:00:00.000Z" };
  const r = reopenBlock(p);
  assert.equal(r.parkedAt, undefined);
  assert.equal(isFinished(r), false);
});

test("migração preserva a espera do bloco", () => {
  const board = migrateBoard({
    topics: [],
    tasks: [],
    schedule: [
      {
        id: "a", date: "2026-09-09", title: "X", plannedMinutes: 30, accumulatedMs: 0, order: 0,
        parkedAt: "2026-09-09T13:00:00.000Z", resumedAt: "2026-09-10T09:00:00.000Z", continuaDe: "z",
      },
    ],
  });
  assert.equal(board.schedule[0].parkedAt, "2026-09-09T13:00:00.000Z");
  assert.equal(board.schedule[0].resumedAt, "2026-09-10T09:00:00.000Z");
  assert.equal(board.schedule[0].continuaDe, "z");
});

// ── Metas ─────────────────────────────────────────────────────────────────

function metaDeTeste(over: Partial<Parameters<typeof novaMeta>[0]> = {}) {
  return novaMeta(
    { title: "Ler", unit: "páginas", dailyTarget: 2, startDate: "2026-09-01", days: 30, ...over },
    "m1",
    "2026-09-01T10:00:00.000Z"
  );
}

test("meta nova nasce sem registros e com alvo e duração válidos", () => {
  const m = novaMeta(
    { title: "  Ler ", unit: " páginas ", dailyTarget: 0, startDate: "2026-09-01", days: 0 },
    "m", "2026-09-01T10:00:00.000Z"
  );
  assert.equal(m.title, "Ler");
  assert.equal(m.unit, "páginas");
  // Alvo zero faria todo dia contar como batido sem fazer nada.
  assert.equal(m.dailyTarget, 1);
  assert.equal(m.days, 1);
  assert.deepEqual(m.registros, {});
});

test("progresso conta dias batidos, total e em que dia estamos", () => {
  let m = metaDeTeste();
  m = registrarNaMeta(m, "2026-09-01", 2);
  m = registrarNaMeta(m, "2026-09-02", 5);
  m = registrarNaMeta(m, "2026-09-03", 1); // não bateu
  const p = progressoDaMeta(m, "2026-09-04");
  assert.equal(p.diaAtual, 4);
  assert.equal(p.diasPassados, 4);
  assert.equal(p.diasBatidos, 2);
  assert.equal(p.totalFeito, 8);
  assert.equal(p.terminou, false);
});

test("hoje ainda não batido não quebra a sequência; ontem sem bater quebra", () => {
  let m = metaDeTeste();
  for (const d of ["2026-09-01", "2026-09-02", "2026-09-03"]) m = registrarNaMeta(m, d, 2);
  // Dia 04 é hoje e ainda não leu: a sequência de 3 continua de pé.
  assert.equal(progressoDaMeta(m, "2026-09-04").sequencia, 3);
  // Chegou o dia 05 sem ter lido no 04: aí sim quebrou.
  assert.equal(progressoDaMeta(m, "2026-09-05").sequencia, 0);
});

test("registro nunca fica negativo e ignora dia fora da meta", () => {
  let m = metaDeTeste();
  m = registrarNaMeta(m, "2026-09-02", 1);
  m = registrarNaMeta(m, "2026-09-02", -5);
  assert.equal(m.registros["2026-09-02"], undefined);
  const antes = registrarNaMeta(m, "2026-08-31", 3);
  assert.deepEqual(antes.registros, {});
  const depois = registrarNaMeta(m, "2026-10-01", 3);
  assert.deepEqual(depois.registros, {});
});

test("marcar como batido não rebaixa o que já foi anotado", () => {
  let m = metaDeTeste();
  m = registrarNaMeta(m, "2026-09-02", 10);
  assert.equal(marcarDiaBatido(m, "2026-09-02").registros["2026-09-02"], 10);
  assert.equal(marcarDiaBatido(m, "2026-09-03").registros["2026-09-03"], 2);
});

test("concluir tarefa ligada marca o dia na meta, e só nas metas dela", () => {
  const board = {
    ...emptyBoard(),
    metas: [metaDeTeste(), { ...metaDeTeste(), id: "m2" }],
    tasks: [tarefa({ id: "k1", topicId: "a", metaIds: ["m1"] })],
  };
  const depois = aplicarConclusaoNasMetas(board, ["k1"], "2026-09-05");
  assert.equal(depois.metas.find((m) => m.id === "m1")!.registros["2026-09-05"], 2);
  assert.deepEqual(depois.metas.find((m) => m.id === "m2")!.registros, {});
});

test("sincronizar une os registros da mesma meta pelo maior valor do dia", () => {
  const local = { ...emptyBoard(), metas: [{ ...metaDeTeste(), registros: { "2026-09-01": 2, "2026-09-02": 1 } }] };
  const remote = { ...emptyBoard(), metas: [{ ...metaDeTeste(), registros: { "2026-09-02": 4, "2026-09-03": 2 } }] };
  const unida = mergeBoards(local, remote).board.metas[0];
  // Nem perde o que foi anotado no outro aparelho, nem soma em dobro.
  assert.deepEqual(unida.registros, { "2026-09-01": 2, "2026-09-02": 4, "2026-09-03": 2 });
});

test("migração cria lista de metas vazia em quadro antigo e limpa lixo", () => {
  assert.deepEqual(migrateBoard({ topics: [], tasks: [] }).metas, []);
  const b = migrateBoard({
    topics: [], tasks: [],
    metas: [
      { id: "m", title: "Ler", unit: "pág", dailyTarget: "2", startDate: "2026-09-01", days: 30,
        registros: { "2026-09-01": 2, "2026-09-02": "x", "2026-09-03": -1, "2026-09-04": NaN } },
      { id: "sem-titulo", startDate: "2026-09-01" },
    ],
  });
  assert.equal(b.metas.length, 1);
  assert.equal(b.metas[0].dailyTarget, 1);
  assert.deepEqual(b.metas[0].registros, { "2026-09-01": 2 });
});

// ── Programação (bloco que se repete sozinho) ─────────────────────────────
// 2026-09-10 é quinta; 2026-09-12 é sábado. Horários sem "Z" são locais
// (o fuso dos testes é fixo em America/Sao_Paulo).

function progDeTeste(over: Partial<Parameters<typeof novaProgramacao>[0]> = {}, createdAt = "2026-09-01T09:00:00.000Z") {
  return novaProgramacao(
    { title: "SDR", weekdays: DIAS_UTEIS, startTime: "08:00", endTime: "18:00", autoStart: true, ...over },
    "p1",
    createdAt
  );
}
const local = (s: string) => new Date(s).getTime();
const quadroCom = (...programacoes: ReturnType<typeof novaProgramacao>[]) => ({ ...emptyBoard(), programacoes });

test("antes do horário o bloco nasce parado, com id previsível", () => {
  const { board } = materializarProgramacoes(quadroCom(progDeTeste()), "2026-09-10", local("2026-09-10T07:00:00"));
  assert.equal(board.schedule.length, 1);
  const b = board.schedule[0];
  assert.equal(b.id, "prog-p1-2026-09-10");
  assert.equal(b.plannedMinutes, 600);
  assert.equal(b.startedAt, undefined);
  assert.equal(b.programacaoId, "p1");
});

test("abrindo o app no meio do expediente, o bloco já roda desde o início", () => {
  const { board } = materializarProgramacoes(quadroCom(progDeTeste()), "2026-09-10", local("2026-09-10T09:30:00"));
  assert.equal(board.schedule[0].startedAt, new Date("2026-09-10T08:00:00").toISOString());
});

test("app fechado o dia todo: o expediente nasce fechado e completo", () => {
  const { board } = materializarProgramacoes(quadroCom(progDeTeste()), "2026-09-10", local("2026-09-10T19:00:00"));
  const b = board.schedule[0];
  assert.equal(b.accumulatedMs, 10 * 60 * 60_000);
  assert.equal(b.completedAt, new Date("2026-09-10T18:00:00").toISOString());
});

test("materializar de novo sem mudar de fase devolve o MESMO quadro", () => {
  const primeira = materializarProgramacoes(quadroCom(progDeTeste()), "2026-09-10", local("2026-09-10T09:30:00"));
  const segunda = materializarProgramacoes(primeira.board, "2026-09-10", local("2026-09-10T09:31:00"));
  assert.equal(segunda.mudou, false);
  assert.equal(segunda.board, primeira.board);
});

test("bloco rodando fecha exatamente no fim, sem contar o que passou das 18h", () => {
  const rodando = materializarProgramacoes(quadroCom(progDeTeste()), "2026-09-10", local("2026-09-10T09:30:00")).board;
  const { board } = materializarProgramacoes(rodando, "2026-09-10", local("2026-09-10T18:40:00"));
  const b = board.schedule[0];
  assert.equal(b.accumulatedMs, 10 * 60 * 60_000);
  assert.equal(b.startedAt, undefined);
  assert.ok(b.completedAt);
});

test("hora extra retomada depois do fim não é encerrada pelo app", () => {
  const board = quadroCom(progDeTeste());
  board.schedule = [{
    id: idDoBlocoProgramado("p1", "2026-09-10"), date: "2026-09-10", title: "SDR", plannedMinutes: 600,
    accumulatedMs: 10 * 60 * 60_000, order: 0, programacaoId: "p1",
    startedAt: new Date("2026-09-10T18:30:00").toISOString(),
  }];
  const r = materializarProgramacoes(board, "2026-09-10", local("2026-09-10T19:00:00"));
  assert.equal(r.mudou, false);
});

test("bloco pausado pela pessoa não é religado sozinho", () => {
  const board = quadroCom(progDeTeste());
  board.schedule = [{
    id: idDoBlocoProgramado("p1", "2026-09-10"), date: "2026-09-10", title: "SDR", plannedMinutes: 600,
    accumulatedMs: 2 * 60 * 60_000, order: 0, programacaoId: "p1",
  }];
  assert.equal(materializarProgramacoes(board, "2026-09-10", local("2026-09-10T11:00:00")).mudou, false);
});

test("fim de semana, programação pausada e dia pulado não geram bloco", () => {
  const hora = local("2026-09-12T09:00:00");
  assert.equal(materializarProgramacoes(quadroCom(progDeTeste()), "2026-09-12", hora).board.schedule.length, 0);
  const pausada = { ...progDeTeste(), pausedAt: "2026-09-09T10:00:00.000Z" };
  assert.equal(materializarProgramacoes(quadroCom(pausada), "2026-09-10", local("2026-09-10T09:00:00")).board.schedule.length, 0);
  const pulada = { ...progDeTeste(), diasPulados: ["2026-09-10"] };
  assert.equal(materializarProgramacoes(quadroCom(pulada), "2026-09-10", local("2026-09-10T09:00:00")).board.schedule.length, 0);
});

test("no dia em que foi criada, o relógio começa na criação e não às 8h", () => {
  // Criada às 10h do dia 10 (13h em UTC).
  const p = progDeTeste({}, "2026-09-10T13:00:00.000Z");
  const { board } = materializarProgramacoes(quadroCom(p), "2026-09-10", local("2026-09-10T11:00:00"));
  assert.equal(board.schedule[0].startedAt, new Date("2026-09-10T10:00:00").toISOString());
});

test("dois aparelhos gerando o mesmo expediente viram um bloco só na sincronização", () => {
  const hora = local("2026-09-10T09:30:00");
  const pc = materializarProgramacoes(quadroCom(progDeTeste()), "2026-09-10", hora).board;
  const cel = materializarProgramacoes(quadroCom(progDeTeste()), "2026-09-10", hora).board;
  assert.equal(mergeBoards(pc, cel).board.schedule.length, 1);
});

test("sincronizar une os dias pulados da mesma programação", () => {
  const pc = quadroCom({ ...progDeTeste(), diasPulados: ["2026-09-07"] });
  const cel = quadroCom({ ...progDeTeste(), diasPulados: ["2026-09-10"] });
  assert.deepEqual(
    [...mergeBoards(pc, cel).board.programacoes[0].diasPulados!].sort(),
    ["2026-09-07", "2026-09-10"]
  );
});

test("migração descarta programação sem dia válido e preserva o vínculo do bloco", () => {
  const b = migrateBoard({
    topics: [], tasks: [],
    programacoes: [
      { id: "a", title: "SDR", startTime: "08:00", endTime: "18:00", weekdays: [1, 1, 9, "x", 5] },
      { id: "b", title: "Nada", startTime: "08:00", endTime: "18:00", weekdays: [] },
    ],
    schedule: [{ id: "prog-a-2026-09-10", date: "2026-09-10", title: "SDR", plannedMinutes: 600, accumulatedMs: 0, order: 0, programacaoId: "a" }],
  });
  assert.equal(b.programacoes.length, 1);
  assert.deepEqual(b.programacoes[0].weekdays, [1, 5]);
  assert.equal(b.programacoes[0].autoStart, true);
  assert.equal(b.schedule[0].programacaoId, "a");
});

test("descreve os dias e recusa programação que termina antes de começar", () => {
  assert.equal(descreverDias([5, 4, 3, 2, 1]), "Seg a Sex");
  assert.equal(descreverDias([0, 1, 2, 3, 4, 5, 6]), "Todo dia");
  assert.equal(descreverDias([6, 0]), "Fim de semana");
  assert.equal(descreverDias([1, 3]), "Seg, Qua");
  const base = { title: "SDR", weekdays: DIAS_UTEIS, autoStart: true };
  assert.equal(problemaDaProgramacao({ ...base, startTime: "18:00", endTime: "08:00" }), "O fim precisa vir depois do início.");
  assert.equal(problemaDaProgramacao({ ...base, startTime: "08:00", endTime: "18:00" }), null);
});

test("programação criada depois do fim do expediente não gera o bloco de hoje", () => {
  // Criada às 21h do dia 10 — que em UTC já é meia-noite do dia 11.
  const p = progDeTeste({}, "2026-09-11T00:00:00.000Z");
  const hoje = materializarProgramacoes(quadroCom(p), "2026-09-10", local("2026-09-10T21:30:00"));
  assert.equal(hoje.board.schedule.length, 0);
  assert.equal(hoje.mudou, false);
  // A partir do dia seguinte funciona normalmente.
  const amanha = materializarProgramacoes(quadroCom(p), "2026-09-11", local("2026-09-11T09:00:00"));
  assert.equal(amanha.board.schedule.length, 1);
  assert.ok(amanha.board.schedule[0].startedAt);
});

test("abrir dias depois fecha o expediente que ficou rodando, no horário certo daquele dia", () => {
  // progDeTeste roda seg-sex, 08h-18h; 2026-09-11 é sexta, 2026-09-14 é segunda.
  const p = progDeTeste();
  const board = quadroCom(p);
  board.schedule = [
    {
      id: idDoBlocoProgramado("p1", "2026-09-11"),
      date: "2026-09-11",
      title: "SDR",
      plannedMinutes: 600,
      accumulatedMs: 0,
      order: 0,
      programacaoId: "p1",
      startedAt: new Date("2026-09-11T08:00:00").toISOString(),
    },
  ];
  const r = materializarProgramacoes(board, "2026-09-14", local("2026-09-14T09:00:00"));
  const antigo = r.board.schedule.find((b) => b.date === "2026-09-11")!;
  assert.equal(antigo.accumulatedMs, 10 * 60 * 60_000);
  assert.equal(antigo.completedAt, new Date("2026-09-11T18:00:00").toISOString());
  assert.equal(antigo.startedAt, undefined);
  // Hoje (segunda) continua sendo materializado normalmente, sem ficar
  // travado por causa da sexta que precisou ser fechada primeiro.
  assert.ok(r.board.schedule.some((b) => b.date === "2026-09-14"));
});

test("bloco antigo de programação já apagada fecha mesmo assim, no instante em que o app percebe", () => {
  const board = { ...emptyBoard(), programacoes: [] };
  board.schedule = [
    {
      id: "prog-sumida-2026-09-11",
      date: "2026-09-11",
      title: "SDR",
      plannedMinutes: 600,
      accumulatedMs: 0,
      order: 0,
      programacaoId: "prog-sumida",
      startedAt: new Date("2026-09-11T08:00:00").toISOString(),
    },
  ];
  const agora = local("2026-09-14T09:00:00");
  const r = materializarProgramacoes(board, "2026-09-14", agora);
  assert.equal(r.mudou, true);
  assert.equal(r.board.schedule[0].completedAt, new Date(agora).toISOString());
});

// ── Metas no bloco do cronograma ─────────────────────────────────────────

test("bloco concluído conta nas metas dele e nas da tarefa que carrega", () => {
  const board = {
    ...emptyBoard(),
    metas: [metaDeTeste(), { ...metaDeTeste(), id: "m2" }, { ...metaDeTeste(), id: "m3" }],
    tasks: [tarefa({ id: "k1", topicId: "a", metaIds: ["m2"] })],
  };
  // m2 aparece nas duas fontes: não pode contar em dobro.
  const bl = { ...bloco({ id: "b", date: "2026-09-05" }), taskId: "k1", metaIds: ["m1", "m2"] };
  const d = aplicarMetasDoBloco(board, bl, "2026-09-05");
  assert.equal(d.metas.find((m) => m.id === "m1")!.registros["2026-09-05"], 2);
  assert.equal(d.metas.find((m) => m.id === "m2")!.registros["2026-09-05"], 2);
  assert.deepEqual(d.metas.find((m) => m.id === "m3")!.registros, {});
});

test("bloco sem projeto, e portanto sem tarefa, também conta pra meta", () => {
  const board = { ...emptyBoard(), metas: [metaDeTeste()] };
  const bl = { ...bloco({ id: "b", date: "2026-09-05" }), metaIds: ["m1"] };
  assert.equal(aplicarMetasDoBloco(board, bl, "2026-09-05").metas[0].registros["2026-09-05"], 2);
});

test("meta arquivada não é marcada por nenhum caminho", () => {
  const board = { ...emptyBoard(), metas: [{ ...metaDeTeste(), archivedAt: "2026-09-03T10:00:00.000Z" }] };
  assert.deepEqual(marcarMetas(board, ["m1"], "2026-09-05").metas[0].registros, {});
});

test("migração preserva as metas do bloco sem repetir nem aceitar lixo", () => {
  const b = migrateBoard({
    topics: [], tasks: [],
    schedule: [{ id: "a", date: "2026-09-05", title: "Ler", plannedMinutes: 20, accumulatedMs: 0, order: 0, metaIds: ["m1", "m1", 3] }],
  });
  assert.deepEqual(b.schedule[0].metaIds, ["m1"]);
});

// ── Conclusão de tarefa — mesma função em qualquer caminho ────────────────

test("concluir gera a próxima ocorrência de uma tarefa recorrente", () => {
  const board = {
    ...emptyBoard(),
    tasks: [tarefa({ id: "k1", topicId: "a", status: "doing", recurrence: { frequency: "daily" }, dueDate: "2026-09-05" })],
  };
  const d = concluirTarefaNoBoard(board, "k1", "2026-09-05T20:00:00.000Z", "2026-09-05", () => "k2");
  const original = d.tasks.find((t) => t.id === "k1")!;
  const proxima = d.tasks.find((t) => t.id === "k2");
  assert.equal(original.status, "done");
  assert.ok(original.completedAt);
  assert.equal(original.recurrenceSpawned, true);
  assert.ok(proxima);
  assert.equal(proxima!.status, "todo");
  assert.equal(proxima!.dueDate, "2026-09-06");
});

test("concluir marca as metas ligadas à tarefa", () => {
  const board = {
    ...emptyBoard(),
    metas: [metaDeTeste()],
    tasks: [tarefa({ id: "k1", topicId: "a", status: "doing", metaIds: ["m1"] })],
  };
  const d = concluirTarefaNoBoard(board, "k1", "2026-09-05T20:00:00.000Z", "2026-09-05", () => "novo");
  assert.equal(d.metas[0].registros["2026-09-05"], 2);
});

test("concluir uma tarefa já concluída não reprocessa (idempotente)", () => {
  const board = {
    ...emptyBoard(),
    tasks: [
      tarefa({
        id: "k1", topicId: "a", status: "done", completedAt: "2026-09-01T10:00:00.000Z",
        recurrence: { frequency: "daily" }, recurrenceSpawned: true,
      }),
    ],
  };
  const d = concluirTarefaNoBoard(board, "k1", "2026-09-05T20:00:00.000Z", "2026-09-05", () => "outra");
  assert.equal(d, board);
});

// ── Conclusão automática por tempo do projeto ─────────────────────────────
// "Pedido de agência não passa de 30 min — se chegou lá, esqueci de concluir."

function topicoComTeto(minutos?: number): Topic {
  return {
    id: "ag",
    name: "Agências",
    color: "#3D8BFF",
    autoCompleteMinutes: minutos,
    createdAt: "2026-09-01T10:00:00.000Z",
  };
}

test("bloco que passa do teto do projeto é concluído sozinho, com a tarefa e a meta junto", () => {
  // A meta conta no dia REAL da conclusão (mesma regra do "Concluir" manual),
  // não no dia nominal do bloco — por isso a janela cobre "hoje" de verdade.
  const hoje = todayISO();
  const inicioDoDia = new Date(`${hoje}T00:05:00`).toISOString();
  const board: Board = {
    ...emptyBoard(),
    topics: [topicoComTeto(30)],
    tasks: [tarefa({ id: "k1", topicId: "ag", status: "doing", metaIds: ["m1"] })],
    metas: [metaDeTeste({ startDate: addDaysISO(hoje, -1), days: 3 })],
    schedule: [
      { ...bloco({ id: "b", date: hoje }), topicId: "ag", taskId: "k1", startedAt: inicioDoDia },
    ],
  };
  const agora = new Date(inicioDoDia).getTime() + 31 * 60_000;
  const r = autoConcluirBlocos(board, agora);
  assert.equal(r.mudou, true);
  const b = r.board.schedule[0];
  assert.equal(isRunning(b), false);
  assert.ok(b.completedAt);
  assert.equal(r.board.tasks[0].status, "done");
  assert.equal(r.board.metas[0].registros[hoje], 2);
});

test("bloco ainda dentro do teto não é mexido", () => {
  const board: Board = {
    ...emptyBoard(),
    topics: [topicoComTeto(30)],
    schedule: [{ ...bloco({ id: "b", date: "2026-09-05" }), topicId: "ag", startedAt: "2026-09-05T10:00:00.000Z" }],
  };
  const agora = new Date("2026-09-05T10:20:00.000Z").getTime();
  const r = autoConcluirBlocos(board, agora);
  assert.equal(r.mudou, false);
  assert.equal(r.board, board);
});

test("sem teto configurado no projeto, nada é concluído sozinho", () => {
  const board: Board = {
    ...emptyBoard(),
    topics: [topicoComTeto(undefined)],
    schedule: [{ ...bloco({ id: "b", date: "2026-09-05" }), topicId: "ag", startedAt: "2026-09-05T10:00:00.000Z" }],
  };
  const agora = new Date("2026-09-05T12:00:00.000Z").getTime();
  assert.equal(autoConcluirBlocos(board, agora).mudou, false);
});

test("intervalo não conclui sozinho mesmo passando de qualquer teto", () => {
  const board: Board = {
    ...emptyBoard(),
    topics: [topicoComTeto(10)],
    schedule: [
      { ...bloco({ id: "b", date: "2026-09-05" }), topicId: "ag", isBreak: true, startedAt: "2026-09-05T10:00:00.000Z" },
    ],
  };
  const agora = new Date("2026-09-05T10:30:00.000Z").getTime();
  assert.equal(autoConcluirBlocos(board, agora).mudou, false);
});

// ── Grupos personalizáveis na barra lateral ───────────────────────────────

test("quadro de antes dos grupos nasce com as três seções que já existiam", () => {
  const b = migrateBoard({
    topics: [
      { id: "p", name: "Mentoria", kind: "project" },
      { id: "w", name: "Pronix", kind: "work" },
      { id: "d", name: "Casa nova", kind: "wishlist" },
    ],
    tasks: [],
  });
  assert.equal(b.groups.length, 3);
  const nomes = b.groups.map((g) => g.name).sort();
  assert.deepEqual(nomes, ["Conquistas pessoais", "Projetos", "Trabalho"]);
  const grupoDe = (topicId: string) =>
    b.groups.find((g) => g.id === b.topics.find((t) => t.id === topicId)!.groupId)?.name;
  assert.equal(grupoDe("p"), "Projetos");
  assert.equal(grupoDe("w"), "Trabalho");
  assert.equal(grupoDe("d"), "Conquistas pessoais");
});

test("só nasce seção pra vertente que estava realmente em uso", () => {
  const b = migrateBoard({ topics: [{ id: "p", name: "Mentoria", kind: "project" }], tasks: [] });
  assert.deepEqual(b.groups.map((g) => g.name), ["Projetos"]);
});

test("quadro sem tópico nenhum não inventa grupo", () => {
  assert.deepEqual(migrateBoard({ topics: [], tasks: [] }).groups, []);
});

test("apagar todos os grupos de propósito não os recria na próxima carga", () => {
  const b = migrateBoard({
    topics: [{ id: "p", name: "Mentoria", kind: "project" }],
    tasks: [],
    groups: [],
    settings: { groupsSeeded: true },
  });
  assert.deepEqual(b.groups, []);
  assert.equal(b.settings.groupsSeeded, true);
});

test("dailyFocus com valor que não é lista de ids é descartado, sem quebrar", () => {
  const b = migrateBoard({
    topics: [], tasks: [],
    dailyFocus: { "2026-09-12": 42, "2026-09-11": ["k1", 3, "k2"], "2026-09-10": "k1" },
  });
  assert.deepEqual(b.dailyFocus, { "2026-09-11": ["k1", "k2"] });
});

test("tópico já com grupo próprio não é reatribuído pela migração", () => {
  const b = migrateBoard({
    topics: [{ id: "p", name: "Mentoria", kind: "project", groupId: "meu-grupo" }],
    tasks: [],
    groups: [{ id: "meu-grupo", name: "Meus projetos" }],
  });
  assert.equal(b.topics[0].groupId, "meu-grupo");
  assert.deepEqual(b.groups.map((g) => g.name), ["Meus projetos"]);
});

describe("armazenamento local — corrupção não vira board vazio silenciosamente", () => {
  test("nada salvo ainda: vazio, sem confundir com corrompido", () => {
    const r = interpretarConteudoSalvo(null);
    assert.equal(r.status, "vazio");
  });

  test("JSON válido carrega normalmente", () => {
    const r = interpretarConteudoSalvo(JSON.stringify({ topics: [], tasks: [] }));
    assert.equal(r.status, "ok");
  });

  test("JSON ilegível preserva o texto bruto em vez de virar vazio silencioso", () => {
    const r = interpretarConteudoSalvo("{ isso não é json");
    assert.equal(r.status, "corrompido");
    assert.equal(r.status === "corrompido" && r.bruto, "{ isso não é json");
  });

  test("erro de cota do navegador é reconhecido pelo nome padrão", () => {
    const erro = new DOMException("mock", "QuotaExceededError");
    assert.equal(classificarErroDeGravacao(erro), "cota-excedida");
  });

  test("erro de cota do Firefox antigo (nome diferente) também é reconhecido", () => {
    const erro = new DOMException("mock", "NS_ERROR_DOM_QUOTA_REACHED");
    assert.equal(classificarErroDeGravacao(erro), "cota-excedida");
  });

  test("erro qualquer não vira cota por engano", () => {
    assert.equal(classificarErroDeGravacao(new Error("outra coisa")), "desconhecido");
  });
});

test("migração aceita o teto de auto-conclusão só quando é um número positivo", () => {
  const b = migrateBoard({
    topics: [
      { id: "a", name: "A", autoCompleteMinutes: 45 },
      { id: "b", name: "B", autoCompleteMinutes: -5 },
      { id: "c", name: "C", autoCompleteMinutes: "x" },
    ],
    tasks: [],
  });
  assert.equal(b.topics.find((t) => t.id === "a")!.autoCompleteMinutes, 45);
  assert.equal(b.topics.find((t) => t.id === "b")!.autoCompleteMinutes, undefined);
  assert.equal(b.topics.find((t) => t.id === "c")!.autoCompleteMinutes, undefined);
});
