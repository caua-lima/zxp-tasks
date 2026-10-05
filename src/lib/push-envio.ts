import webpush from "web-push";
import { endpointDePushValido } from "./push-endpoint";

/** Só no servidor: usa a chave privada VAPID. */

export interface Inscricao {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface CargaDePush {
  titulo: string;
  corpo: string;
  /** Etiqueta da notificação; sem ela o service worker usa a do bloco. */
  tag?: string;
  /** Fica na tela até dispensar e vibra — despertador. */
  insistente?: boolean;
}

const VAPID_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVADA = process.env.VAPID_PRIVATE_KEY;
const VAPID_ASSUNTO = process.env.VAPID_SUBJECT || "mailto:contato@zxpsolutions.com";

export function pushConfiguradoNoServidor(): boolean {
  return !!VAPID_PUBLICA && !!VAPID_PRIVADA;
}

/**
 * Manda a carga pra cada inscrição e diz quais morreram.
 *
 * Valida o destino aqui, e não só no cadastro: é este servidor que faz a
 * requisição de saída, então é aqui que um endereço arbitrário gravado na
 * tabela viraria SSRF. Inscrição que o serviço de push recusa com 404/410 é
 * aparelho que desinstalou o app — quem chama apaga, pra não tentar pra sempre.
 */
export async function enviarPush(
  inscricoes: Inscricao[],
  carga: CargaDePush
): Promise<{ enviados: number; mortas: string[] }> {
  const validas = inscricoes.filter((i) => endpointDePushValido(i.endpoint));
  if (!VAPID_PUBLICA || !VAPID_PRIVADA || validas.length === 0) return { enviados: 0, mortas: [] };

  webpush.setVapidDetails(VAPID_ASSUNTO, VAPID_PUBLICA, VAPID_PRIVADA);
  const texto = JSON.stringify(carga);
  const resultados = await Promise.allSettled(
    validas.map((i) =>
      webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, texto)
    )
  );

  const mortas = validas
    .filter((_, i) => {
      const r = resultados[i];
      if (r.status !== "rejected") return false;
      const status = (r.reason as { statusCode?: number } | undefined)?.statusCode;
      return status === 404 || status === 410;
    })
    .map((i) => i.endpoint);

  return { enviados: resultados.filter((r) => r.status === "fulfilled").length, mortas };
}
