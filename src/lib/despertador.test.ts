// Horário de Brasília fixo: os testes de relógio local não podem depender da máquina.
process.env.TZ = "America/Sao_Paulo";

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Programacao } from "./types";
import { avisosDoMinuto, avisosRestantesDoDia, relogioNoFuso } from "./despertador";
import { migrateBoard } from "./task-migrations";

// 2026-09-10 é uma quinta-feira.
const prog = (over: Partial<Programacao> = {}): Programacao => ({
  id: "p1",
  title: "Tomar remédio",
  weekdays: [1, 2, 3, 4, 5],
  startTime: "08:00",
  endTime: "08:30",
  autoStart: false,
  alarme: true,
  fuso: "America/Sao_Paulo",
  createdAt: "2026-09-01T09:00:00.000Z",
  ...over,
});
// 08:00 em Brasília = 11:00 UTC.
const utc = (hhmm: string, dia = "2026-09-10") => new Date(`${dia}T${hhmm}:00.000Z`);

describe("despertador — o que toca em cada minuto (servidor)", () => {
  test("10 minutos antes sai o aviso de antecedência, no fuso de quem criou", () => {
    const avisos = avisosDoMinuto([prog()], utc("10:50"));
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].tipo, "antes");
    assert.equal(avisos[0].titulo, "⏰ Em 10 minutos: Tomar remédio");
    assert.equal(avisos[0].tag, "zxp-despertador-p1-2026-09-10-antes");
  });

  test("na hora sai o aviso principal", () => {
    const avisos = avisosDoMinuto([prog()], utc("11:00"));
    assert.deepEqual(avisos.map((a) => a.tipo), ["hora"]);
    assert.equal(avisos[0].titulo, "⏰ Agora: Tomar remédio");
  });

  test("servidor em UTC não toca às 8h de UTC — seriam 5h da manhã em Brasília", () => {
    assert.deepEqual(avisosDoMinuto([prog()], utc("08:00")), []);
  });

  test("qualquer outro minuto não toca nada", () => {
    for (const h of ["10:49", "10:51", "10:59", "11:01"]) {
      assert.deepEqual(avisosDoMinuto([prog()], utc(h)), [], h);
    }
  });

  test("sem despertador ligado, pausada, dia pulado ou dia fora da semana: silêncio", () => {
    assert.deepEqual(avisosDoMinuto([prog({ alarme: undefined })], utc("11:00")), []);
    assert.deepEqual(avisosDoMinuto([prog({ pausedAt: "2026-09-05T00:00:00Z" })], utc("11:00")), []);
    assert.deepEqual(avisosDoMinuto([prog({ diasPulados: ["2026-09-10"] })], utc("11:00")), []);
    // 2026-09-12 é sábado.
    assert.deepEqual(avisosDoMinuto([prog()], utc("11:00", "2026-09-12")), []);
  });

  test("o dia da semana é o do fuso da pessoa, não o do servidor", () => {
    // 23:00 de quinta em Brasília já é 02:00 de sexta em UTC.
    const quintaANoite = prog({ weekdays: [4], startTime: "23:00", endTime: "23:30" });
    assert.equal(avisosDoMinuto([quintaANoite], utc("02:00", "2026-09-11")).length, 1);
  });

  test("programação antiga sem fuso guardado cai no de Brasília", () => {
    assert.equal(avisosDoMinuto([prog({ fuso: undefined })], utc("11:00")).length, 1);
  });

  test("fuso inválido não derruba os outros avisos", () => {
    const avisos = avisosDoMinuto([prog({ id: "x", fuso: "Lugar/Nenhum" }), prog()], utc("11:00"));
    assert.equal(avisos.length, 2);
  });

  test("relogioNoFuso devolve dia e minuto locais", () => {
    assert.deepEqual(relogioNoFuso(utc("02:30", "2026-09-11"), "America/Sao_Paulo"), {
      dia: "2026-09-10",
      minutos: 23 * 60 + 30,
    });
  });
});

describe("despertador — o que o app aberto agenda", () => {
  const local = (iso: string) => new Date(iso).getTime();

  test("de manhã cedo agenda os dois avisos, em ordem", () => {
    const avisos = avisosRestantesDoDia([prog()], "2026-09-10", local("2026-09-10T07:00:00"));
    assert.deepEqual(avisos.map((a) => a.tipo), ["antes", "hora"]);
    assert.equal(avisos[0].instanteMs, local("2026-09-10T07:50:00"));
    assert.equal(avisos[1].instanteMs, local("2026-09-10T08:00:00"));
  });

  test("aberto faltando 5 minutos: só o da hora (o de antecedência já passou)", () => {
    const avisos = avisosRestantesDoDia([prog()], "2026-09-10", local("2026-09-10T07:55:00"));
    assert.deepEqual(avisos.map((a) => a.tipo), ["hora"]);
  });

  test("depois da hora não agenda nada, nem em dia que não vale", () => {
    assert.deepEqual(avisosRestantesDoDia([prog()], "2026-09-10", local("2026-09-10T08:00:00")), []);
    assert.deepEqual(avisosRestantesDoDia([prog()], "2026-09-12", local("2026-09-12T07:00:00")), []);
  });

  test("a etiqueta é a mesma do servidor — os dois caminhos viram um cartão só", () => {
    const doApp = avisosRestantesDoDia([prog()], "2026-09-10", local("2026-09-10T07:00:00"));
    const doServidor = avisosDoMinuto([prog()], utc("10:50"));
    assert.equal(doApp[0].tag, doServidor[0].tag);
  });
});

test("migração guarda o despertador e o fuso, e não inventa despertador ligado", () => {
  const base = { id: "p", title: "X", weekdays: [1], startTime: "08:00", endTime: "09:00" };
  const b = migrateBoard({
    topics: [],
    tasks: [],
    programacoes: [{ ...base, alarme: true, fuso: "America/Sao_Paulo" }, { ...base, id: "q", alarme: "sim" }],
  });
  assert.equal(b.programacoes[0].alarme, true);
  assert.equal(b.programacoes[0].fuso, "America/Sao_Paulo");
  assert.equal(b.programacoes[1].alarme, undefined);
});
