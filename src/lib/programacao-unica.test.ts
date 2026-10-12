process.env.TZ = "America/Sao_Paulo";

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { emptyBoard } from "./types";
import {
  descreverQuando,
  materializarProgramacoes,
  novaProgramacao,
  problemaDaProgramacao,
  valeNoDia,
} from "./programacao";
import { avisosDoMinuto } from "./despertador";
import { migrateBoard } from "./task-migrations";

// 2026-10-15 é uma quinta-feira.
const entrada = (over = {}) => ({
  title: "Consulta",
  weekdays: [] as number[],
  startTime: "14:00",
  endTime: "15:00",
  autoStart: false,
  dataUnica: "2026-10-15",
  ...over,
});
const unica = (over = {}) => novaProgramacao(entrada(over), "u1", "2026-10-01T12:00:00.000Z");
const local = (s: string) => new Date(s).getTime();

describe("programação que não repete (só uma vez)", () => {
  test("vale no dia marcado e em nenhum outro — nem na mesma quinta da semana seguinte", () => {
    const p = unica();
    assert.equal(valeNoDia(p, "2026-10-15"), true);
    assert.equal(valeNoDia(p, "2026-10-14"), false);
    assert.equal(valeNoDia(p, "2026-10-22"), false);
  });

  test("a que repete continua valendo toda semana", () => {
    const p = novaProgramacao(entrada({ dataUnica: undefined, weekdays: [4] }), "r1", "2026-10-01T12:00:00.000Z");
    assert.equal(valeNoDia(p, "2026-10-15"), true);
    assert.equal(valeNoDia(p, "2026-10-22"), true);
  });

  test("não exige dia da semana, mas exige uma data válida", () => {
    assert.equal(problemaDaProgramacao(entrada()), null);
    assert.match(problemaDaProgramacao(entrada({ dataUnica: "" }))!, /dia em que vai acontecer/);
    assert.match(problemaDaProgramacao(entrada({ dataUnica: "amanhã" }))!, /dia em que vai acontecer/);
    // Sem data única, a regra antiga continua: precisa de dia da semana.
    assert.match(problemaDaProgramacao(entrada({ dataUnica: undefined }))!, /dia da semana/);
  });

  test("gera o bloco só no dia dela", () => {
    const board = { ...emptyBoard(), programacoes: [unica()] };
    assert.equal(materializarProgramacoes(board, "2026-10-14", local("2026-10-14T10:00:00")).board.schedule.length, 0);
    assert.equal(materializarProgramacoes(board, "2026-10-15", local("2026-10-15T10:00:00")).board.schedule.length, 1);
    assert.equal(materializarProgramacoes(board, "2026-10-22", local("2026-10-22T10:00:00")).board.schedule.length, 0);
  });

  test("despertador toca só naquele dia", () => {
    const p = { ...unica(), alarme: true, fuso: "America/Sao_Paulo" };
    // 14:00 em Brasília = 17:00 UTC.
    assert.equal(avisosDoMinuto([p], new Date("2026-10-15T17:00:00.000Z")).length, 1);
    assert.equal(avisosDoMinuto([p], new Date("2026-10-22T17:00:00.000Z")).length, 0);
  });

  test("descrição mostra a data em vez dos dias da semana", () => {
    assert.equal(descreverQuando(unica()), "Só em 15/10");
    assert.equal(descreverQuando({ weekdays: [1, 2, 3, 4, 5] }), "Seg a Sex");
  });

  test("sobrevive à ida e volta pela nuvem, e data inválida vira repetição normal", () => {
    const b = migrateBoard({ topics: [], tasks: [], programacoes: [unica(), { ...unica(), id: "x", dataUnica: "lixo" }] });
    assert.equal(b.programacoes[0].dataUnica, "2026-10-15");
    assert.deepEqual(b.programacoes[0].weekdays, [4]);
    assert.equal(b.programacoes[1].dataUnica, undefined);
  });
});
