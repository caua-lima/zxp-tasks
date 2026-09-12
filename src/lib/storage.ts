import { Board, emptyBoard } from "./types";
import { migrateBoard } from "./task-migrations";

const STORAGE_KEY = "tarefas-zxp:board:v1";
const BACKUP_KEY = "zxp-tasks:backups";
const MAX_BACKUPS = 5;
/** Prefixo de onde o conteúdo bruto que não deu pra ler fica preservado. */
const RECUPERACAO_PREFIX = "tarefas-zxp:board:v1:corrompido:";

export interface StoredBackup {
  createdAt: string;
  reason: string;
  data: string;
}

export type ResultadoDeCarga =
  | { status: "ok"; board: Board }
  | { status: "vazio"; board: Board }
  /**
   * `bruto` é o texto exatamente como estava salvo — quem chama decide o
   * que fazer (mostrar aviso, guardar cópia de recuperação). `board` já
   * vem como um quadro vazio pronto pra usar, porque o app precisa
   * continuar funcionando mesmo com o dado antigo ilegível.
   */
  | { status: "corrompido"; board: Board; bruto: string };

/**
 * Só a leitura: separado de `loadBoard` porque não depende de `window` — dá
 * pra testar com qualquer string, sem mockar `localStorage`.
 */
export function interpretarConteudoSalvo(raw: string | null): ResultadoDeCarga {
  if (raw === null) return { status: "vazio", board: emptyBoard() };
  try {
    return { status: "ok", board: migrateBoard(JSON.parse(raw)) };
  } catch {
    // Não é "vazio" nem "válido" — é ilegível. Fingir vazio aqui é o que
    // fazia o efeito seguinte gravar um board vazio por cima da única
    // cópia do que deu errado, sem chance de recuperação.
    return { status: "corrompido", board: emptyBoard(), bruto: raw };
  }
}

export function loadBoard(): ResultadoDeCarga {
  if (typeof window === "undefined") return { status: "vazio", board: emptyBoard() };
  const resultado = interpretarConteudoSalvo(window.localStorage.getItem(STORAGE_KEY));
  if (resultado.status === "corrompido") {
    // Guarda o bruto antes de qualquer coisa escrever por cima da chave
    // principal — mesmo que a gravação de recuperação falhe (cota cheia),
    // o app não perde nada que já não tivesse perdido de qualquer jeito.
    try {
      window.localStorage.setItem(`${RECUPERACAO_PREFIX}${new Date().toISOString()}`, resultado.bruto);
    } catch {
      // Sem espaço nem pra guardar a cópia de recuperação: segue o jogo.
    }
  }
  return resultado;
}

export type MotivoDaFalha = "cota-excedida" | "indisponivel" | "desconhecido";

export type ResultadoDeGravacao = { ok: true } | { ok: false; motivo: MotivoDaFalha };

/**
 * Só a classificação do erro: pura, testável sem precisar derrubar o
 * `localStorage` de verdade pra simular cota cheia.
 */
export function classificarErroDeGravacao(erro: unknown): MotivoDaFalha {
  if (
    erro instanceof DOMException &&
    (erro.name === "QuotaExceededError" ||
      erro.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      erro.code === 22 ||
      erro.code === 1014)
  ) {
    return "cota-excedida";
  }
  return "desconhecido";
}

/**
 * Nunca lança: uma gravação que falha dentro do `useEffect` do React
 * derrubava a árvore inteira sem nenhum Error Boundary pra pegar. Quem
 * chama decide como mostrar o erro (banner, toast) e pode tentar de novo.
 */
export function saveBoard(board: Board): ResultadoDeGravacao {
  if (typeof window === "undefined") return { ok: true };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
    return { ok: true };
  } catch (erro) {
    return { ok: false, motivo: classificarErroDeGravacao(erro) };
  }
}

export function listBackups(): StoredBackup[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BACKUP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredBackup[]) : [];
  } catch {
    return [];
  }
}

/** Snapshot local antes de operação destrutiva (importar, esvaziar lixeira). */
export function pushBackup(board: Board, reason: string) {
  if (typeof window === "undefined") return;
  const backups = listBackups();
  backups.unshift({
    createdAt: new Date().toISOString(),
    reason,
    data: JSON.stringify(board),
  });
  try {
    window.localStorage.setItem(BACKUP_KEY, JSON.stringify(backups.slice(0, MAX_BACKUPS)));
  } catch {
    // Cota estourada: perder um snapshot é aceitável, perder o quadro não.
  }
}

export function lastBackupDate(): string | null {
  return listBackups()[0]?.createdAt ?? null;
}
