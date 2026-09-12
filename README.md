# ZXP Tasks

App pessoal de tarefas, cronograma e metas — Next.js (App Router) + React,
com Supabase como camada opcional de sincronização entre aparelhos e um
service worker para uso como PWA offline.

## Arquitetura em uma frase

O estado inteiro do app é um único `Board` (tópicos, tarefas, cronograma,
metas, programações, revisões...) guardado no `localStorage` do navegador e,
quando há login, espelhado numa única linha jsonb por usuário no Postgres do
Supabase — sincronizado por Realtime mais uma reconciliação ao voltar o
foco/ficar online. A lógica de negócio vive em funções puras testáveis sob
`src/lib/*.ts`; componentes React e o `AppContext` são wrappers finos por
cima delas.

Leia `AGENTS.md` antes de mexer em código específico de Next.js — esta
versão tem diferenças do Next.js "de sempre", documentadas em
`node_modules/next/dist/docs/`.

## Configuração

1. `npm install`
2. Copie `.env.local.example` para `.env.local` e preencha o que for usar
   (cada bloco do arquivo explica onde pegar o valor e o que fica exposto
   ao navegador vs. o que é só de servidor):
   - **Supabase** (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
     — sincronização entre aparelhos. Sem isso o app funciona só localmente
     neste navegador.
   - **Web Push** (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
     `VAPID_SUBJECT`) — avisos que saem de um aparelho e chegam nos outros.
     Gere o par com `npx web-push generate-vapid-keys`.
   - **Ponte com o ZXP Finance** (`TASKS_FINANCE_BRIDGE_SECRET`,
     `SUPABASE_SERVICE_ROLE_KEY`, `TASKS_OWNER_USER_ID`) — endpoint
     `/api/desejos-em-aberto`, só leitura, usado por outro app (repositório
     separado) para ler os desejos em aberto. Opcional.
3. Se for usar Supabase, rode uma vez no SQL Editor do projeto, nesta ordem:
   - `supabase/boards.sql` — tabela `boards` (schema + RLS) onde cada conta
     guarda o próprio quadro.
   - `supabase/realtime-boards.sql` — liga a replicação em tempo real por
     cima da tabela acima (sem isto o app ainda sincroniza, só que apenas ao
     voltar o foco, não instantaneamente).
   - `supabase/push-subscriptions.sql` — tabela de inscrições de Web Push,
     uma linha por aparelho.
   Rodar os três de novo não tem problema: cada um confere o que já existe
   antes de agir.
4. `npm run dev` e abra `http://localhost:3000`.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (Turbopack). |
| `npm run build` | Build de produção. |
| `npm start` | Serve o build de produção. |
| `npm run lint` | ESLint. |
| `npm test` | Roda todo arquivo `*.test.ts` sob `src/` com o test runner nativo do Node (via `tsx`). |

## Testes

Os testes cobrem a lógica pura em `src/lib/*.ts` (nenhum mock de DOM ou de
rede) e rodam com `node --import tsx --test`. Novo arquivo `algo.test.ts` em
qualquer lugar sob `src/` é descoberto automaticamente — não precisa
registrar em lugar nenhum.
