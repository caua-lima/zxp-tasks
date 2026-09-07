import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

/**
 * Envia um aviso pros outros aparelhos da mesma conta.
 *
 * A chave privada VAPID só existe aqui: ela assina as mensagens e, no
 * cliente, seria visível pra qualquer um que abrisse o site.
 *
 * A autorização é o próprio token do Supabase que o app já tem. O servidor
 * cria um cliente COM esse token, então as regras de acesso do banco (RLS)
 * continuam valendo — este endpoint não consegue ler a inscrição de outra
 * pessoa nem que quisesse, porque não usa chave de serviço nenhuma.
 */

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const VAPID_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVADA = process.env.VAPID_PRIVATE_KEY;
const VAPID_ASSUNTO = process.env.VAPID_SUBJECT || "mailto:contato@zxpsolutions.com";

interface Inscricao {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function POST(request: Request) {
  if (!VAPID_PUBLICA || !VAPID_PRIVADA || !URL_SUPABASE || !CHAVE_ANON) {
    // Não configurado ainda: o app deve seguir funcionando sem push.
    return NextResponse.json({ enviados: 0, motivo: "push nao configurado" }, { status: 501 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ erro: "sem token" }, { status: 401 });

  let corpoDaRequisicao: { titulo?: unknown; corpo?: unknown; exceto?: unknown };
  try {
    corpoDaRequisicao = await request.json();
  } catch {
    return NextResponse.json({ erro: "json invalido" }, { status: 400 });
  }

  const titulo = typeof corpoDaRequisicao.titulo === "string" ? corpoDaRequisicao.titulo : "";
  const corpo = typeof corpoDaRequisicao.corpo === "string" ? corpoDaRequisicao.corpo : "";
  const exceto = typeof corpoDaRequisicao.exceto === "string" ? corpoDaRequisicao.exceto : null;
  if (!titulo) return NextResponse.json({ erro: "sem titulo" }, { status: 400 });

  const supabase = createClient(URL_SUPABASE, CHAVE_ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: usuario } = await supabase.auth.getUser();
  if (!usuario.user) return NextResponse.json({ erro: "token invalido" }, { status: 401 });

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth");
  if (error) return NextResponse.json({ erro: "falha ao ler inscricoes" }, { status: 500 });

  const inscricoes = ((data ?? []) as Inscricao[]).filter((i) => i.endpoint !== exceto);
  if (inscricoes.length === 0) return NextResponse.json({ enviados: 0 });

  webpush.setVapidDetails(VAPID_ASSUNTO, VAPID_PUBLICA, VAPID_PRIVADA);
  const carga = JSON.stringify({ titulo, corpo });

  const resultados = await Promise.allSettled(
    inscricoes.map((i) =>
      webpush.sendNotification(
        { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
        carga
      )
    )
  );

  // Inscrição que o serviço de push recusa (404/410) é aparelho que
  // desinstalou o app ou limpou os dados. Guardar pra sempre faria toda
  // notificação futura tentar entregar num endereço morto.
  const mortas = inscricoes
    .filter((_, i) => {
      const r = resultados[i];
      if (r.status !== "rejected") return false;
      const status = (r.reason as { statusCode?: number } | undefined)?.statusCode;
      return status === 404 || status === 410;
    })
    .map((i) => i.endpoint);

  if (mortas.length > 0) {
    await supabase.from("push_subscriptions").delete().in("endpoint", mortas);
  }

  return NextResponse.json({
    enviados: resultados.filter((r) => r.status === "fulfilled").length,
    removidos: mortas.length,
  });
}
