import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { migrateBoard } from "@/lib/task-migrations";
import { avisosDoMinuto } from "@/lib/despertador";
import { Inscricao, enviarPush, pushConfiguradoNoServidor } from "@/lib/push-envio";

/**
 * Despertador: chamado UMA VEZ POR MINUTO por um agendador (o `pg_cron` do
 * próprio Supabase — ver `supabase/despertador-cron.sql`).
 *
 * Um site não acorda sozinho no horário: com o app fechado não existe
 * código rodando no aparelho. Quem sabe que deu 7h50 é este servidor, que
 * olha as programações com despertador ligado e manda um push — o serviço de
 * push do fabricante é que acorda o service worker no celular.
 *
 * Não guarda estado: a cada chamada responde "o que toca NESTE minuto". Como
 * o agendador chama uma vez por minuto, cada aviso sai uma vez; se chamar
 * duas, a etiqueta da notificação faz a segunda substituir a primeira.
 *
 * Quem chama é um agendador, não uma pessoa logada — por isso a autorização
 * é um segredo compartilhado e a leitura usa a chave `service_role`, que só
 * existe aqui no servidor.
 */

const SEGREDO = process.env.DESPERTADOR_SECRET;
const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE_SERVICO = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request: Request) {
  if (!SEGREDO || !URL_SUPABASE || !CHAVE_SERVICO || !pushConfiguradoNoServidor()) {
    return NextResponse.json({ erro: "despertador nao configurado" }, { status: 501 });
  }
  const recebido = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (recebido !== SEGREDO) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const supabase = createClient(URL_SUPABASE, CHAVE_SERVICO, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: quadros, error } = await supabase.from("boards").select("user_id, data");
  if (error) return NextResponse.json({ erro: "falha ao ler os quadros" }, { status: 500 });

  const agora = new Date();
  let enviados = 0;
  let avisosDisparados = 0;

  for (const linha of quadros ?? []) {
    if (!linha.data) continue;
    const avisos = avisosDoMinuto(migrateBoard(linha.data).programacoes, agora);
    if (avisos.length === 0) continue;

    const { data: inscricoes } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", linha.user_id);
    if (!inscricoes || inscricoes.length === 0) continue;

    for (const aviso of avisos) {
      avisosDisparados++;
      const resultado = await enviarPush(inscricoes as Inscricao[], {
        titulo: aviso.titulo,
        corpo: aviso.corpo,
        tag: aviso.tag,
        insistente: aviso.tipo === "hora",
      });
      enviados += resultado.enviados;
      if (resultado.mortas.length > 0) {
        await supabase.from("push_subscriptions").delete().in("endpoint", resultado.mortas);
      }
    }
  }

  return NextResponse.json({ avisos: avisosDisparados, enviados });
}
