export type TaskStatus = "todo" | "doing" | "done";
export type TaskPriority = "critical" | "high" | "medium" | "low";
export type TaskEnergy = "deep" | "normal" | "quick";

/**
 * A vertente de uma pasta: um projeto pessoal, o trabalho do dia a dia, ou
 * uma lista de coisas que quero comprar. Muda os rótulos de status, os
 * campos do item e o resumo da pasta — o modelo de dados por baixo é o
 * mesmo, e por isso trocar a vertente nunca perde nada.
 */
export type TopicKind = "project" | "work" | "wishlist";

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

export interface Recurrence {
  frequency: "daily" | "weekly" | "monthly";
  interval?: number;
  weekdays?: number[];
}

export interface Task {
  id: string;
  /**
   * Projeto PRINCIPAL da tarefa. Continua sendo um só, e de propósito: é
   * quem responde "de onde isso saiu" e é o único que conta no dinheiro de
   * uma lista de desejos — somar o mesmo preço em duas pastas inflaria o
   * total sem que nada tivesse sido comprado a mais.
   */
  topicId: string;
  title: string;
  description: string;
  status: TaskStatus;

  priority: TaskPriority;
  dueDate?: string | null;
  completedAt?: string | null;

  estimatedMinutes?: number;
  energy?: TaskEnergy;

  /**
   * Campos de desejo/compra — só aparecem quando o tópico é uma lista de
   * desejos. Preço em CENTAVOS (inteiro) de propósito: somar float dá
   * "R$ 1.234,5600000001" na hora de totalizar a pasta.
   */
  priceCents?: number;
  /**
   * O texto exatamente como foi digitado quando o preço é montado por
   * partes ("multimídia 1.200 + mão de obra 300"). `priceCents` guarda só
   * a soma; sem isso, reabrir o item mostraria "1500,00" e a pessoa perderia
   * a conta que ela mesma fez.
   */
  priceParts?: string;
  url?: string;
  store?: string;

  /**
   * Outros projetos em que a tarefa também aparece.
   *
   * Existe porque uma mesma coisa pode pertencer a duas frentes — "gravar
   * aula" é da Mentoria e do Marketing ao mesmo tempo. Guardar só os EXTRAS
   * (nunca o principal) evita a pergunta "qual dos dois vale?" e mantém
   * quadros antigos válidos sem migração nenhuma.
   */
  extraTopicIds?: string[];
  /**
   * Metas que esta tarefa ajuda a cumprir. Concluir a tarefa marca o dia como
   * batido em cada uma — "ler o capítulo 3" serve a "ler 2 páginas por dia".
   */
  metaIds?: string[];

  tags: string[];
  checklist: ChecklistItem[];

  recurrence?: Recurrence | null;
  /**
   * Marca que a próxima ocorrência desta tarefa recorrente já foi criada.
   * Sobrevive a reabrir/concluir de novo — sem isso, reabrir limpa o
   * `completedAt` e a segunda conclusão geraria uma ocorrência duplicada.
   */
  recurrenceSpawned?: boolean;

  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  deletedAt?: string | null;
}

export interface Topic {
  id: string;
  name: string;
  color: string;
  icon?: string;
  description?: string;
  /** Ausente em tópicos criados antes das listas de desejos = "project". */
  kind?: TopicKind;
  /** Meta de gasto da lista de desejos, em centavos. */
  budgetCents?: number;
  /**
   * Conclui sozinho um bloco deste projeto que passou de tantos minutos
   * rodando. Existe pra quem tem um tipo de tarefa com teto conhecido —
   * "pedido de agência não passa de 30 min" — e esquece de apertar
   * "Concluir": se o cronômetro passou do teto, muito provavelmente já
   * acabou e ninguém voltou pra fechar.
   */
  autoCompleteMinutes?: number;
  createdAt: string;
  archivedAt?: string | null;
}

export interface WeeklyReviewNote {
  id: string;
  weekStart: string;
  stuck: string;
  toArchive: string;
  nextPriority: string;
  wastingTime: string;
  createdAt: string;
}

/**
 * Um bloco de trabalho do dia: "Chamar leads — 40 min".
 *
 * NÃO é uma tarefa: a mesma atividade aparece várias vezes no mesmo dia
 * (leads de manhã, leads à tarde), cada uma com sua própria duração e seu
 * próprio cronômetro. Por isso é uma sessão, não um item de lista.
 */
export interface ScheduleBlock {
  id: string;
  /** Dia local "AAAA-MM-DD" a que o bloco pertence. */
  date: string;
  title: string;
  plannedMinutes: number;
  /**
   * Instante em que o cronômetro foi ligado, em ISO. Presente = rodando.
   * Guardar o instante (e não um contador) faz o tempo continuar correndo
   * com o app fechado ou o celular bloqueado — que é o uso real.
   */
  startedAt?: string;
  /** Tempo somado das vezes em que já foi pausado. */
  accumulatedMs: number;
  completedAt?: string;
  /**
   * Marcado como "não fiz". É um encerramento tão legítimo quanto concluir:
   * o dia acabou e isto não aconteceu. Guardado separado de `completedAt`
   * porque um bloco fechado sem ter sido feito não pode virar produtividade
   * no relatório.
   */
  skippedAt?: string;
  /**
   * "Pra depois": começou, não terminou, e vai ser retomado em outra hora
   * ou outro dia. Não é "não fiz" (houve trabalho) nem "concluído" (não
   * acabou). O tempo gasto continua contando no dia em que foi gasto.
   */
  parkedAt?: string;
  /**
   * Quando um bloco em espera foi retomado NUM OUTRO DIA. Retomar cria um
   * bloco novo no dia de hoje e marca este — assim o tempo de cada dia
   * continua no seu dia, em vez de o bloco inteiro "mudar de data" e levar
   * junto horas que foram trabalhadas antes.
   */
  resumedAt?: string;
  /** Bloco em espera de onde este aqui continua, quando for o caso. */
  continuaDe?: string;
  /** Programação que gerou este bloco, quando ele veio de uma. */
  programacaoId?: string;
  /**
   * Metas em que o bloco conta ao ser concluído. Só é preenchido quando o
   * bloco NÃO carrega tarefa — um "Ler" solto, sem projeto. Com tarefa, as
   * metas moram nela e concluir o bloco já conta por ela; guardar nos dois
   * lugares abriria a pergunta "qual vale?".
   */
  metaIds?: string[];
  order: number;
  /**
   * Projeto a que este bloco pertence, e a tarefa criada junto com ele.
   *
   * "Chamar leads" é ao mesmo tempo um bloco de 40 min no cronograma de hoje
   * e uma tarefa do projeto — escrever nos dois lugares era trabalho
   * duplicado. Escolher o projeto ao criar o bloco cria a tarefa e guarda o
   * vínculo aqui.
   *
   * Os dois campos são opcionais: bloco solto (sem projeto) continua sendo o
   * caso normal, e um vínculo pode ficar órfão se a tarefa for apagada — por
   * isso quem lê sempre confere se a tarefa ainda existe.
   */
  topicId?: string;
  taskId?: string;
  /**
   * Bloco de descanso, não de trabalho. Conta no relógio do dia, mas fora
   * do total de trabalho — somar o almoço às horas produzidas faria o
   * número do dia mentir na direção mais fácil de acreditar.
   */
  isBreak?: boolean;
  /**
   * Bloco sem tempo combinado: o cronômetro conta pra cima e não existe
   * "passou do tempo". É o expediente que não se planeja em fatias — dá pra
   * medir quanto durou sem ter que fingir uma previsão antes de começar.
   *
   * `plannedMinutes` continua preenchido (um palpite qualquer) só pra não
   * quebrar quem lê o campo; quem decide é esta marca.
   */
  openEnded?: boolean;
}

/**
 * Uma meta com prazo e alvo diário: "ler 2 páginas por dia durante 30 dias".
 *
 * Diferente de uma tarefa, ela não termina num clique — ela se cumpre dia a
 * dia. Por isso guarda um registro por DIA em vez de um status: a pergunta
 * que ela responde é "bati hoje?" e "quantos dias bati?", não "está feita?".
 */
export interface Meta {
  id: string;
  /** O que fazer: "Ler". */
  title: string;
  /** Em que se mede: "páginas", "minutos", "km". */
  unit: string;
  /** Quanto por dia pra considerar o dia batido. */
  dailyTarget: number;
  /** Primeiro dia local da meta, "AAAA-MM-DD". */
  startDate: string;
  /** Duração em dias, contando o primeiro. */
  days: number;
  /**
   * Quanto foi feito em cada dia local. Guardado como número, e não como
   * "batido sim/não", porque ler 10 páginas num dia de meta 2 é informação —
   * vira o total acumulado.
   */
  registros: Record<string, number>;
  createdAt: string;
  archivedAt?: string;
}

/**
 * Um bloco que se repete sozinho: "SDR, de segunda a sexta, das 8h às 18h".
 *
 * O app não precisa estar aberto no horário. Como o cronômetro guarda o
 * instante de início, o bloco é criado quando o app abre — já rodando desde
 * o horário certo, ou já fechado se o expediente terminou.
 */
export interface Programacao {
  id: string;
  title: string;
  topicId?: string;
  /** Dias da semana em que vale: 0 = domingo … 6 = sábado. */
  weekdays: number[];
  /** Horário local "HH:MM". */
  startTime: string;
  endTime: string;
  /** Liga o cronômetro sozinho no horário de início. */
  autoStart: boolean;
  /**
   * Dias em que o bloco foi apagado de propósito (feriado, folga). Sem este
   * registro, a próxima checagem recriaria o bloco e seria impossível tirar
   * o dia.
   */
  diasPulados?: string[];
  createdAt: string;
  pausedAt?: string;
}

export interface BoardSettings {
  /**
   * Deixa mais de um cronômetro correr ao mesmo tempo.
   *
   * Desligado, começar um bloco pausa o que estiver rodando — bom pra quem
   * troca de tarefa. Ligado, os cronômetros somam em paralelo: dez minutos
   * de relógio com dois blocos ligados viram vinte minutos no total do dia.
   * Isso é proposital (o total passa a significar "tempo dedicado", não
   * "tempo de relógio"), e a tela avisa quando está acontecendo.
   */
  parallelTimers: boolean;
}

export interface Board {
  schemaVersion: number;
  topics: Topic[];
  tasks: Task[];
  schedule: ScheduleBlock[];
  dailyFocus: Record<string, string[]>;
  weeklyReviews: WeeklyReviewNote[];
  settings: BoardSettings;
  metas: Meta[];
  programacoes: Programacao[];
}

export const CURRENT_SCHEMA_VERSION = 4;

export function emptyBoard(): Board {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    topics: [],
    tasks: [],
    schedule: [],
    dailyFocus: {},
    weeklyReviews: [],
    settings: { parallelTimers: false },
    metas: [],
    programacoes: [],
  };
}
