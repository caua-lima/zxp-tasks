import { doc, onSnapshot, setDoc, Unsubscribe } from "firebase/firestore";
import { db } from "./firebase";
import { Board } from "./types";
import { migrateBoard } from "./task-migrations";

function boardDocRef(uid: string) {
  if (!db) throw new Error("Firestore não está configurado.");
  return doc(db, "usuarios", uid, "zxpTasks", "board");
}

/**
 * Sanitiza o board antes de mandar pro Firestore.
 *
 * `Task`/`Topic` têm vários campos opcionais que na prática viram
 * `undefined` explícito (`completedAt: undefined` ao reabrir, por exemplo).
 * O SDK do Firestore lança erro em qualquer campo `undefined` — o
 * round-trip por `JSON` remove essas chaves (é como o board já é
 * serializado pro localStorage, então não é comportamento novo).
 */
function sanitize(board: Board): Record<string, unknown> {
  return JSON.parse(JSON.stringify(board));
}

export async function pushBoardToCloud(uid: string, board: Board): Promise<void> {
  await setDoc(boardDocRef(uid), sanitize(board));
}

/**
 * Assina o documento da nuvem. `onChange` recebe `"empty"` quando o
 * documento ainda não existe (conta nova, nunca sincronizou) — quem chama
 * decide se semeia a nuvem ou pergunta ao usuário.
 *
 * Ignora snapshots com `hasPendingWrites`: são o eco da própria escrita
 * optimista deste cliente, não uma mudança vinda de outro aparelho — sem
 * esse filtro, cada push local disparava um "novo dado da nuvem" falso.
 */
export function subscribeToCloudBoard(
  uid: string,
  onChange: (board: Board | "empty") => void,
  onError: (error: unknown) => void
): Unsubscribe {
  return onSnapshot(
    boardDocRef(uid),
    (snap) => {
      if (snap.metadata.hasPendingWrites) return;
      if (!snap.exists()) {
        onChange("empty");
        return;
      }
      onChange(migrateBoard(snap.data()));
    },
    onError
  );
}
