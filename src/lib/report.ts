import { Board, ScheduleBlock, Task } from "./types";
import { elapsedMs, plannedMs } from "./schedule";
import { addDaysISO, localDayOf, todayISO } from "./date-utils";

/**
 * Bloco começado num dia e concluído em outro.
 *
 * O caso real: começar às 23h40 e terminar 00h20. O tempo continua contando
 * no dia em que o bloco foi planejado — é a mesma sessão de trabalho, e
 * partir o total no meio da noite não ajudaria ninguém a entender o próprio
 * dia. Mas a tarefa vinculada é marcada como concluída no instante em que
 * foi concluída, ou seja, já no dia seguinte.
 *
 * Essas duas verdades juntas fazem os números "não baterem" se ninguém
 * disser nada. Por isso o relatório mostra a virada em vez de escondê-la.
 */
export interface ViradaDeDia {
  id: string;
  title: string;
  /** Dia a que o bloco pertence (onde o tempo é contado). */
  diaDoBloco: string;
  /** Dia local em que foi efetivamente concluído. */
  diaDaConclusao: string;
  elapsedMs: number;
}

export interface DiaDoRelatorio {
  date: string;
  /** Só blocos de trabalho — intervalo tem seu próprio total. */
  plannedMs: number;
  elapsedMs: number;
  intervaloMs: number;
  blocosFeitos: number;
  /** Encerrados como "não fiz" — fechados, mas não produtividade. */
  blocosNaoFeitos: number;
  blocosTotal: number;
  /** Tarefas cujo `completedAt` cai neste dia local. */
  tarefasConcluidas: number;
  viradas: ViradaDeDia[];
}

export interface Relatorio {
  de: string;
  ate: string;
  dias: DiaDoRelatorio[];
  totalPlanejadoMs: number;
  totalTrabalhadoMs: number;
  totalIntervaloMs: number;
  blocosFeitos: number;
  blocosNaoFeitos: number;
  blocosTotal: number;
  tarefasConcluidas: number;
  viradas: ViradaDeDia[];
  /** Dia com mais tempo trabalhado no período; null se ninguém trabalhou. */
  melhorDia: DiaDoRelatorio | null;
}

function diasDoIntervalo(de: string, ate: string): string[] {
  const dias: string[] = [];
  let atual = de;
  // Trava de segurança: intervalo invertido ou data inválida não pode virar
  // laço infinito na tela de relatório.
  for (let i = 0; i < 400 && atual <= ate; i++) {
    dias.push(atual);
    atual = addDaysISO(atual, 1);
  }
  return dias;
}

function ehVirada(block: ScheduleBlock): boolean {
  if (!block.completedAt) return false;
  return localDayOf(block.completedAt) !== block.date;
}

/**
 * Monta o relatório do período. Datas são dias locais "AAAA-MM-DD" — usar
 * UTC aqui jogaria tudo que acontece depois das 21h no dia seguinte.
 */
export function montarRelatorio(
  board: Board,
  de: string,
  ate: string = todayISO()
): Relatorio {
  const agora = Date.now();
  const dias = diasDoIntervalo(de, ate);
  const dentroDoPeriodo = new Set(dias);

  const concluidasPorDia = new Map<string, number>();
  for (const t of board.tasks) {
    if (!t.completedAt || t.deletedAt) continue;
    const dia = localDayOf(t.completedAt);
    if (!dentroDoPeriodo.has(dia)) continue;
    concluidasPorDia.set(dia, (concluidasPorDia.get(dia) ?? 0) + 1);
  }

  const porDia = new Map<string, ScheduleBlock[]>();
  for (const b of board.schedule) {
    if (!dentroDoPeriodo.has(b.date)) continue;
    const lista = porDia.get(b.date);
    if (lista) lista.push(b);
    else porDia.set(b.date, [b]);
  }

  const linhas: DiaDoRelatorio[] = dias.map((date) => {
    const blocos = porDia.get(date) ?? [];
    const trabalho = blocos.filter((b) => !b.isBreak);
    const intervalos = blocos.filter((b) => b.isBreak);

    return {
      date,
      plannedMs: trabalho.reduce((soma, b) => soma + plannedMs(b), 0),
      elapsedMs: trabalho.reduce((soma, b) => soma + elapsedMs(b, agora), 0),
      intervaloMs: intervalos.reduce((soma, b) => soma + elapsedMs(b, agora), 0),
      blocosFeitos: trabalho.filter((b) => b.completedAt).length,
      blocosNaoFeitos: trabalho.filter((b) => b.skippedAt).length,
      blocosTotal: trabalho.length,
      tarefasConcluidas: concluidasPorDia.get(date) ?? 0,
      viradas: blocos.filter(ehVirada).map((b) => ({
        id: b.id,
        title: b.title,
        diaDoBloco: b.date,
        diaDaConclusao: localDayOf(b.completedAt!),
        elapsedMs: elapsedMs(b, agora),
      })),
    };
  });

  const soma = (pegar: (d: DiaDoRelatorio) => number) =>
    linhas.reduce((total, d) => total + pegar(d), 0);

  const comTrabalho = linhas.filter((d) => d.elapsedMs > 0);
  const melhorDia =
    comTrabalho.length === 0
      ? null
      : comTrabalho.reduce((a, b) => (b.elapsedMs > a.elapsedMs ? b : a));

  return {
    de,
    ate,
    dias: linhas,
    totalPlanejadoMs: soma((d) => d.plannedMs),
    totalTrabalhadoMs: soma((d) => d.elapsedMs),
    totalIntervaloMs: soma((d) => d.intervaloMs),
    blocosFeitos: soma((d) => d.blocosFeitos),
    blocosNaoFeitos: soma((d) => d.blocosNaoFeitos),
    blocosTotal: soma((d) => d.blocosTotal),
    tarefasConcluidas: soma((d) => d.tarefasConcluidas),
    viradas: linhas.flatMap((d) => d.viradas),
    melhorDia,
  };
}

export interface TarefaConcluida {
  task: Task;
  /** Dia local da conclusão. */
  dia: string;
}

/** Tarefas concluídas no período, da mais recente pra mais antiga. */
export function tarefasConcluidasNoPeriodo(
  board: Board,
  de: string,
  ate: string = todayISO()
): TarefaConcluida[] {
  return board.tasks
    .filter((t) => t.completedAt && !t.deletedAt)
    .map((t) => ({ task: t, dia: localDayOf(t.completedAt!) }))
    .filter((x) => x.dia >= de && x.dia <= ate)
    .sort((a, b) => (b.task.completedAt! < a.task.completedAt! ? -1 : 1));
}
