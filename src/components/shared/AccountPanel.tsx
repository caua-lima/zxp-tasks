"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { traduzErroAuth } from "@/lib/auth-errors";
import { Modal } from "./Modal";
import { useToast } from "./Toast";

const SYNC_LABEL: Record<string, string> = {
  offline: "Sem sincronização",
  syncing: "Sincronizando...",
  synced: "Sincronizado",
  error: "Erro ao sincronizar",
};

const campo =
  "min-h-[44px] w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--focus)]";
const rotulo = "mb-1 block text-xs font-medium text-[var(--muted)]";

/** Regra do próprio Supabase — validar aqui evita ida e volta ao servidor. */
const SENHA_MINIMA = 6;

function Aviso({ tipo, children }: { tipo: "erro" | "ok"; children: React.ReactNode }) {
  return (
    <p
      className="rounded-md px-2.5 py-2 text-xs leading-relaxed"
      style={
        tipo === "erro"
          ? { color: "var(--danger)", backgroundColor: "var(--danger-bg)" }
          : { color: "var(--success)", backgroundColor: "rgba(54,179,126,0.14)" }
      }
    >
      {children}
    </p>
  );
}

function FormEntrar() {
  const { login } = useAuth();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      await login(email, senha);
      showToast("Login feito. Sincronizando...");
    } catch (e) {
      setErro(traduzErroAuth(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="entrar-email" className={rotulo}>
          E-mail
        </label>
        <input
          id="entrar-email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={campo}
        />
      </div>
      <div>
        <label htmlFor="entrar-senha" className={rotulo}>
          Senha
        </label>
        <input
          id="entrar-senha"
          type="password"
          required
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className={campo}
        />
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <button
        type="submit"
        disabled={enviando}
        className="min-h-[44px] w-full rounded-md bg-[var(--brand)] px-3 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
      >
        {enviando ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}

function FormCriar() {
  const { signUp } = useAuth();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setAviso("");
    if (senha !== repetir) {
      setErro("As duas senhas não são iguais.");
      return;
    }
    if (senha.length < SENHA_MINIMA) {
      setErro(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
      return;
    }
    setEnviando(true);
    try {
      const { precisaConfirmarEmail } = await signUp(email, senha);
      if (precisaConfirmarEmail) {
        setAviso(
          "Acesso criado. Falta confirmar pelo link enviado no e-mail antes de entrar — ou desligue 'Confirm email' no Supabase."
        );
      } else {
        showToast("Acesso criado. Você já está dentro.");
      }
      setSenha("");
      setRepetir("");
    } catch (e) {
      setErro(traduzErroAuth(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="criar-email" className={rotulo}>
          E-mail
        </label>
        <input
          id="criar-email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={campo}
        />
      </div>
      <div>
        <label htmlFor="criar-senha" className={rotulo}>
          Senha (mínimo {SENHA_MINIMA} caracteres)
        </label>
        <input
          id="criar-senha"
          type="password"
          required
          autoComplete="new-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className={campo}
        />
      </div>
      <div>
        <label htmlFor="criar-repetir" className={rotulo}>
          Repita a senha
        </label>
        <input
          id="criar-repetir"
          type="password"
          required
          autoComplete="new-password"
          value={repetir}
          onChange={(e) => setRepetir(e.target.value)}
          className={campo}
        />
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
      <button
        type="submit"
        disabled={enviando}
        className="min-h-[44px] w-full rounded-md bg-[var(--brand)] px-3 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
      >
        {enviando ? "Criando..." : "Criar acesso"}
      </button>
    </form>
  );
}

function ContaLogada({ onClose }: { onClose: () => void }) {
  const { user, logout, updateEmail, updatePassword } = useAuth();
  const { syncStatus, lastSyncedAt } = useApp();
  const { showToast } = useToast();

  const [editando, setEditando] = useState<"nada" | "email" | "senha">("nada");
  const [novoEmail, setNovoEmail] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);

  function limpar() {
    setErro("");
    setAviso("");
    setNovoEmail("");
    setNovaSenha("");
    setRepetir("");
  }

  async function salvarEmail(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setAviso("");
    setEnviando(true);
    try {
      await updateEmail(novoEmail);
      // Com "Secure email change" ligado (padrão do Supabase), a troca só
      // vale depois de confirmar nos DOIS endereços — dizer isso evita a
      // impressão de que não funcionou.
      setAviso(
        "Pedido enviado. Confirme pelos links que chegaram no e-mail antigo e no novo — a troca só vale depois disso."
      );
      setNovoEmail("");
    } catch (e) {
      setErro(traduzErroAuth(e));
    } finally {
      setEnviando(false);
    }
  }

  async function salvarSenha(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setAviso("");
    if (novaSenha !== repetir) {
      setErro("As duas senhas não são iguais.");
      return;
    }
    if (novaSenha.length < SENHA_MINIMA) {
      setErro(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
      return;
    }
    setEnviando(true);
    try {
      await updatePassword(novaSenha);
      showToast("Senha alterada.");
      setEditando("nada");
      limpar();
    } catch (e) {
      setErro(traduzErroAuth(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-[var(--foreground)]">{user?.email}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {SYNC_LABEL[syncStatus]}
          {syncStatus === "synced" && lastSyncedAt && (
            <> · última vez às {new Date(lastSyncedAt).toLocaleTimeString("pt-BR")}</>
          )}
        </p>
      </div>

      <p className="text-xs leading-relaxed text-[var(--muted)]">
        Suas tarefas sincronizam entre qualquer aparelho logado nesta conta, e
        continuam funcionando offline neste navegador.
      </p>

      {editando === "nada" && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              limpar();
              setEditando("email");
            }}
            className="min-h-[40px] rounded-md border border-[var(--border)] px-3 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface2)]"
          >
            Trocar e-mail
          </button>
          <button
            onClick={() => {
              limpar();
              setEditando("senha");
            }}
            className="min-h-[40px] rounded-md border border-[var(--border)] px-3 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface2)]"
          >
            Trocar senha
          </button>
          <button
            onClick={async () => {
              await logout();
              onClose();
            }}
            className="min-h-[40px] rounded-md border border-[var(--border)] px-3 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface2)]"
          >
            Sair
          </button>
        </div>
      )}

      {editando === "email" && (
        <form onSubmit={salvarEmail} className="space-y-3 border-t border-[var(--border)] pt-3">
          <div>
            <label htmlFor="novo-email" className={rotulo}>
              Novo e-mail
            </label>
            <input
              id="novo-email"
              type="email"
              required
              autoFocus
              value={novoEmail}
              onChange={(e) => setNovoEmail(e.target.value)}
              className={campo}
            />
          </div>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={enviando}
              className="min-h-[40px] flex-1 rounded-md bg-[var(--brand)] px-3 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {enviando ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditando("nada");
                limpar();
              }}
              className="min-h-[40px] rounded-md px-3 text-sm text-[var(--muted)] hover:bg-[var(--surface2)]"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {editando === "senha" && (
        <form onSubmit={salvarSenha} className="space-y-3 border-t border-[var(--border)] pt-3">
          <div>
            <label htmlFor="nova-senha" className={rotulo}>
              Nova senha (mínimo {SENHA_MINIMA} caracteres)
            </label>
            <input
              id="nova-senha"
              type="password"
              required
              autoFocus
              autoComplete="new-password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              className={campo}
            />
          </div>
          <div>
            <label htmlFor="nova-senha-repetir" className={rotulo}>
              Repita a nova senha
            </label>
            <input
              id="nova-senha-repetir"
              type="password"
              required
              autoComplete="new-password"
              value={repetir}
              onChange={(e) => setRepetir(e.target.value)}
              className={campo}
            />
          </div>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={enviando}
              className="min-h-[40px] flex-1 rounded-md bg-[var(--brand)] px-3 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {enviando ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditando("nada");
                limpar();
              }}
              className="min-h-[40px] rounded-md px-3 text-sm text-[var(--muted)] hover:bg-[var(--surface2)]"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function AccountPanel({ onClose }: { onClose: () => void }) {
  const { user, loading, syncAvailable } = useAuth();
  const [aba, setAba] = useState<"entrar" | "criar">("entrar");

  if (!syncAvailable) {
    return (
      <Modal title="Conta" onClose={onClose}>
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          A sincronização entre dispositivos não está configurada neste app (falta a
          config do Supabase). O app continua funcionando normalmente só neste
          navegador — use &quot;Exportar backup&quot; em Dados para levar suas tarefas
          pra outro aparelho manualmente.
        </p>
      </Modal>
    );
  }

  if (loading) {
    return (
      <Modal title="Conta" onClose={onClose}>
        <p className="text-sm text-[var(--muted)]">Carregando...</p>
      </Modal>
    );
  }

  if (user) {
    return (
      <Modal title="Conta" onClose={onClose}>
        <ContaLogada onClose={onClose} />
      </Modal>
    );
  }

  return (
    <Modal title="Acesso" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex gap-1">
          {(["entrar", "criar"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setAba(k)}
              aria-pressed={aba === k}
              className={`min-h-[44px] flex-1 rounded-md px-3 text-sm font-medium transition ${
                aba === k
                  ? "bg-[var(--brand)] text-[var(--accent-ink)]"
                  : "bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface2)]"
              }`}
            >
              {k === "entrar" ? "Entrar" : "Criar acesso"}
            </button>
          ))}
        </div>

        {aba === "entrar" ? <FormEntrar /> : <FormCriar />}

        <p className="text-[11px] leading-relaxed text-[var(--muted)]">
          Cada acesso enxerga só as próprias tarefas. Depois de criar os acessos que
          você precisa, vale desligar novos cadastros no Supabase (Authentication →
          Sign In / Providers → Allow new users to sign up).
        </p>
      </div>
    </Modal>
  );
}
