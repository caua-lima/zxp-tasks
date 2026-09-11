import { Board, Meta, ScheduleBlock } from "./types";
import { addDaysISO } from "./date-utils";

/**
 * Metas diárias com prazo — tudo aqui é função pura.
 *
 * As datas são sempre dias LOCAIS "AAAA-MM-DD". Usar UTC faria a leitura das
 * 22h no Brasil contar como o dia seguinte, e a sequência quebraria sozinha
 * justamente de quem lê à noite.
 */

export interface NovaMetaInput {
  title: string;
  unit: string;
  dailyTarget: number;
  startDate: string;
  days: number;
}

export function novaMeta(input: NovaMetaInput, id: string, nowIso: string): Meta {
  return {
    id,
    title: input.title.trim(),
    unit: input.unit.trim(),
    // Alvo zero faria todo dia contar como batido sem fazer nada.
    dailyTarget: Math.max(1, Math.round(input.dailyTarget)),
    startDate: input.startDate,
    days: Math.max(1, Math.round(input.days)),
    registros: {},
    createdAt: nowIso,
  };
}

export function ultimoDiaDaMeta(meta: Meta): string {
  return addDaysISO(meta.startDate, meta.days - 1);
}

export function diaDentroDaMeta(meta: Meta, dia: string): boolean {
  return dia >= meta.startDate && dia <= ultimoDiaDaMeta(meta);
}

export interface DiaDaMeta {
  date: string;
  feito: number;
  bateu: boolean;
  /** Ainda não chegou — não pode contar como falha. */
  futuro: boolean;
  hoje: boolean;
}

export interface ProgressoDaMeta {
  dias: DiaDaMeta[];
  /** Posição de hoje na meta (1 = primeiro dia). 0 antes de começar. */
  diaAtual: number;
  /** Dias que já chegaram, contando hoje. */
  diasPassados: number;
  diasBatidos: number;
  /**
   * Dias seguidos batidos até agora.
   *
   * Hoje ainda não batido NÃO zera a sequência: o dia não acabou. Zerar às
   * 8h da manhã porque a pessoa ainda não leu seria punir quem nem teve a
   * chance — a sequência só quebra de fato quando um dia passado ficou
   * sem bater.
   */
  sequencia: number;
  totalFeito: number;
  hojeFeito: number;
  hojeBateu: boolean;
  terminou: boolean;
  naoComecou: boolean;
  /** Dias batidos sobre a duração inteira, 0–100. */
  percentual: number;
}

export function progressoDaMeta(meta: Meta, hoje: string): ProgressoDaMeta {
  const dias: DiaDaMeta[] = [];
  for (let i = 0; i < meta.days; i++) {
    const date = addDaysISO(meta.startDate, i);
    const feito = meta.registros[date] ?? 0;
    dias.push({
      date,
      feito,
      bateu: feito >= meta.dailyTarget,
      futuro: date > hoje,
      hoje: date === hoje,
    });
  }

  const passados = dias.filter((d) => !d.futuro);
  const diasBatidos = passados.filter((d) => d.bateu).length;

  let sequencia = 0;
  for (let i = passados.length - 1; i >= 0; i--) {
    const d = passados[i];
    if (d.bateu) sequencia++;
    else if (d.hoje) continue;
    else break;
  }

  const idxHoje = dias.findIndex((d) => d.hoje);
  const deHoje = idxHoje >= 0 ? dias[idxHoje] : undefined;

  return {
    dias,
    diaAtual: idxHoje >= 0 ? idxHoje + 1 : hoje > ultimoDiaDaMeta(meta) ? meta.days : 0,
    diasPassados: passados.length,
    diasBatidos,
    sequencia,
    totalFeito: dias.reduce((soma, d) => soma + d.feito, 0),
    hojeFeito: deHoje?.feito ?? 0,
    hojeBateu: deHoje?.bateu ?? false,
    terminou: hoje > ultimoDiaDaMeta(meta),
    naoComecou: hoje < meta.startDate,
    percentual: Math.round((diasBatidos / meta.days) * 100),
  };
}

/**
 * Soma (ou subtrai) no registro de um dia. Nunca deixa negativo e ignora dia
 * fora da meta — anotar numa data que não pertence à meta criaria progresso
 * que nenhum gráfico mostra.
 */
export function registrarNaMeta(meta: Meta, dia: string, delta: number): Meta {
  if (!diaDentroDaMeta(meta, dia)) return meta;
  const novo = Math.max(0, (meta.registros[dia] ?? 0) + delta);
  const registros = { ...meta.registros };
  if (novo === 0) delete registros[dia];
  else registros[dia] = novo;
  return { ...meta, registros };
}

/**
 * Garante o dia como batido, sem inflar o que já foi anotado.
 *
 * Usa o MAIOR entre o registrado e o alvo: se a pessoa já tinha anotado 10
 * páginas, concluir uma tarefa ligada não pode rebaixar isso pra 2.
 */
export function marcarDiaBatido(meta: Meta, dia: string): Meta {
  if (!diaDentroDaMeta(meta, dia)) return meta;
  const atual = meta.registros[dia] ?? 0;
  if (atual >= meta.dailyTarget) return meta;
  return { ...meta, registros: { ...meta.registros, [dia]: meta.dailyTarget } };
}

/**
 * Concluir tarefas ligadas a metas marca o dia nelas.
 *
 * Existe como função única porque uma tarefa vira "feita" por três caminhos
 * (mudar o status, concluir o bloco que a carrega, registrar algo que já foi
 * feito). Espalhar a regra garantiria que um deles esquecesse da meta.
 */
export function aplicarConclusaoNasMetas(board: Board, taskIds: string[], dia: string): Board {
  const metaIds: string[] = [];
  for (const id of taskIds) {
    const t = board.tasks.find((x) => x.id === id);
    metaIds.push(...(t?.metaIds ?? []));
  }
  return marcarMetas(board, metaIds, dia);
}

/**
 * Marca o dia como batido num conjunto de metas. Base comum de todo caminho
 * que conclui alguma coisa; meta arquivada fica de fora — arquivar é
 * justamente parar de contar.
 */
export function marcarMetas(board: Board, metaIds: string[], dia: string): Board {
  const alvo = new Set(metaIds);
  if (alvo.size === 0) return board;
  return {
    ...board,
    metas: (board.metas ?? []).map((m) =>
      alvo.has(m.id) && !m.archivedAt ? marcarDiaBatido(m, dia) : m
    ),
  };
}

/**
 * Bloco concluído conta nas metas dele E nas da tarefa que ele carrega.
 *
 * As duas fontes existem porque bloco sem projeto não tem tarefa onde
 * guardar o vínculo ("Ler", solto no cronograma). Juntar as duas não conta
 * em dobro: marcar o dia usa o maior valor, então repetir a mesma meta é
 * inofensivo.
 */
export function aplicarMetasDoBloco(board: Board, block: ScheduleBlock, dia: string): Board {
  const task = block.taskId ? board.tasks.find((t) => t.id === block.taskId) : undefined;
  return marcarMetas(board, [...(block.metaIds ?? []), ...(task?.metaIds ?? [])], dia);
}

/** Frase curta da meta: "Ler 2 páginas por dia". */
export function descreverMeta(meta: Meta): string {
  return `${meta.title} ${meta.dailyTarget} ${meta.unit} por dia`;
}
