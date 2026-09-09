"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { traduzErroAuth } from "@/lib/auth-errors";
import { ZxpMark } from "../ZxpMark";

/**
 * A porta de entrada do app: sem login, nada é mostrado.
 *
 * Antes o login era opcional — o app funcionava só com `localStorage`. Isso
 * criava dois problemas ao mesmo tempo, e eles eram o MESMO problema:
 *
 * 1. Quem abrisse o endereço entrava direto. Não via dados de ninguém (o RLS
 *    do banco cuida disso), mas usava o app como se fosse dono dele.
 * 2. Sem login não existe nuvem, e sem nuvem cada aparelho guarda o seu
 *    próprio quadro. Criar tarefa no PC e não achar no celular não era um
 *    defeito de sincronização: era a ausência dela.
 *
 * O quadro que já existia neste navegador não se perde. Ele continua no
 * `localStorage` e é unido ao da nuvem no primeiro login.
 */
export function PortaDeEntrada({ children }: { children: React.ReactNode }) {
  const { user, loading, syncAvailable } = useAuth();

  if (loading) {
    return (
      <Moldura>
        <p className="text-sm text-[var(--muted)]">Verificando sua sessão…</p>
      </Moldura>
    );
  }

  /**
   * Sem Supabase configurado o app não tem como autenticar ninguém. Deixar
   * passar seria abrir a porta justamente quando não há fechadura — melhor
   * dizer o que falta do que fingir que está tudo bem.
   */
  if (!syncAvailable) {
    return (
      <Moldura>
        <p className="text-sm font-medium text-[var(--foreground)]">
          Este ambiente está sem as chaves de sincronização.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
          Faltam <code className="text-[var(--accent)]">NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
          <code className="text-[var(--accent)]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>. Sem
          elas não há como verificar quem está entrando.
        </p>
      </Moldura>
    );
  }

  if (!user) return <TelaDeLogin />;

  return <>{children}</>;
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-[var(--background)] p-6">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex items-center gap-3">
          <ZxpMark size={40} />
          <div>
            <p className="font-[family-name:var(--font-display)] text-lg font-bold leading-none text-[var(--foreground)]">
              ZXP Tasks
            </p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
              ZXP Solutions
            </p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

const campo =
  "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--focus)]";

/**
 * Só entrar — criar conta não fica na porta de entrada de propósito.
 *
 * Um cadastro aberto aqui devolveria o problema que o login veio resolver:
 * qualquer pessoa com o endereço passaria a ter uma conta. Contas novas são
 * criadas por dentro, em Conta, por quem já está autenticado.
 */
function TelaDeLogin() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      await login(email, senha);
    } catch (falha) {
      setErro(traduzErroAuth(falha));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Moldura>
      <form onSubmit={entrar} className="space-y-3">
        <div>
          <label htmlFor="porta-email" className="mb-1 block text-xs text-[var(--muted)]">
            E-mail
          </label>
          <input
            id="porta-email"
            type="email"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={campo}
          />
        </div>
        <div>
          <label htmlFor="porta-senha" className="mb-1 block text-xs text-[var(--muted)]">
            Senha
          </label>
          <input
            id="porta-senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className={campo}
          />
        </div>

        {erro && (
          <p role="alert" className="text-xs text-[var(--danger)]">
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando || !email.trim() || !senha}
          className="min-h-[44px] w-full rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-dark)] disabled:opacity-40"
        >
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>

      <p className="mt-5 text-[11px] leading-relaxed text-[var(--muted)]">
        Seus dados ficam na sua conta e acompanham você em qualquer aparelho.
      </p>
    </Moldura>
  );
}
