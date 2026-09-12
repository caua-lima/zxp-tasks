/**
 * Valida o destino de uma inscrição de push — só os serviços de verdade dos
 * navegadores suportados, nunca um host arbitrário.
 *
 * O RLS da tabela `push_subscriptions` garante que cada pessoa só grava na
 * PRÓPRIA linha, mas não garante NADA sobre o valor de `endpoint` — quem
 * está autenticado pode escrever ali diretamente pela API do Supabase (sem
 * passar pelo formulário) e apontar pra qualquer host. O servidor então faz
 * uma requisição HTTP de saída de verdade pra esse destino (`sendNotification`)
 * — é abuso de requisição de saída (SSRF), e uma allowlist de hosts
 * conhecidos fecha isso por construção, sem depender de uma lista de
 * bloqueio de redes privadas (sempre incompleta).
 */

const HOSTS_EXATOS = new Set([
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
  "push.apple.com",
]);

/** Edge/Windows usa um subdomínio por região — não dá pra listar host a host. */
const SUFIXOS_PERMITIDOS = [".notify.windows.com", ".wns.windows.com"];

export function endpointDePushValido(endpoint: unknown): boolean {
  if (typeof endpoint !== "string" || !endpoint) return false;

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }

  // Só HTTPS, e nunca com usuário/senha embutidos na URL.
  if (url.protocol !== "https:" || url.username || url.password) return false;

  const host = url.hostname.toLowerCase();
  if (HOSTS_EXATOS.has(host)) return true;
  return SUFIXOS_PERMITIDOS.some((sufixo) => host.endsWith(sufixo));
}
