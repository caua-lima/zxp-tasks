-- Despertador das programações: chama o app UMA VEZ POR MINUTO.
--
-- Um site não acorda sozinho no horário — com o app fechado não há código
-- rodando no celular. Este agendamento faz o Supabase bater na rota
-- /api/despertador a cada minuto; ela vê quais programações têm despertador
-- pra aquele minuto e manda o push.
--
-- ANTES de rodar, troque os dois valores marcados abaixo:
--   1. SEU-APP.vercel.app  → o endereço do seu app na Vercel
--   2. COLE_O_SEGREDO_AQUI → o mesmo valor da variável DESPERTADOR_SECRET
--      que você configurou na Vercel (gere com `openssl rand -hex 32`)
--
-- Rode uma vez no SQL Editor do Supabase. Rodar de novo só reagenda (o
-- `cron.schedule` com o mesmo nome substitui o anterior).
--
-- Pra desligar:  select cron.unschedule('zxp-despertador');
-- Pra conferir:  select status, return_message, start_time
--                from cron.job_run_details order by start_time desc limit 5;

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'zxp-despertador',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://SEU-APP.vercel.app/api/despertador',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer COLE_O_SEGREDO_AQUI'
    ),
    body := '{}'::jsonb
  );
  $$
);
