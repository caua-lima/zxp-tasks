import { Programacao } from "./types";
import { instanteLocal, minutosDoHorario, valeNoDia } from "./programacao";

/** Com quanta antecedência sai o "daqui a pouco você precisa fazer X". */
export const ANTECEDENCIA_MIN = 10;

/** Fuso usado quando a programação não guardou o dela (criada antes do despertador). */
export const FUSO_PADRAO = "America/Sao_Paulo";

export interface AvisoDoDespertador {
  /**
   * Etiqueta da notificação. O aviso pode sair por dois caminhos — o
   * servidor (app fechado) e o próprio app (aberto) — e a etiqueta igual faz
   * o segundo substituir o primeiro em vez de virar dois cartões.
   */
  tag: string;
  tipo: "antes" | "hora";
  titulo: string;
  corpo: string;
}

function montar(p: Programacao, dia: string, tipo: "antes" | "hora"): AvisoDoDespertador {
  return tipo === "antes"
    ? {
        tag: `zxp-despertador-${p.id}-${dia}-antes`,
        tipo,
        titulo: `⏰ Em ${ANTECEDENCIA_MIN} minutos: ${p.title}`,
        corpo: `Começa às ${p.startTime}.`,
      }
    : {
        tag: `zxp-despertador-${p.id}-${dia}-hora`,
        tipo,
        titulo: `⏰ Agora: ${p.title}`,
        corpo: `Está na hora (${p.startTime}).`,
      };
}

function comDespertador(p: Programacao, dia: string): boolean {
  return !!p.alarme && valeNoDia(p, dia);
}

/** Dia local "AAAA-MM-DD" e minuto do dia de um instante, num fuso. */
export function relogioNoFuso(instante: Date, fuso: string): { dia: string; minutos: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const pega = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "00";
  return {
    dia: `${pega("year")}-${pega("month")}-${pega("day")}`,
    minutos: Number(pega("hour")) * 60 + Number(pega("minute")),
  };
}

/**
 * Avisos que devem sair NESTE minuto — é o que o servidor pergunta a cada
 * minuto. O horário da programação é local de quem criou, então o "agora" é
 * convertido pro fuso dela: o servidor roda em UTC e, sem isso, o despertador
 * das 8h tocaria às 5h.
 *
 * Programação que começa antes de 00:10 não tem aviso de antecedência: ele
 * cairia no dia anterior, que pode nem ser um dia em que ela vale.
 */
export function avisosDoMinuto(programacoes: Programacao[], agora: Date): AvisoDoDespertador[] {
  const avisos: AvisoDoDespertador[] = [];
  for (const p of programacoes) {
    if (!p.alarme) continue;
    let relogio: { dia: string; minutos: number };
    try {
      relogio = relogioNoFuso(agora, p.fuso ?? FUSO_PADRAO);
    } catch {
      // Fuso inválido (dado corrompido) não pode derrubar os outros avisos.
      relogio = relogioNoFuso(agora, FUSO_PADRAO);
    }
    if (!comDespertador(p, relogio.dia)) continue;
    const inicio = minutosDoHorario(p.startTime);
    if (relogio.minutos === inicio) avisos.push(montar(p, relogio.dia, "hora"));
    else if (relogio.minutos === inicio - ANTECEDENCIA_MIN) avisos.push(montar(p, relogio.dia, "antes"));
  }
  return avisos;
}

/**
 * Avisos que ainda vão acontecer hoje, com o instante de cada um — é o que o
 * app aberto agenda por conta própria, no relógio do aparelho.
 */
export function avisosRestantesDoDia(
  programacoes: Programacao[],
  dia: string,
  agoraMs: number
): (AvisoDoDespertador & { instanteMs: number })[] {
  const avisos: (AvisoDoDespertador & { instanteMs: number })[] = [];
  for (const p of programacoes) {
    if (!comDespertador(p, dia)) continue;
    const inicio = instanteLocal(dia, p.startTime);
    const candidatos = [
      { tipo: "antes" as const, instanteMs: inicio - ANTECEDENCIA_MIN * 60_000 },
      { tipo: "hora" as const, instanteMs: inicio },
    ];
    for (const c of candidatos) {
      if (c.instanteMs > agoraMs) avisos.push({ ...montar(p, dia, c.tipo), instanteMs: c.instanteMs });
    }
  }
  return avisos.sort((a, b) => a.instanteMs - b.instanteMs);
}
