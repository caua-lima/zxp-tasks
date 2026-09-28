import { supabase } from "./supabase";
import { Board } from "./types";
import { migrateBoard } from "./task-migrations";
import { assinatura } from "./sync-merge";

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
 * Assinatura do conteúdo que já está sincronizado com a nuvem.
 *
 * O Realtime do Supabase devolve as próprias escritas de volta (não existe
 * equivalente ao `hasPendingWrites` do Firestore). Sem esta comparação,
 * cada push local voltava como se fosse "mudança vinda de outro aparelho"
 * e reescrevia o board inteiro ~2s depois de cada alteração — no meio da
 * digitação, inclusive.
 */
let ultimoSincronizado: string | null = null;

/**
 * Quantas vezes uma versão da nuvem foi adotada como base. Um envio que
 * começou ANTES de chegar uma versão de outro aparelho não pode, ao terminar,
 * gravar a si mesmo como base — a nuvem pode já ter a versão do outro.
 */
let versaoRemota = 0;

export async function pushBoardToCloud(uid: string, board: Board): Promise<void> {
  if (!supabase) throw new Error("Supabase não está configurado.");
  const payload = sanitize(board);
  const marca = assinatura(payload);
  // Nada mudou de fato: não gasta escrita nem provoca um eco desnecessário.
  if (marca === ultimoSincronizado) return;
  const versaoNoInicio = versaoRemota;

  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: uid,
      data: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  // Só marca como sincronizado DEPOIS de a nuvem confirmar. Marcar antes fazia
  // um envio que falhou (celular sem sinal) ser considerado feito: a próxima
  // tentativa com o mesmo conteúdo era pulada e a mudança nunca subia.
  if (error) throw error;
  ultimoSincronizado = marca;
  if (versaoRemota === versaoNoInicio) gravarBase(uid, board);
}

// ── Base da sincronização ────────────────────────────────────────────────
// A última versão que ESTE aparelho sabe estar igual à nuvem. É o que deixa
// a mescla distinguir "eu mudei isto aqui" de "isto só está velho aqui" —
// sem ela, o aparelho parado há dias "desfazia" o que foi feito nos outros.

const CHAVE_BASE = "tarefas-zxp:sync-base:v1";

export function lerBase(uid: string): Board | null {
  try {
    const bruto = localStorage.getItem(CHAVE_BASE);
    if (!bruto) return null;
    const salvo = JSON.parse(bruto) as { uid?: unknown; board?: unknown };
    // Base de outra conta não serve de referência pra esta.
    if (salvo.uid !== uid || !salvo.board) return null;
    return migrateBoard(salvo.board);
  } catch {
    return null;
  }
}

function gravarBase(uid: string, board: Board) {
  try {
    localStorage.setItem(CHAVE_BASE, JSON.stringify({ uid, board: sanitize(board) }));
  } catch {
    // Sem espaço: a próxima mescla roda sem base (a nuvem vence conflitos),
    // que é o comportamento seguro — só menos preciso.
  }
}

/** A versão da nuvem que acabou de ser mesclada passa a ser a base. */
export function adotarComoBase(uid: string, remoto: Board) {
  versaoRemota++;
  gravarBase(uid, remoto);
}

/**
 * Busca o board da nuvem uma vez, sem assinar nada.
 *
 * Existe como rede de segurança do Realtime. O socket cai o tempo todo no
 * celular — o sistema congela a aba em segundo plano — e, se a replicação
 * da tabela não estiver publicada no Supabase, ele nunca entrega nada. Nos
 * dois casos o aparelho ficaria mostrando um quadro velho até alguém
 * recarregar a página na mão.
 *
 * Devolve `null` quando não há linha ou quando a leitura falha: quem chama
 * não pode confundir "a nuvem está vazia" com "não consegui ler agora" e
 * apagar o que está na tela.
 */
export async function fetchCloudBoard(uid: string): Promise<Board | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select("data")
    .eq("user_id", uid)
    .maybeSingle();
  if (error || !data?.data) return null;
  ultimoSincronizado = assinatura(data.data);
  return migrateBoard(data.data);
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
