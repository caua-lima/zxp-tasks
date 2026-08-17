import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Task, Topic, emptyBoard } from "./types";
import { migrateBoard } from "./task-migrations";
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
import { validateBackup, mergeImportedData } from "./task-backup";
import { calculateWeeklyMetrics } from "./weekly-review";
import { addDaysISO, startOfWeekISO } from "./date-utils";

const HOJE = "2026-08-16";

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
