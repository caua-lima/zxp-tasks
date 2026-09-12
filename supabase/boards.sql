-- Schema e RLS da tabela `boards` — o quadro inteiro de cada conta, num
-- único documento jsonb (ver `src/lib/cloud-sync.ts`).
--
-- Faltava este arquivo no repositório: a tabela existia só no painel do
-- Supabase, criada manualmente, sem nada versionado que reproduzisse a
-- instalação a partir do código. Isso não prova que o RLS real está errado
-- (pode ter sido criado do jeito certo direto no painel), mas se este
-- projeto Supabase precisar ser recriado do zero — restaurar de um backup de
-- infraestrutura, migrar de projeto — não havia como saber o que recriar.
--
-- Rode isto uma vez no SQL Editor do Supabase. Rodar de novo não faz mal —
-- cada bloco confere antes de agir. Depois de rodar este arquivo, rode (ou
-- confirme que já rodou) `realtime-boards.sql`, que liga a replicação em
-- tempo real por cima desta tabela.

create table if not exists public.boards (
  -- Um documento por conta: a mesma linha é atualizada (upsert por
  -- user_id) a cada alteração, nunca uma linha nova por sincronização.
  user_id     uuid primary key references auth.users (id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.boards enable row level security;

-- Cada pessoa só enxerga e mexe no PRÓPRIO quadro. `data` carrega tarefas,
-- cronograma, metas — tudo o que a conta tem — então vazamento aqui não é
-- um detalhe pequeno.
drop policy if exists "dono le o proprio quadro" on public.boards;
create policy "dono le o proprio quadro" on public.boards
  for select using (auth.uid() = user_id);

drop policy if exists "dono cria o proprio quadro" on public.boards;
create policy "dono cria o proprio quadro" on public.boards
  for insert with check (auth.uid() = user_id);

drop policy if exists "dono atualiza o proprio quadro" on public.boards;
create policy "dono atualiza o proprio quadro" on public.boards
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dono apaga o proprio quadro" on public.boards;
create policy "dono apaga o proprio quadro" on public.boards
  for delete using (auth.uid() = user_id);
