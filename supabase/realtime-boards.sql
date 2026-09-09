-- Liga a replicação em tempo real da tabela `boards`.
--
-- Sem isto o app AINDA sincroniza, mas só quando você volta pra ele: o
-- aparelho relê a nuvem ao ganhar foco. Com isto ligado, a tarefa criada no
-- PC aparece no celular na hora, com o app aberto nos dois.
--
-- Rode uma vez no SQL Editor do Supabase. Rodar de novo não faz mal — o
-- bloco checa antes de adicionar.

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'boards'
  ) then
    alter publication supabase_realtime add table public.boards;
  end if;
end $$;

-- O Realtime precisa da linha ANTIGA pra montar o evento de update. Sem
-- `replica identity full`, um update chega sem os dados que mudaram.
alter table public.boards replica identity full;
