import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { migrateBoard } from "@/lib/task-migrations";

/**
 * Ponte pro ZXP Finance: devolve os itens ainda não comprados da lista de
 * desejos, pra ele oferecer "vincular esta parcela a um desejo" e pro chat
 * de viabilidade saber do que a pessoa está falando ("o Multimídia").
 *
 * Só isto — nunca tarefa de trabalho, cronograma, meta ou qualquer outro
 * dado. É por isso que este endpoint filtra e remonta a resposta campo a
 * campo em vez de devolver o board inteiro.
 *
 * Quem chama é o SERVIDOR do Finance, não o navegador da pessoa — os dois
 * apps têm login separado (Supabase aqui, Firebase lá), então não faz
 * sentido pedir uma sessão de usuário. A autorização é um segredo
 * compartilhado entre os dois backends (nunca chega no navegador de
 * nenhum dos dois), e a leitura usa a chave `service_role` (que ignora o
 * Row Level Security) porque não existe uma sessão de usuário aqui pra o
 * RLS validar — ela fica só neste arquivo, do lado do servidor.
 */

const SEGREDO = process.env.TASKS_FINANCE_BRIDGE_SECRET;
const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE_SERVICO = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DONO_DO_QUADRO = process.env.TASKS_OWNER_USER_ID;

export async function GET(request: Request) {
  if (!SEGREDO || !URL_SUPABASE || !CHAVE_SERVICO || !DONO_DO_QUADRO) {
    return NextResponse.json({ erro: "ponte nao configurada" }, { status: 501 });
  }

  const recebido = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (recebido !== SEGREDO) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const supabase = createClient(URL_SUPABASE, CHAVE_SERVICO, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("boards")
    .select("data")
    .eq("user_id", DONO_DO_QUADRO)
    .maybeSingle();
  if (error) return NextResponse.json({ erro: "falha ao ler o quadro" }, { status: 500 });
  if (!data?.data) return NextResponse.json({ itens: [] });

  const board = migrateBoard(data.data);
  const idsDeListasDeDesejos = new Set(
    board.topics.filter((t) => t.kind === "wishlist" && !t.archivedAt).map((t) => t.id)
  );
  const nomeDoProjeto = new Map(board.topics.map((t) => [t.id, t.name]));

  const itens = board.tasks
    .filter(
      (t) =>
        idsDeListasDeDesejos.has(t.topicId) &&
        t.status !== "done" &&
        !t.deletedAt &&
        !t.archivedAt
    )
    .map((t) => ({
      id: t.id,
      nome: t.title,
      precoCentavos: t.priceCents ?? null,
      projeto: nomeDoProjeto.get(t.topicId) ?? null,
    }));

  return NextResponse.json({ itens });
}
