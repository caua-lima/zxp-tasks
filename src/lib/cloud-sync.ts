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
 * Assinatura canônica: JSON com as chaves de cada objeto em ordem.
 *
 * `JSON.stringify` puro não serve para comparar com o que volta do banco.
 * O `jsonb` do Postgres não guarda a ordem das chaves — ele devolve o
 * objeto reordenado, então a comparação textual dava "diferente" mesmo
 * quando o conteúdo era idêntico.
 */
function assinatura(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(assinatura).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${assinatura(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Assinatura do conteúdo que já está sincronizado com a nuvem.
 *
 * O Realtime do Supabase devolve as próprias escritas de volta (não existe
 * equivalente ao `hasPendingWrites` do Firestore). Sem esta comparação,
 * cada push local voltava como se fosse "mudança vinda de outro aparelho"
 * e reescrevia o board inteiro ~2s depois de cada alteração — no meio da
 * digitação, inclusive.
 */
let ultimoSincronizado: string | null = null;

export async function pushBoardToCloud(uid: string, board: Board): Promise<void> {
  if (!supabase) throw new Error("Supabase não está configurado.");
  const payload = sanitize(board);
  const marca = assinatura(payload);
  // Nada mudou de fato: não gasta escrita nem provoca um eco desnecessário.
  if (marca === ultimoSincronizado) return;
  ultimoSincronizado = marca;

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
      if (data?.data) {
        ultimoSincronizado = assinatura(data.data);
        onChange(migrateBoard(data.data));
      } else {
        onChange("empty");
      }
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
        const marca = assinatura(raw);
        if (marca === ultimoSincronizado) return;
        ultimoSincronizado = marca;
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
    // Zera a marca junto com a assinatura: trocar de conta precisa poder
    // reescrever a nuvem mesmo que o conteúdo local seja idêntico ao da
    // conta anterior — senão a linha da conta nova nunca seria criada.
    ultimoSincronizado = null;
    client.removeChannel(channel);
  };
}
