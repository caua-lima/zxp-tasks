import { supabase } from "./supabase";

/**
 * Notificação que sai de um aparelho e chega nos outros.
 *
 * As notificações comuns (`notifications.ts`) só existem no aparelho onde o
 * botão foi clicado, e só enquanto a página está aberta. Pra "iniciei no PC
 * e chegou no celular" não existe atalho: é preciso Web Push de verdade —
 * cada aparelho registra uma inscrição, o servidor guarda todas e manda a
 * mensagem pro serviço de push do fabricante, que acorda o service worker
 * mesmo com o app fechado.
 *
 * Tudo aqui degrada em silêncio. Sem chave VAPID configurada, sem tabela no
 * banco ou sem permissão, o app continua funcionando exatamente como antes —
 * só não avisa os outros aparelhos.
 */

const TABELA = "push_subscriptions";

/** A chave pública precisa virar bytes pro `pushManager`. */
function base64UrlParaBytes(base64: string): ArrayBuffer {
  const preenchido = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const normal = preenchido.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(normal);
  // Devolve o ArrayBuffer, não a view: `applicationServerKey` só aceita
  // buffer respaldado por ArrayBuffer, e um Uint8Array genérico pode estar
  // sobre SharedArrayBuffer.
  const buffer = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return buffer;
}

/**
 * O service worker ativo, ou `null` se não aparecer a tempo.
 *
 * Mesmo cuidado de `notifications.ts`: `serviceWorker.ready` não rejeita
 * quando não há worker registrado — fica pendurada pra sempre. Em
 * desenvolvimento o worker é desregistrado de propósito, então sem esta
 * corrida a inscrição travaria calada.
 */
async function registroAtivo(timeoutMs = 3000): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  return Promise.race([
    navigator.serviceWorker.ready.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

function chavePublica(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}

export function pushConfigurado(): boolean {
  return chavePublica() !== null;
}

/** Endpoint da inscrição deste aparelho, se houver. Serve pra não avisar a si mesmo. */
export async function endpointDesteAparelho(): Promise<string | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub?.endpoint ?? null;
  } catch {
    return null;
  }
}

/**
 * Registra este aparelho para receber avisos vindos dos outros.
 *
 * Chamada depois de a permissão ser concedida. Guarda a inscrição no
 * Supabase com `endpoint` como chave: o mesmo aparelho reinscrito troca a
 * linha em vez de acumular duplicatas, que gerariam avisos repetidos.
 */
export async function registrarAparelho(): Promise<boolean> {
  const chave = chavePublica();
  if (!chave || !supabase) return false;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;

  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return false;

    const reg = await registroAtivo();
    if (!reg) return false;
    const existente = await reg.pushManager.getSubscription();
    const sub =
      existente ??
      (await reg.pushManager.subscribe({
        // Exigido pelos navegadores: push silencioso (sem mostrar nada) não
        // é permitido, e é justamente o que queremos — sempre mostramos.
        userVisibleOnly: true,
        applicationServerKey: base64UrlParaBytes(chave),
      }));

    const bruto = sub.toJSON() as { endpoint?: string; keys?: Record<string, string> };
    const { error } = await supabase.from(TABELA).upsert(
      {
        user_id: data.user.id,
        endpoint: sub.endpoint,
        p256dh: bruto.keys?.p256dh ?? "",
        auth: bruto.keys?.auth ?? "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );
    return !error;
  } catch {
    return false;
  }
}

/**
 * Manda o aviso pros OUTROS aparelhos da conta.
 *
 * O aparelho que disparou a ação já mostrou a notificação local na hora —
 * receber a mesma coisa de volta pelo push seria aviso em dobro.
 */
export async function avisarOutrosAparelhos(titulo: string, corpo: string): Promise<void> {
  if (!pushConfigurado() || !supabase) return;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        titulo,
        corpo,
        exceto: await endpointDesteAparelho(),
      }),
    });
  } catch {
    // Avisar os outros aparelhos é um extra: falhar aqui não pode atrapalhar
    // quem acabou de apertar "Começar".
  }
}
