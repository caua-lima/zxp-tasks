import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * `true` só quando as duas variáveis existem. Sincronização é uma camada
 * OPCIONAL por cima do app local — sem isso configurado (dev sem
 * `.env.local`, ou deploy onde faltou setar as variáveis), o app precisa
 * continuar funcionando 100% offline em vez de quebrar a tela inteira.
 */
export const supabaseConfigured = !!url && !!anonKey;

/**
 * A chave usada aqui é a ANON (pública por design — vai no bundle que o
 * navegador baixa). Quem protege os dados é o Row Level Security da tabela
 * `boards`, não o segredo da chave. A `service_role`/`secret` NUNCA pode
 * aparecer neste arquivo: ela ignora o RLS e daria acesso total ao banco
 * pra qualquer pessoa que abrisse o site.
 */
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null;
