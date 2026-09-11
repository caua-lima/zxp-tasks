import { Board, Programacao, ScheduleBlock } from "./types";
import { completeBlock, isFinished, isRunning } from "./schedule";
import { localDayOf } from "./date-utils";

/**
 * Programação: um bloco que se repete sozinho — "SDR, de segunda a sexta,
 * das 8h às 18h".
 *
 * O app não fica acordado às 8h esperando dar o horário. Não precisa: o
 * cronômetro guarda o INSTANTE de início, não um contador. Então, quando o
 * app abre às 9h30, o bloco nasce já rodando desde as 8h; quando abre às
 * 19h sem ter sido aberto o dia todo, o expediente nasce fechado com as 10h
 * inteiras. O resultado é o mesmo de ter ficado aberto — sem depender disso.
 */

export interface NovaProgramacaoInput {
  title: string;
  topicId?: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  autoStart: boolean;
}

/** Segunda a sexta (0 = domingo, como em `Date.getDay`). */
export const DIAS_UTEIS = [1, 2, 3, 4, 5];

const NOMES_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function horarioValido(h: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
}

export function minutosDoHorario(h: string): number {
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + mm;
}

/**
 * Duração em minutos. Zero quando o horário é inválido ou quando o fim não
 * vem depois do início — expediente que atravessa a meia-noite não é
 * suportado de propósito: ele pertenceria a dois dias ao mesmo tempo.
 */
export function duracaoDaProgramacao(p: Pick<Programacao, "startTime" | "endTime">): number {
  if (!horarioValido(p.startTime) || !horarioValido(p.endTime)) return 0;
  return Math.max(0, minutosDoHorario(p.endTime) - minutosDoHorario(p.startTime));
}

/** Mensagem do que está errado, ou `null` se dá pra salvar. */
export function problemaDaProgramacao(input: NovaProgramacaoInput): string | null {
  if (!input.title.trim()) return "Dê um nome — ex: SDR Pronix.";
  if (input.weekdays.length === 0) return "Escolha pelo menos um dia da semana.";
  if (!horarioValido(input.startTime) || !horarioValido(input.endTime)) {
    return "Horário inválido.";
  }
  if (duracaoDaProgramacao(input) <= 0) return "O fim precisa vir depois do início.";
  return null;
}

export function novaProgramacao(
  input: NovaProgramacaoInput,
  id: string,
  nowIso: string
): Programacao {
  return {
    id,
    title: input.title.trim(),
    topicId: input.topicId || undefined,
    weekdays: [...new Set(input.weekdays)].filter((d) => d >= 0 && d <= 6).sort(),
    startTime: input.startTime,
    endTime: input.endTime,
    autoStart: input.autoStart,
    diasPulados: [],
    createdAt: nowIso,
  };
}

/** "Seg a Sex", "Todo dia", "Fim de semana" ou a lista dos dias. */
export function descreverDias(weekdays: number[]): string {
  const dias = [...new Set(weekdays)].sort().join(",");
  if (dias === "1,2,3,4,5") return "Seg a Sex";
  if (dias === "0,1,2,3,4,5,6") return "Todo dia";
  if (dias === "0,6") return "Fim de semana";
  return [...new Set(weekdays)]
    .sort()
    .map((d) => NOMES_CURTOS[d])
    .join(", ");
}

/**
 * Id do bloco que uma programação gera num dia.
 *
 * DETERMINÍSTICO de propósito: PC e celular gerando o expediente de hoje ao
 * mesmo tempo produzem o mesmo id, e a sincronização (que une por id) fica
 * com um bloco só. Com id aleatório, apareceriam dois "SDR" no mesmo dia.
 */
export function idDoBlocoProgramado(programacaoId: string, dia: string): string {
  return `prog-${programacaoId}-${dia}`;
}

/** Instante de um horário local num dia local, em ms. */
export function instanteLocal(dia: string, hhmm: string): number {
  return new Date(`${dia}T${hhmm}:00`).getTime();
}

export function valeNoDia(p: Programacao, dia: string): boolean {
  if (p.pausedAt) return false;
  // Dia pulado: o bloco foi apagado de propósito (feriado, folga). Sem isto,
  // a próxima checagem o recriaria e seria impossível tirar o dia.
  if ((p.diasPulados ?? []).includes(dia)) return false;
  // Não cria expediente em dias anteriores à própria programação.
  if (dia < localDayOf(p.createdAt)) return false;
  return p.weekdays.includes(new Date(`${dia}T00:00:00`).getDay());
}

/**
 * Garante que os blocos programados de hoje existam e estejam no estado
 * certo pro horário atual. Idempotente: chamar de novo sem o relógio mudar
 * de fase devolve o MESMO quadro (`mudou: false`), o que evita disparar
 * sincronização à toa a cada minuto.
 */
export function materializarProgramacoes(
  board: Board,
  hoje: string,
  agoraMs: number
): { board: Board; mudou: boolean } {
  let schedule = board.schedule;
  let mudou = false;

  for (const p of board.programacoes ?? []) {
    if (!valeNoDia(p, hoje)) continue;
    const duracao = duracaoDaProgramacao(p);
    if (duracao <= 0) continue;

    const inicio = instanteLocal(hoje, p.startTime);
    const fim = instanteLocal(hoje, p.endTime);
    // Criada DEPOIS do fim do expediente de hoje — o caso de quem configura
    // à noite, em casa: não gera o bloco de hoje. Ele nasceria "concluído com
    // 0 min", sujando o cronograma e o relatório de um dia em que nada
    // aconteceu. A partir de amanhã vale normalmente.
    if (new Date(p.createdAt).getTime() >= fim) continue;
    // No dia em que a programação foi criada, o relógio começa quando ela
    // passou a existir — não às 8h. Não dá pra inventar trabalho de antes de
    // o app saber que havia um expediente.
    const inicioEfetivo = Math.min(fim, Math.max(inicio, new Date(p.createdAt).getTime()));
    const id = idDoBlocoProgramado(p.id, hoje);
    const existente = schedule.find((b) => b.id === id);

    if (!existente) {
      const doDia = schedule.filter((b) => b.date === hoje);
      const order = doDia.length === 0 ? 0 : Math.max(...doDia.map((b) => b.order)) + 1;
      let bloco: ScheduleBlock = {
        id,
        date: hoje,
        title: p.title,
        plannedMinutes: duracao,
        accumulatedMs: 0,
        order,
        topicId: p.topicId,
        programacaoId: p.id,
      };
      if (p.autoStart && agoraMs >= fim) {
        // O app ficou fechado o expediente inteiro: nasce fechado, completo.
        bloco = {
          ...bloco,
          accumulatedMs: Math.max(0, fim - inicioEfetivo),
          completedAt: new Date(fim).toISOString(),
        };
      } else if (p.autoStart && agoraMs >= inicio) {
        bloco = { ...bloco, startedAt: new Date(inicioEfetivo).toISOString() };
      }
      schedule = [...schedule, bloco];
      mudou = true;
      continue;
    }

    // Só liga sozinho o que nunca foi tocado. Se a pessoa pausou, retomou
    // ou encerrou, a decisão é dela — religar por cima seria desfazer.
    const intocado =
      !existente.startedAt && existente.accumulatedMs === 0 && !isFinished(existente);

    if (p.autoStart && intocado && agoraMs >= inicio && agoraMs < fim) {
      schedule = schedule.map((b) =>
        b.id === id ? { ...b, startedAt: new Date(inicioEfetivo).toISOString() } : b
      );
      mudou = true;
    } else if (p.autoStart && intocado && agoraMs >= fim) {
      schedule = schedule.map((b) =>
        b.id === id
          ? {
              ...b,
              accumulatedMs: Math.max(0, fim - inicioEfetivo),
              completedAt: new Date(fim).toISOString(),
            }
          : b
      );
      mudou = true;
    } else if (
      agoraMs >= fim &&
      isRunning(existente) &&
      // Retomado de propósito DEPOIS do fim do expediente (hora extra): não
      // é o app que decide encerrar isso.
      new Date(existente.startedAt!).getTime() < fim
    ) {
      // Fecha exatamente no fim: o que rodou depois das 18h não entra.
      schedule = schedule.map((b) =>
        b.id === id ? completeBlock(b, new Date(fim).toISOString()) : b
      );
      mudou = true;
    }
  }

  return mudou ? { board: { ...board, schedule }, mudou } : { board, mudou };
}
