import { supabase } from "./supabase";
import { Board } from "./types";
import { migrateBoard } from "./task-migrations";

const TABLE = "boards";

/**
 * Sanitiza o board antes de mandar pro banco.
 *
 * `Task`/`Topic` têm vários campos opcionais que na prática viram
 * `undefined` explícito (`completedAt: undefined` ao reabrir, por exemplo).
 * `undefined` não existe em JSON — o round-trip remove essas chaves e evita
 * que virem `null` no jsonb, que a migração teria que tratar depois.
 */
function sanitize(board: Board): Record<string, unknown> {
  return JSON.parse(JSON.stringify(board));
}

/**
 * Assinatura do último payload que ESTE cliente escreveu.
 *
 * O Realtime do Supabase devolve as próprias escritas de volta (não existe
 * equivalente ao `hasPendingWrites` do Firestore). Sem esta comparação,
 * cada push local voltaria como se fosse "mudança vinda de outro aparelho"
 * e reescreveria o estado no meio da digitação.
 */
let lastPushed: string | null = null;

export async function pushBoardToCloud(uid: string, board: Board): Promise<void> {
  if (!supabase) throw new Error("Supabase não está configurado.");
  const payload = sanitize(board);
  lastPushed = JSON.stringify(payload);

  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: uid,
      data: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) throw error;
}

/**
 * Lê o board da nuvem e fica ouvindo mudanças.
 *
 * `onChange` recebe `"empty"` quando o usuário ainda não tem linha na
 * tabela (conta nova, nunca sincronizou) — quem chama decide se semeia a
 * nuvem ou pergunta ao usuário. Devolve a função que cancela a assinatura.
 */
export function subscribeToCloudBoard(
  uid: string,
  onChange: (board: Board | "empty") => void,
  onError: (error: unknown) => void
): () => void {
  if (!supabase) {
    onError(new Error("Supabase não está configurado."));
    return () => {};
  }

  // Alias não-nulo: o TypeScript não consegue provar que o `supabase`
  // exportado do módulo continua não-nulo dentro dos callbacks assíncronos.
  const client = supabase;
  let cancelled = false;

  client
    .from(TABLE)
    .select("data")
    .eq("user_id", uid)
    .maybeSingle()
    .then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        onError(error);
        return;
      }
      onChange(data?.data ? migrateBoard(data.data) : "empty");
    });

  const channel = client
    .channel(`boards:${uid}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: TABLE, filter: `user_id=eq.${uid}` },
      (payload) => {
        if (cancelled) return;
        const raw = (payload.new as { data?: unknown } | null)?.data;
        if (!raw) return;
        // Eco da própria escrita: ignora pra não sobrescrever o que o
        // usuário está digitando neste exato aparelho.
        if (JSON.stringify(raw) === lastPushed) return;
        onChange(migrateBoard(raw));
      }
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        onError(new Error(`Realtime: ${status}`));
      }
    });

  return () => {
    cancelled = true;
    client.removeChannel(channel);
  };
}
