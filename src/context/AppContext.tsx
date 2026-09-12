"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { v4 as uuid } from "uuid";
import {
  Board,
  BoardSettings,
  Grupo,
  ScheduleBlock,
  Task,
  TaskStatus,
  Topic,
  TopicKind,
  Meta,
  Programacao,
  WeeklyReviewNote,
  emptyBoard,
} from "@/lib/types";
import { loadBoard, pushBackup, saveBoard } from "@/lib/storage";
import { nextTopicColor } from "@/lib/colors";
import { migrateBoard } from "@/lib/task-migrations";
import { mergeBoards, mergeImportedData, MergeReport, validateBackup } from "@/lib/task-backup";
import { skipOccurrence } from "@/lib/recurrence";
import { todayISO } from "@/lib/date-utils";
import { useAuth } from "./AuthContext";
import { fetchCloudBoard, pushBoardToCloud, subscribeToCloudBoard } from "@/lib/cloud-sync";
import { registrarAparelho } from "@/lib/push";
import { createTask, NewTaskInput } from "@/lib/task-factory";
import { concluirTarefaNoBoard } from "@/lib/task-completion";
import {
  aplicarMetasDoBloco,
  NovaMetaInput,
  novaMeta,
  registrarNaMeta,
} from "@/lib/metas";
import {
  materializarProgramacoes,
  NovaProgramacaoInput,
  novaProgramacao,
} from "@/lib/programacao";
import {
  autoConcluirBlocos,
  completeBlock,
  completedBlockData,
  extendBlock,
  parkBlock,
  pauseBlock,
  reopenBlock,
  resetBlock,
  retomarBloco,
  skipBlock,
  startBlock,
} from "@/lib/schedule";

export type { NewTaskInput };

export type SyncStatus = "offline" | "syncing" | "synced" | "error";

interface AppContextValue {
  topics: Topic[];
  tasks: Task[];
  board: Board;
  ready: boolean;
  addTopic: (name: string, kind?: TopicKind, groupId?: string) => Topic;
  updateTopic: (id: string, patch: Partial<Omit<Topic, "id" | "createdAt">>) => void;
  archiveTopic: (id: string) => void;
  restoreTopic: (id: string) => void;
  deleteTopic: (id: string) => void;
  /** Seções da barra lateral — de "Projetos"/"Trabalho" fixos a qualquer nome. */
  groups: Grupo[];
  addGroup: (name: string) => Grupo;
  renameGroup: (id: string, name: string) => void;
  /** Tópicos do grupo apagado não somem — ficam sem grupo ("Outros"). */
  deleteGroup: (id: string) => void;
  addTask: (input: NewTaskInput) => Task;
  updateTask: (id: string, patch: Partial<Omit<Task, "id" | "createdAt">>) => void;
  setTaskStatus: (id: string, status: TaskStatus) => void;
  trashTask: (id: string) => void;
  restoreTask: (id: string) => void;
  purgeTask: (id: string) => void;
  emptyTrash: () => void;
  archiveTask: (id: string) => void;
  duplicateTask: (id: string) => void;
  /** Empurra uma recorrente pro próximo prazo sem marcar como concluída. */
  skipRecurrence: (id: string) => boolean;
  focusToday: string[];
  toggleFocus: (id: string) => void;
  saveWeeklyReview: (note: Omit<WeeklyReviewNote, "id" | "createdAt">) => void;
  /** Cronograma do dia — blocos de trabalho com cronômetro. */
  schedule: ScheduleBlock[];
  addBlock: (
    date: string,
    title: string,
    plannedMinutes: number,
    opcoes?: {
      topicId?: string;
      taskId?: string;
      /** Sem tempo combinado: o cronômetro conta pra cima. */
      openEnded?: boolean;
      /** Já foi feito — entra concluído, com `plannedMinutes` como tempo gasto. */
      jaFeito?: boolean;
      /** Outros projetos em que a tarefa criada também aparece. */
      extraTopicIds?: string[];
      /** Metas em que isto conta ao ser concluído. */
      metaIds?: string[];
    }
  ) => void;
  updateBlock: (id: string, patch: Partial<Omit<ScheduleBlock, "id">>) => void;
  removeBlock: (id: string) => void;
  /** Cria e já inicia um bloco de descanso no dia. */
  addBreak: (date: string, minutos: number) => void;
  /** Estica o tempo planejado do bloco (o "+" do intervalo). */
  extendPlanned: (id: string, minutos: number) => void;
  /** Preferências do quadro (sincronizam junto com o resto). */
  settings: BoardSettings;
  setParallelTimers: (valor: boolean) => void;
  startTimer: (id: string) => void;
  pauseTimer: (id: string) => void;
  /** Conclui o bloco e, se houver, a tarefa do projeto vinculada a ele. */
  finishBlock: (id: string) => void;
  /** Encerra o bloco como "não fiz" — sem mexer na tarefa do projeto. */
  skipBlockToday: (id: string) => void;
  /** Guarda o bloco pra retomar em outra hora ou outro dia. */
  parkBlockLater: (id: string) => void;
  /** Traz um bloco em espera de volta pro cronograma de hoje. */
  resumeParkedBlock: (id: string) => void;
  /** Metas diárias com prazo ("ler 2 páginas por dia durante 30 dias"). */
  metas: Meta[];
  addMeta: (input: NovaMetaInput) => Meta;
  /** Soma ou subtrai no registro de um dia da meta. */
  registrarMeta: (metaId: string, dia: string, delta: number) => void;
  arquivarMeta: (metaId: string) => void;
  /** Blocos que se repetem sozinhos, como o expediente do trabalho. */
  programacoes: Programacao[];
  addProgramacao: (input: NovaProgramacaoInput) => Programacao;
  /** Pausa ou retoma uma programação sem apagá-la. */
  alternarProgramacao: (id: string) => void;
  removerProgramacao: (id: string) => void;
  /**
   * Começa a tarefa agora: cria (ou reaproveita) o bloco de hoje e liga o
   * cronômetro. Devolve false se a tarefa não existir mais.
   */
  startTaskNow: (taskId: string) => boolean;
  reopenTimer: (id: string) => void;
  resetTimer: (id: string) => void;
  copyDay: (fromDate: string, toDate: string) => number;
  /** Última tarefa aberta em qualquer tela — alvo dos atalhos E e D. */
  rememberOpenedTask: (id: string) => void;
  getLastOpenedTaskId: () => string | null;
  exportData: () => string;
  importData: (json: string, mode: "merge" | "replace") => MergeReport | null;
  /** Sincronização com a nuvem (opcional — só ativa com usuário logado). */
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  /**
   * `null` quando o armazenamento local está bem. Quando não está, o board
   * na tela continua funcionando (em memória) mas pode não estar sendo
   * salvo — a interface precisa avisar em vez de fingir que está tudo bem.
   */
  storageError: "corrompido" | "cota-excedida" | "indisponivel" | "desconhecido" | null;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<AppContextValue["storageError"]>(null);
  // Estado, não uma leitura direta: sem isso, a virada de meia-noite só
  // aparecia na tela se alguma OUTRA coisa forçasse um re-render — o board
  // podia continuar exatamente igual (nada mudou às 00h) e "hoje" ficava
  // preso no dia de ontem até a pessoa mexer em algo.
  const [today, setToday] = useState(todayISO());

  useEffect(() => {
    // localStorage não existe no SSR; ler durante o render causaria
    // divergência de hidratação.
    const resultado = loadBoard();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBoard(resultado.board);
    if (resultado.status === "corrompido") {
      setStorageError("corrompido");
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const resultado = saveBoard(board);
    // Sucesso limpa um erro anterior (ex.: cota que foi liberada); um board
    // corrompido detectado na carga não é apagado por uma gravação normal
    // subsequente — só some quando a pessoa agir (ex.: importar de novo).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStorageError((atual) =>
      resultado.ok ? (atual === "corrompido" ? atual : null) : resultado.motivo
    );
  }, [board, ready]);

  // ── Sincronização com a nuvem (opcional) ──────────────────────────────
  const { user } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("offline");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  // Só true depois que a primeira reconciliação de UM login termina — antes
  // disso o push não pode rodar, senão a nuvem seria sobrescrita pelo board
  // local antes de a mescla acontecer.
  const initialSyncDone = useRef(false);

  // Identidade estável do login. O objeto `user` do Supabase é recriado a
  // cada evento de auth (refresh de token, foco na janela), e usá-lo como
  // dependência do efeito reiniciava a "primeira sincronização" o tempo
  // todo — era isso que fazia a reconciliação acontecer repetidamente.
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      // Sincroniza o estado local com o estado externo (login) — o caso que
      // a própria regra recomenda resolver com um efeito, não com derivação.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSyncStatus("offline");
      initialSyncDone.current = false;
      return;
    }

    setSyncStatus("syncing");
    const unsubscribe = subscribeToCloudBoard(
      userId,
      (cloud) => {
        if (!initialSyncDone.current) {
          initialSyncDone.current = true;
          setBoard((current) => {
            if (cloud === "empty") {
              // Conta nova: semeia a nuvem com o que já existe aqui.
              pushBoardToCloud(userId, current).catch(() => {});
              return current;
            }
            // Une os dois lados sem perguntar e sem descartar nada — o
            // objetivo é o aparelho novo simplesmente ficar igual aos
            // outros, não abrir uma negociação a cada login.
            const merged = mergeBoards(current, cloud).board;
            pushBoardToCloud(userId, merged).catch(() => {});
            return merged;
          });
          setSyncStatus("synced");
          setLastSyncedAt(new Date().toISOString());
          return;
        }
        setBoard(cloud === "empty" ? emptyBoard() : cloud);
        setSyncStatus("synced");
        setLastSyncedAt(new Date().toISOString());
      },
      () => setSyncStatus("error")
    );

    return () => {
      unsubscribe();
      initialSyncDone.current = false;
    };
  }, [userId]);

  /**
   * Inscreve este aparelho no push assim que houver login e permissão.
   *
   * Não basta inscrever no botão "Ativar notificações": quem já concedeu a
   * permissão antes deste recurso existir nunca vê o botão, e sem esta
   * inscrição o aparelho jamais receberia o que foi iniciado nos outros.
   * `registrarAparelho` é idempotente — reaproveita a inscrição existente.
   */
  useEffect(() => {
    if (!userId) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    void registrarAparelho();
  }, [userId]);

  /**
   * Programações: garante os blocos de hoje e fecha o expediente no horário.
   *
   * Roda ao carregar, a cada minuto e ao voltar pro app. Não depende de o app
   * estar aberto às 8h: o cronômetro guarda instantes, então materializar às
   * 9h30 produz o mesmo bloco que estaria rodando desde as 8h. A virada de
   * meia-noite também sai daqui — cada checagem usa o dia de agora.
   */
  useEffect(() => {
    if (!ready) return;
    function aplicar() {
      // Bail-out embutido do React: devolver a MESMA string quando o dia
      // não virou não gera render extra nenhum minuto — só na virada real.
      setToday((atual) => {
        const agora = todayISO();
        return agora === atual ? atual : agora;
      });
      setBoard((b) => {
        const r1 = materializarProgramacoes(b, todayISO(), Date.now());
        // Mesma checagem que abre o expediente sozinho também fecha, no
        // outro sentido, quem passou do teto de tempo do projeto e ninguém
        // voltou pra concluir.
        const r2 = autoConcluirBlocos(r1.board, Date.now());
        // Devolve o MESMO objeto quando nada mudou: sem isto, cada minuto
        // dispararia uma gravação e uma sincronização à toa.
        return r1.mudou || r2.mudou ? r2.board : b;
      });
    }
    // Primeira rodada fora do corpo do efeito, e não como setState síncrono.
    const primeira = setTimeout(aplicar, 0);
    const intervalo = setInterval(aplicar, 60_000);
    document.addEventListener("visibilitychange", aplicar);
    return () => {
      clearTimeout(primeira);
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aplicar);
    };
  }, [ready]);

  /**
   * Rede de segurança do Realtime: ao voltar pro app, relê a nuvem.
   *
   * O socket do Realtime cai sozinho — o celular congela a aba em segundo
   * plano — e, se a replicação da tabela não estiver publicada no Supabase,
   * ele nunca entrega nada. Sem isto, a tarefa criada no PC só apareceria no
   * celular quando alguém recarregasse a página na mão.
   *
   * Aqui as duas versões são UNIDAS, não substituídas: quem estava sem
   * internet pode ter criado coisa no aparelho, e trocar o quadro pelo da
   * nuvem apagaria esse trabalho sem aviso.
   */
  useEffect(() => {
    if (!userId) return;

    async function reconciliar() {
      if (document.visibilityState !== "visible") return;
      const cloud = await fetchCloudBoard(userId!);
      if (!cloud) return;
      setBoard((atual) => mergeBoards(atual, cloud).board);
      setSyncStatus("synced");
      setLastSyncedAt(new Date().toISOString());
    }

    document.addEventListener("visibilitychange", reconciliar);
    window.addEventListener("focus", reconciliar);
    window.addEventListener("online", reconciliar);
    return () => {
      document.removeEventListener("visibilitychange", reconciliar);
      window.removeEventListener("focus", reconciliar);
      window.removeEventListener("online", reconciliar);
    };
  }, [userId]);

  useEffect(() => {
    if (!ready || !userId || !initialSyncDone.current) return;
    setSyncStatus("syncing");
    const timeout = setTimeout(() => {
      pushBoardToCloud(userId, board)
        .then(() => {
          setSyncStatus("synced");
          setLastSyncedAt(new Date().toISOString());
        })
        .catch(() => setSyncStatus("error"));
    }, 1200);
    return () => clearTimeout(timeout);
  }, [board, ready, userId]);

  const addTopic = useCallback(
    (name: string, kind: TopicKind = "project", groupId?: string) => {
      // Montado ANTES de chamar setBoard: o React pode adiar o updater (duas
      // chamadas de setBoard no mesmo evento, StrictMode, atualização em
      // lote), e devolver uma variável só preenchida DENTRO do updater dava
      // `undefined` pra quem chamou mesmo com o tópico já criado de verdade.
      const topic: Topic = {
        id: uuid(),
        name: name.trim(),
        color: nextTopicColor(board.topics.length),
        kind,
        // Sem grupo escolhido, cai no primeiro que existir — só fica
        // realmente sem grupo em quadro que ainda não tem nenhum.
        groupId: groupId ?? board.groups[0]?.id,
        createdAt: new Date().toISOString(),
      };
      setBoard((b) => ({ ...b, topics: [...b.topics, topic] }));
      return topic;
    },
    [board.topics.length, board.groups]
  );

  const addGroup = useCallback(
    (name: string) => {
      const grupo: Grupo = {
        id: uuid(),
        name: name.trim(),
        order: board.groups.length === 0 ? 0 : Math.max(...board.groups.map((g) => g.order)) + 1,
        createdAt: new Date().toISOString(),
      };
      setBoard((b) => ({ ...b, groups: [...b.groups, grupo] }));
      return grupo;
    },
    [board.groups]
  );

  const renameGroup = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBoard((b) => ({
      ...b,
      groups: b.groups.map((g) => (g.id === id ? { ...g, name: trimmed } : g)),
    }));
  }, []);

  const deleteGroup = useCallback((id: string) => {
    setBoard((b) => ({
      ...b,
      groups: b.groups.filter((g) => g.id !== id),
      // Tópicos do grupo apagado não somem — ficam sem grupo ("Outros").
      topics: b.topics.map((t) => (t.groupId === id ? { ...t, groupId: undefined } : t)),
    }));
  }, []);

  const updateTopic = useCallback(
    (id: string, patch: Partial<Omit<Topic, "id" | "createdAt">>) => {
      setBoard((b) => ({
        ...b,
        topics: b.topics.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      }));
    },
    []
  );

  const archiveTopic = useCallback((id: string) => {
    setBoard((b) => ({
      ...b,
      topics: b.topics.map((t) =>
        t.id === id ? { ...t, archivedAt: new Date().toISOString() } : t
      ),
    }));
  }, []);

  const restoreTopic = useCallback((id: string) => {
    setBoard((b) => ({
      ...b,
      topics: b.topics.map((t) => (t.id === id ? { ...t, archivedAt: undefined, deletedAt: undefined } : t)),
    }));
  }, []);

  /**
   * "Excluir" some da barra lateral, mas não remove o registro do tópico —
   * só marca `deletedAt`. Removê-lo de verdade do array quebrava a
   * referência de qualquer tarefa que fosse pra lixeira junto: `topicId`
   * passava a apontar pra nada, a tarefa ficava órfã, e mesclagem/importação
   * a descartavam por não achar o tópico dela em lugar nenhum.
   */
  const deleteTopic = useCallback((id: string) => {
    const now = new Date().toISOString();
    setBoard((b) => ({
      ...b,
      topics: b.topics.map((t) => (t.id === id ? { ...t, deletedAt: now } : t)),
      // Tarefas do tópico vão pra lixeira, não somem.
      tasks: b.tasks.map((t) => (t.topicId === id ? { ...t, deletedAt: now } : t)),
    }));
  }, []);

  const addTask = useCallback((input: NewTaskInput) => {
    const task = createTask(input, uuid(), new Date().toISOString());
    setBoard((b) => ({ ...b, tasks: [...b.tasks, task] }));
    return task;
  }, []);

  const updateTask = useCallback(
    (id: string, patch: Partial<Omit<Task, "id" | "createdAt">>) => {
      setBoard((b) => ({
        ...b,
        tasks: b.tasks.map((t) =>
          t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t
        ),
      }));
    },
    []
  );

  /**
   * Concluir carimba completedAt uma vez; reabrir remove.
   *
   * Se a tarefa é recorrente, a próxima ocorrência nasce aqui — uma única
   * vez. A trava é `recurrenceSpawned`, não o `completedAt`: reabrir limpa
   * o completedAt, então usá-lo como trava deixaria "reabrir e concluir de
   * novo" criar uma ocorrência duplicada.
   */
  const setTaskStatus = useCallback((id: string, status: TaskStatus) => {
    const now = new Date().toISOString();
    if (status === "done") {
      // Mesma função que finishBlock/autoConcluirBlocos/"já fiz" chamam —
      // concluir pelo quadro, pelo cronograma ou sozinho por tempo dá
      // sempre o mesmo resultado (recorrência, metas, completedAt).
      setBoard((b) => concluirTarefaNoBoard(b, id, now, todayISO(), uuid));
      return;
    }
    setBoard((b) => ({
      ...b,
      tasks: b.tasks.map((t) => (t.id === id ? { ...t, status, completedAt: undefined, updatedAt: now } : t)),
    }));
  }, []);

  const trashTask = useCallback((id: string) => {
    const now = new Date().toISOString();
    setBoard((b) => ({
      ...b,
      tasks: b.tasks.map((t) => (t.id === id ? { ...t, deletedAt: now, updatedAt: now } : t)),
    }));
  }, []);

  const restoreTask = useCallback((id: string) => {
    setBoard((b) => ({
      ...b,
      tasks: b.tasks.map((t) =>
        t.id === id
          ? { ...t, deletedAt: undefined, archivedAt: undefined, updatedAt: new Date().toISOString() }
          : t
      ),
    }));
  }, []);

  const purgeTask = useCallback((id: string) => {
    setBoard((b) => {
      pushBackup(b, "exclusão definitiva de tarefa");
      return { ...b, tasks: b.tasks.filter((t) => t.id !== id) };
    });
  }, []);

  const emptyTrash = useCallback(() => {
    setBoard((b) => {
      pushBackup(b, "esvaziar lixeira");
      return { ...b, tasks: b.tasks.filter((t) => !t.deletedAt) };
    });
  }, []);

  const archiveTask = useCallback((id: string) => {
    const now = new Date().toISOString();
    setBoard((b) => ({
      ...b,
      tasks: b.tasks.map((t) => (t.id === id ? { ...t, archivedAt: now, updatedAt: now } : t)),
    }));
  }, []);

  const skipRecurrence = useCallback(
    (id: string) => {
      const target = board.tasks.find((t) => t.id === id);
      const next = target ? skipOccurrence(target) : null;
      if (!next) return false;
      setBoard((b) => ({ ...b, tasks: b.tasks.map((t) => (t.id === id ? next : t)) }));
      return true;
    },
    [board.tasks]
  );

  const duplicateTask = useCallback((id: string) => {
    setBoard((b) => {
      const original = b.tasks.find((t) => t.id === id);
      if (!original) return b;
      const now = new Date().toISOString();
      const copy: Task = {
        ...original,
        id: uuid(),
        title: `${original.title} (cópia)`,
        status: "todo",
        completedAt: undefined,
        deletedAt: undefined,
        archivedAt: undefined,
        // A cópia é uma série nova: se herdasse `true` de uma original já
        // concluída, a corrente de recorrência dela nasceria travada, sem
        // nunca gerar a primeira próxima ocorrência.
        recurrenceSpawned: false,
        createdAt: now,
        updatedAt: now,
      };
      return { ...b, tasks: [...b.tasks, copy] };
    });
  }, []);

  const focusToday = useMemo(() => board.dailyFocus[today] ?? [], [board.dailyFocus, today]);

  const toggleFocus = useCallback(
    (id: string) => {
      setBoard((b) => {
        const current = b.dailyFocus[today] ?? [];
        const next = current.includes(id)
          ? current.filter((x) => x !== id)
          : current.length >= 3
            ? current
            : [...current, id];
        return { ...b, dailyFocus: { ...b.dailyFocus, [today]: next } };
      });
    },
    [today]
  );

  const saveWeeklyReview = useCallback(
    (note: Omit<WeeklyReviewNote, "id" | "createdAt">) => {
      setBoard((b) => {
        const entry: WeeklyReviewNote = {
          ...note,
          id: uuid(),
          createdAt: new Date().toISOString(),
        };
        const others = b.weeklyReviews.filter((w) => w.weekStart !== note.weekStart);
        return { ...b, weeklyReviews: [entry, ...others] };
      });
    },
    []
  );

  // Ref, não state: os atalhos só precisam ler o valor atual no momento da
  // tecla — guardar em state re-renderizaria o app a cada tarefa aberta.
  const lastOpenedTask = useRef<string | null>(null);
  const rememberOpenedTask = useCallback((id: string) => {
    lastOpenedTask.current = id;
  }, []);
  const getLastOpenedTaskId = useCallback(() => lastOpenedTask.current, []);

  // ── Cronograma ────────────────────────────────────────────────────────
  /**
   * Cria o bloco do dia. Com `topicId`, cria TAMBÉM a tarefa no projeto e
   * guarda o vínculo — "Chamar leads" precisa existir nos dois lugares, e
   * digitar duas vezes é justamente o trabalho que o app deveria poupar.
   */
  const addBlock = useCallback(
    (
      date: string,
      title: string,
      plannedMinutes: number,
      opcoes?: {
        topicId?: string;
        taskId?: string;
        openEnded?: boolean;
        jaFeito?: boolean;
        extraTopicIds?: string[];
        metaIds?: string[];
      }
    ) => {
      const blockId = uuid();
      const novaTarefaId = uuid();
      const now = new Date().toISOString();

      setBoard((b) => {
        const doDia = b.schedule.filter((x) => x.date === date);
        const nextOrder = doDia.length === 0 ? 0 : Math.max(...doDia.map((x) => x.order)) + 1;
        // Projeto ou tarefa que sumiram entre escolher e salvar não podem
        // virar vínculo quebrado — sem eles o bloco fica simplesmente solto.
        const topico = opcoes?.topicId
          ? b.topics.find((t) => t.id === opcoes.topicId)
          : undefined;
        const existente = opcoes?.taskId
          ? b.tasks.find((t) => t.id === opcoes.taskId && !t.deletedAt)
          : undefined;

        const criarTarefa = !!topico && !existente;
        const block: ScheduleBlock = {
          id: blockId,
          date,
          title: title.trim(),
          plannedMinutes,
          accumulatedMs: 0,
          order: nextOrder,
          topicId: existente?.topicId ?? topico?.id,
          taskId: existente?.id ?? (criarTarefa ? novaTarefaId : undefined),
          openEnded: opcoes?.openEnded ? true : undefined,
          // Sem tarefa (bloco solto), as metas moram no próprio bloco. Com
          // tarefa, moram nela — guardar nos dois abriria "qual vale?".
          metaIds:
            !existente && !criarTarefa && opcoes?.metaIds?.length ? opcoes.metaIds : undefined,
          // Registrar o que já foi feito: o bloco nasce concluído, com o
          // tempo informado já contado.
          ...(opcoes?.jaFeito ? completedBlockData(plannedMinutes, now) : {}),
        };

        if (!criarTarefa) {
          let proximo = { ...b, schedule: [...b.schedule, block] };
          if (opcoes?.jaFeito) {
            // "Já fiz" com uma tarefa que já existia no projeto marcava só o
            // bloco — a tarefa continuava em aberto no quadro, como se nada
            // tivesse acontecido. Mesma conclusão de qualquer outro caminho,
            // recorrência inclusive.
            if (existente) {
              proximo = concluirTarefaNoBoard(proximo, existente.id, now, date, uuid);
            }
            // Conta na meta no dia do BLOCO, que é o dia em que foi feito —
            // pode não ser hoje, se a pessoa estiver registrando um dia atrás.
            proximo = aplicarMetasDoBloco(proximo, block, date);
          }
          return proximo;
        }

        const task = createTask(
          {
            topicId: topico.id,
            title: title.trim(),
            // Bloco registrado depois já nasce feito dos dois lados: separar
            // obrigaria a marcar de novo no projeto o que já aconteceu.
            status: opcoes?.jaFeito ? "done" : "todo",
            estimatedMinutes: opcoes?.openEnded ? undefined : plannedMinutes,
            // O principal nunca entra como extra: seria a mesma tarefa
            // contada duas vezes no mesmo projeto.
            extraTopicIds: opcoes?.extraTopicIds?.some((id) => id !== topico.id)
              ? opcoes.extraTopicIds.filter((id) => id !== topico.id)
              : undefined,
            metaIds: opcoes?.metaIds?.length ? opcoes.metaIds : undefined,
          },
          novaTarefaId,
          now
        );
        // `createTask` já carimba `completedAt` sozinho quando nasce "done".
        const proximo = { ...b, tasks: [...b.tasks, task], schedule: [...b.schedule, block] };
        return opcoes?.jaFeito ? aplicarMetasDoBloco(proximo, block, date) : proximo;
      });
    },
    []
  );

  const updateBlock = useCallback(
    (id: string, patch: Partial<Omit<ScheduleBlock, "id">>) => {
      setBoard((b) => ({
        ...b,
        schedule: b.schedule.map((x) => (x.id === id ? { ...x, ...patch } : x)),
      }));
    },
    []
  );

  /**
   * Intervalo: cria o bloco de descanso e já liga o cronômetro, porque quem
   * aperta "Intervalo" já está de pé — pedir um segundo toque pra começar
   * seria contar errado justamente os primeiros minutos.
   */
  const addBreak = useCallback((date: string, minutos: number) => {
    const id = uuid();
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    setBoard((b) => {
      const doDia = b.schedule.filter((x) => x.date === date);
      const nextOrder = doDia.length === 0 ? 0 : Math.max(...doDia.map((x) => x.order)) + 1;
      const bloco: ScheduleBlock = {
        id,
        date,
        title: "Intervalo",
        plannedMinutes: minutos,
        accumulatedMs: 0,
        order: nextOrder,
        isBreak: true,
        startedAt: nowIso,
      };
      return {
        ...b,
        // Descansar pausa o que estava rodando — senão o trabalho continuaria
        // contando durante o café. Em modo paralelo a decisão é de quem está
        // usando, e aqui também não se pausa nada por conta própria.
        schedule: [
          ...b.schedule.map((x) =>
            b.settings?.parallelTimers !== true && x.startedAt && !x.completedAt
              ? pauseBlock(x, nowMs)
              : x
          ),
          bloco,
        ],
      };
    });
  }, []);

  const setParallelTimers = useCallback((valor: boolean) => {
    setBoard((b) => ({ ...b, settings: { ...b.settings, parallelTimers: valor } }));
  }, []);

  const extendPlanned = useCallback((id: string, minutos: number) => {
    setBoard((b) => ({
      ...b,
      schedule: b.schedule.map((x) => (x.id === id ? extendBlock(x, minutos) : x)),
    }));
  }, []);

  const removeBlock = useCallback((id: string) => {
    setBoard((b) => {
      const alvo = b.schedule.find((x) => x.id === id);
      const schedule = b.schedule.filter((x) => x.id !== id);
      if (!alvo?.programacaoId) return { ...b, schedule };
      // Apagar o bloco de uma programação é tirar o dia (feriado, folga).
      // Registra o dia como pulado — senão a checagem do próximo minuto
      // recriaria o bloco e seria impossível tirar o dia de folga.
      return {
        ...b,
        schedule,
        programacoes: (b.programacoes ?? []).map((p) =>
          p.id === alvo.programacaoId
            ? { ...p, diasPulados: [...new Set([...(p.diasPulados ?? []), alvo.date])] }
            : p
        ),
      };
    });
  }, []);

  /**
   * Liga o cronômetro de um bloco.
   *
   * Por padrão pausa o que estiver rodando: quem aperta "Começar" quase
   * sempre está TROCANDO de tarefa, e dois relógios somando o mesmo minuto
   * fariam o total do dia significar menos. Mas trabalhar em duas coisas de
   * verdade ao mesmo tempo existe — com `parallelTimers` ligado nada é
   * pausado, e a tela avisa que o total passou a somar em paralelo.
   */
  const startTimer = useCallback((id: string) => {
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    setBoard((b) => {
      // Acesso defensivo: um board que por qualquer motivo chegue sem
      // `settings` faria este updater lançar, e o efeito visível seria o
      // "Começar" parar de funcionar sem nenhum erro na tela.
      const paralelo = b.settings?.parallelTimers === true;
      const block = b.schedule.find((x) => x.id === id);
      // Ligar o cronômetro move a tarefa do projeto pra "Fazendo": é a mesma
      // informação dita duas vezes, e arrastar o cartão à mão depois de já
      // ter apertado "Começar" é trabalho que o app pode poupar.
      const vinculada = block?.taskId
        ? b.tasks.find((t) => t.id === block.taskId && t.status === "todo")
        : undefined;

      return {
        ...b,
        schedule: b.schedule.map((x) => {
          if (x.id === id) return startBlock(x, nowIso);
          if (paralelo) return x;
          return x.startedAt && !x.completedAt ? pauseBlock(x, nowMs) : x;
        }),
        tasks: vinculada
          ? b.tasks.map((t) =>
              t.id === vinculada.id
                ? { ...t, status: "doing" as const, updatedAt: nowIso }
                : t
            )
          : b.tasks,
      };
    });
  }, []);

  const pauseTimer = useCallback((id: string) => {
    const nowMs = Date.now();
    setBoard((b) => ({
      ...b,
      schedule: b.schedule.map((x) => (x.id === id ? pauseBlock(x, nowMs) : x)),
    }));
  }, []);

  /**
   * Conclui o bloco e, se ele veio de um projeto, conclui a tarefa junto.
   *
   * Quem chama decide o que dizer e o que oferecer como desfazer — a
   * informação de qual tarefa foi afetada já está no próprio bloco, e tentar
   * devolvê-la daqui não funcionaria: o corpo do `setBoard` só roda na
   * renderização seguinte, então o valor sairia sempre vazio.
   */
  const finishBlock = useCallback((id: string) => {
    const nowIso = new Date().toISOString();
    const dia = todayISO();
    setBoard((b) => {
      const block = b.schedule.find((x) => x.id === id);
      let proximo = {
        ...b,
        schedule: b.schedule.map((x) => (x.id === id ? completeBlock(x, nowIso) : x)),
      };
      // Mesma função de conclusão usada em qualquer outro caminho — sem
      // isso, concluir uma tarefa recorrente PELO CRONOGRAMA não gerava a
      // próxima ocorrência (só concluir pelo quadro gerava).
      if (block?.taskId) {
        proximo = concluirTarefaNoBoard(proximo, block.taskId, nowIso, dia, uuid);
      }
      // Concluir o bloco marca o dia nas metas dele e nas da tarefa que ele
      // carrega. Não depende de a tarefa estar mudando pra feita: um bloco sem
      // projeto também conta, e marcar de novo é inofensivo (vale o maior).
      return block ? aplicarMetasDoBloco(proximo, block, dia) : proximo;
    });
  }, []);

  /**
   * "Não fiz" encerra o bloco sem tocar na tarefa do projeto.
   *
   * Concluir move a tarefa pra "Feito"; aqui não há nada a mover — a tarefa
   * continua exatamente onde estava, esperando outro dia. Zerar o status de
   * volta pra "A fazer" também seria errado: se o cronômetro chegou a rodar,
   * a tarefa começou de verdade.
   */
  /**
   * O caminho inverso do "escolher tarefa no cronograma": a tarefa mora no
   * projeto até o dia de fazer, e nesse dia um toque em "Iniciar" a coloca no
   * cronograma de hoje já rodando.
   *
   * Sem estimativa, o bloco nasce de tempo livre: uma duração inventada aqui
   * viraria "passou do tempo" quinze minutos depois, sem que ninguém tivesse
   * combinado quinze minutos.
   */
  const startTaskNow = useCallback(
    (taskId: string) => {
      // Decisão tomada aqui, fora do updater, com o board que o componente
      // já tem na mão — devolver um booleano preenchido só DENTRO do
      // updater dava sempre `false` quando o React adiava a execução dele.
      const task = board.tasks.find((t) => t.id === taskId && !t.deletedAt);
      if (!task) return false;

      const nowIso = new Date().toISOString();
      const nowMs = Date.now();
      const hoje = todayISO();
      const paralelo = board.settings?.parallelTimers === true;
      // Reaproveita o bloco de hoje que já existe pra esta tarefa: criar
      // outro faria dois cronômetros contarem o mesmo trabalho.
      const existente = board.schedule.find(
        (x) => x.date === hoje && x.taskId === taskId && !x.completedAt && !x.skippedAt
      );
      const novoBlocoId = uuid();
      const alvo = existente?.id ?? novoBlocoId;
      const doDia = board.schedule.filter((x) => x.date === hoje);
      const proximaOrdem = doDia.length === 0 ? 0 : Math.max(...doDia.map((x) => x.order)) + 1;

      setBoard((b) => {
        const schedule = existente
          ? b.schedule
          : [
              ...b.schedule,
              {
                id: novoBlocoId,
                date: hoje,
                title: task.title,
                plannedMinutes: task.estimatedMinutes ?? 30,
                accumulatedMs: 0,
                order: proximaOrdem,
                topicId: task.topicId,
                taskId: task.id,
                openEnded: task.estimatedMinutes === undefined ? true : undefined,
              } satisfies ScheduleBlock,
            ];

        return {
          ...b,
          schedule: schedule.map((x) => {
            if (x.id === alvo) return startBlock(x, nowIso);
            if (paralelo) return x;
            return x.startedAt && !x.completedAt ? pauseBlock(x, nowMs) : x;
          }),
          tasks:
            task.status === "todo"
              ? b.tasks.map((t) =>
                  t.id === taskId ? { ...t, status: "doing" as const, updatedAt: nowIso } : t
                )
              : b.tasks,
        };
      });

      return true;
    },
    [board.tasks, board.schedule, board.settings]
  );

  const skipBlockToday = useCallback((id: string) => {
    const nowIso = new Date().toISOString();
    setBoard((b) => ({
      ...b,
      schedule: b.schedule.map((x) => (x.id === id ? skipBlock(x, nowIso) : x)),
    }));
  }, []);

  /**
   * Guarda pra depois sem mexer na tarefa do projeto: ela começou e não
   * terminou, então "Fazendo" continua sendo a verdade.
   */
  const parkBlockLater = useCallback((id: string) => {
    const nowIso = new Date().toISOString();
    setBoard((b) => ({
      ...b,
      schedule: b.schedule.map((x) => (x.id === id ? parkBlock(x, nowIso) : x)),
    }));
  }, []);

  const resumeParkedBlock = useCallback((id: string) => {
    const nowIso = new Date().toISOString();
    const hoje = todayISO();
    const novoId = uuid();
    setBoard((b) => {
      const block = b.schedule.find((x) => x.id === id);
      // Retomar duas vezes não pode criar duas continuações do mesmo bloco.
      if (!block || !block.parkedAt || block.resumedAt) return b;
      const doDia = b.schedule.filter((x) => x.date === hoje);
      const proxima = doDia.length === 0 ? 0 : Math.max(...doDia.map((x) => x.order)) + 1;
      const { antigo, novo } = retomarBloco(block, hoje, nowIso, novoId, proxima);
      const schedule = b.schedule.map((x) => (x.id === id ? antigo : x));
      return { ...b, schedule: novo ? [...schedule, novo] : schedule };
    });
  }, []);

  const reopenTimer = useCallback((id: string) => {
    setBoard((b) => ({
      ...b,
      schedule: b.schedule.map((x) => (x.id === id ? reopenBlock(x) : x)),
    }));
  }, []);

  const resetTimer = useCallback((id: string) => {
    setBoard((b) => ({
      ...b,
      schedule: b.schedule.map((x) => (x.id === id ? resetBlock(x) : x)),
    }));
  }, []);

  // ── Metas ──────────────────────────────────────────────────────────────
  const addMeta = useCallback((input: NovaMetaInput) => {
    const meta = novaMeta(input, uuid(), new Date().toISOString());
    setBoard((b) => ({ ...b, metas: [...(b.metas ?? []), meta] }));
    return meta;
  }, []);

  const registrarMeta = useCallback((metaId: string, dia: string, delta: number) => {
    setBoard((b) => ({
      ...b,
      metas: (b.metas ?? []).map((m) => (m.id === metaId ? registrarNaMeta(m, dia, delta) : m)),
    }));
  }, []);

  /** Arquiva sem apagar: o histórico de dias batidos é justamente o que se quer rever. */
  const arquivarMeta = useCallback((metaId: string) => {
    const nowIso = new Date().toISOString();
    setBoard((b) => ({
      ...b,
      metas: (b.metas ?? []).map((m) => (m.id === metaId ? { ...m, archivedAt: nowIso } : m)),
    }));
  }, []);

  // ── Programações ───────────────────────────────────────────────────────
  const addProgramacao = useCallback((input: NovaProgramacaoInput) => {
    const programacao = novaProgramacao(input, uuid(), new Date().toISOString());
    setBoard((b) => {
      const comNova = { ...b, programacoes: [...(b.programacoes ?? []), programacao] };
      // Materializa na hora: quem acabou de programar quer ver o bloco de
      // hoje aparecer, não esperar a próxima checagem de minuto.
      return materializarProgramacoes(comNova, todayISO(), Date.now()).board;
    });
    return programacao;
  }, []);

  const alternarProgramacao = useCallback((id: string) => {
    const nowIso = new Date().toISOString();
    setBoard((b) => ({
      ...b,
      programacoes: (b.programacoes ?? []).map((p) =>
        p.id === id ? { ...p, pausedAt: p.pausedAt ? undefined : nowIso } : p
      ),
    }));
  }, []);

  /** Para de gerar blocos novos; os dias que já aconteceram ficam no histórico. */
  const removerProgramacao = useCallback((id: string) => {
    setBoard((b) => ({
      ...b,
      programacoes: (b.programacoes ?? []).filter((p) => p.id !== id),
    }));
  }, []);

  /**
   * Copia a estrutura de um dia pro outro, com os cronômetros zerados.
   *
   * Aditiva de propósito: nunca apaga um bloco que já exista no dia de
   * destino. A UI só oferece o botão num dia vazio, mas a função não
   * depende disso pra ser segura — um bloco chegado de outro aparelho
   * bem na hora não pode ser descartado por uma cópia.
   */
  const copyDay = useCallback(
    (fromDate: string, toDate: string) => {
      const origem = board.schedule.filter((x) => x.date === fromDate);
      if (origem.length === 0) return 0;
      const doDestino = board.schedule.filter((x) => x.date === toDate);
      const primeiraOrdem = doDestino.length === 0 ? 0 : Math.max(...doDestino.map((x) => x.order)) + 1;
      const novos: ScheduleBlock[] = origem.map((x, i) => ({
        id: uuid(),
        date: toDate,
        title: x.title,
        plannedMinutes: x.plannedMinutes,
        accumulatedMs: 0,
        order: primeiraOrdem + i,
        // Continua sendo a mesma NATUREZA de bloco — intervalo, tempo livre,
        // vínculo de projeto/tarefa/meta — só o cronômetro é que zera.
        // `programacaoId` fica de fora: a cópia não é a ocorrência gerada
        // pela programação daquele dia.
        topicId: x.topicId,
        taskId: x.taskId,
        metaIds: x.metaIds,
        isBreak: x.isBreak,
        openEnded: x.openEnded,
      }));
      setBoard((b) => ({ ...b, schedule: [...b.schedule, ...novos] }));
      return origem.length;
    },
    [board.schedule]
  );

  const exportData = useCallback(() => JSON.stringify(board, null, 2), [board]);

  const importData = useCallback(
    (json: string, mode: "merge" | "replace"): MergeReport | null => {
      const validation = validateBackup(json);
      if (!validation.valid) return null;
      const incoming = migrateBoard(JSON.parse(json));

      if (mode === "replace") {
        const report: MergeReport = {
          topicsAdded: incoming.topics.length,
          tasksAdded: incoming.tasks.length,
          groupsAdded: (incoming.groups ?? []).length,
          scheduleAdded: incoming.schedule.length,
          weeklyReviewsAdded: incoming.weeklyReviews.length,
          metasAdded: (incoming.metas ?? []).length,
          programacoesAdded: (incoming.programacoes ?? []).length,
          dailyFocusAdded: Object.keys(incoming.dailyFocus ?? {}).length,
          duplicatesSkipped: 0,
        };
        setBoard((b) => {
          pushBackup(b, "importação (substituir)");
          return incoming;
        });
        return report;
      }

      // Calculado aqui, contra o board que o componente já tem — devolver
      // um relatório preenchido só DENTRO do updater dava contagem zerada
      // (a tela dizia "nada foi importado" mesmo com a mesclagem aplicada).
      pushBackup(board, "importação (mesclar)");
      const merged = mergeImportedData(board, incoming);
      // No raríssimo caso de o board ter mudado entre o render e este
      // clique, recalcula contra a versão de verdade em vez de sobrescrever
      // uma mudança concorrente com um resultado desatualizado.
      setBoard((b) => (b === board ? merged.board : mergeImportedData(b, incoming).board));
      return merged.report;
    },
    [board]
  );

  const value = useMemo<AppContextValue>(
    () => ({
      topics: board.topics,
      tasks: board.tasks,
      board,
      ready,
      addTopic,
      updateTopic,
      archiveTopic,
      restoreTopic,
      deleteTopic,
      groups: board.groups ?? [],
      addGroup,
      renameGroup,
      deleteGroup,
      addTask,
      updateTask,
      setTaskStatus,
      trashTask,
      restoreTask,
      purgeTask,
      emptyTrash,
      archiveTask,
      duplicateTask,
      skipRecurrence,
      focusToday,
      toggleFocus,
      saveWeeklyReview,
      schedule: board.schedule,
      addBlock,
      addBreak,
      extendPlanned,
      setParallelTimers,
      settings: board.settings ?? { parallelTimers: false },
      updateBlock,
      removeBlock,
      startTimer,
      pauseTimer,
      finishBlock,
      skipBlockToday,
      parkBlockLater,
      resumeParkedBlock,
      startTaskNow,
      reopenTimer,
      resetTimer,
      copyDay,
      rememberOpenedTask,
      getLastOpenedTaskId,
      exportData,
      importData,
      metas: board.metas ?? [],
      addMeta,
      registrarMeta,
      arquivarMeta,
      programacoes: board.programacoes ?? [],
      addProgramacao,
      alternarProgramacao,
      removerProgramacao,
      syncStatus,
      lastSyncedAt,
      storageError,
    }),
    [
      board,
      ready,
      addTopic,
      updateTopic,
      archiveTopic,
      restoreTopic,
      deleteTopic,
      addGroup,
      renameGroup,
      deleteGroup,
      addTask,
      updateTask,
      setTaskStatus,
      trashTask,
      restoreTask,
      purgeTask,
      emptyTrash,
      archiveTask,
      duplicateTask,
      skipRecurrence,
      focusToday,
      toggleFocus,
      saveWeeklyReview,
      addBlock,
      addBreak,
      extendPlanned,
      setParallelTimers,
      updateBlock,
      removeBlock,
      startTimer,
      pauseTimer,
      finishBlock,
      skipBlockToday,
      parkBlockLater,
      resumeParkedBlock,
      startTaskNow,
      reopenTimer,
      resetTimer,
      copyDay,
      rememberOpenedTask,
      getLastOpenedTaskId,
      exportData,
      importData,
      addMeta,
      registrarMeta,
      arquivarMeta,
      addProgramacao,
      alternarProgramacao,
      removerProgramacao,
      syncStatus,
      lastSyncedAt,
      storageError,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
