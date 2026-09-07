-- Inscrições de Web Push: um registro por aparelho.
--
-- Rode isto uma vez no SQL Editor do Supabase. Sem esta tabela o app segue
-- funcionando normalmente — só não avisa os outros aparelhos.

create table if not exists public.push_subscriptions (
  -- O endpoint É a identidade do aparelho: o mesmo celular reinscrito troca
  -- a linha em vez de virar duas, o que geraria aviso repetido.
  endpoint    text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  updated_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Cada pessoa só enxerga e mexe nas próprias inscrições. O endpoint de push
-- é um endereço de entrega: vazá-lo deixaria qualquer um mandar notificação
-- pro aparelho de outra pessoa.
drop policy if exists "dono le as proprias" on public.push_subscriptions;
create policy "dono le as proprias" on public.push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "dono grava as proprias" on public.push_subscriptions;
create policy "dono grava as proprias" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists "dono atualiza as proprias" on public.push_subscriptions;
create policy "dono atualiza as proprias" on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dono apaga as proprias" on public.push_subscriptions;
create policy "dono apaga as proprias" on public.push_subscriptions
  for delete using (auth.uid() = user_id);
