import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Inscricao, enviarPush } from "@/lib/push-envio";

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

export async function POST(request: Request) {
  if (!VAPID_PUBLICA || !VAPID_PRIVADA || !URL_SUPABASE || !CHAVE_ANON) {
    // Não configurado ainda: o app deve seguir funcionando sem push.
    return NextResponse.json({ enviados: 0, motivo: "push nao configurado" }, { status: 501 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ erro: "sem token" }, { status: 401 });

  let corpoBruto: unknown;
  try {
    corpoBruto = await request.json();
  } catch {
    return NextResponse.json({ erro: "json invalido" }, { status: 400 });
  }
  // `JSON.parse` aceita `null`, número, string e array como documento
  // válido — o tipo declarado antes fingia que só um objeto chegava aqui, e
  // `corpoBruto.titulo` em cima de `null` derrubava a rota com uma exceção
  // não tratada antes de qualquer validação de verdade acontecer.
  if (!corpoBruto || typeof corpoBruto !== "object" || Array.isArray(corpoBruto)) {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const corpoDaRequisicao = corpoBruto as { titulo?: unknown; corpo?: unknown; exceto?: unknown };

  const titulo = typeof corpoDaRequisicao.titulo === "string" ? corpoDaRequisicao.titulo.slice(0, 200) : "";
  const corpo = typeof corpoDaRequisicao.corpo === "string" ? corpoDaRequisicao.corpo.slice(0, 500) : "";
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

  // O destino de cada inscrição é validado dentro de `enviarPush` — o RLS
  // garante que cada pessoa só grava na PRÓPRIA linha, mas não impede ela de
  // gravar um destino qualquer.
  const inscricoes = ((data ?? []) as Inscricao[]).filter((i) => i.endpoint !== exceto);
  const { enviados, mortas } = await enviarPush(inscricoes, { titulo, corpo });

  if (mortas.length > 0) {
    await supabase.from("push_subscriptions").delete().in("endpoint", mortas);
  }

  return NextResponse.json({ enviados, removidos: mortas.length });
}
