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
import { montarRelatorio } from "./report";
import { extendBlock, isFinished, ordenarParaExibicao, skipBlock } from "./schedule";
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
import { validateBackup, mergeImportedData, mergeBoards } from "./task-backup";
import { calculateWeeklyMetrics } from "./weekly-review";
import { addDaysISO, startOfWeekISO, localDayOf, daysBetween } from "./date-utils";
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
