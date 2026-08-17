"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { Modal } from "./Modal";
import { useToast } from "./Toast";

const SYNC_LABEL: Record<string, string> = {
  offline: "Sem sincronização",
  syncing: "Sincronizando...",
  synced: "Sincronizado",
  error: "Erro ao sincronizar",
};

export function AccountPanel({ onClose }: { onClose: () => void }) {
  const { user, loading, syncAvailable, login, logout } = useAuth();
  const { syncStatus, lastSyncedAt } = useApp();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setEntrando(true);
    try {
      await login(email, senha);
      showToast("Login feito. Sincronizando...");
    } catch {
      setErro("E-mail ou senha inválidos.");
    } finally {
      setEntrando(false);
    }
  }

  if (!syncAvailable) {
    return (
      <Modal title="Conta" onClose={onClose}>
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          A sincronização entre dispositivos não está configurada neste app (falta a
          config do Firebase). O app continua funcionando normalmente só neste
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
        <div className="space-y-4">
          <div>
            <p className="text-sm text-[var(--foreground)]">{user.email}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {SYNC_LABEL[syncStatus]}
              {syncStatus === "synced" && lastSyncedAt && (
                <> · última vez às {new Date(lastSyncedAt).toLocaleTimeString("pt-BR")}</>
              )}
            </p>
          </div>
          <p className="text-xs leading-relaxed text-[var(--muted)]">
            Suas tarefas sincronizam automaticamente entre qualquer aparelho logado
            nesta conta. Continuam funcionando offline neste navegador mesmo sem
            conexão — a sincronização volta sozinha quando a internet voltar.
          </p>
          <button
            onClick={async () => {
              await logout();
              onClose();
            }}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface2)]"
          >
            Sair
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Entrar" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-xs leading-relaxed text-[var(--muted)]">
          Entre pra sincronizar suas tarefas entre dispositivos. Sem conta ainda? Crie
          uma no Firebase Console do projeto.
        </p>
        <div>
          <label htmlFor="account-email" className="mb-1 block text-xs text-[var(--muted)]">
            E-mail
          </label>
          <input
            id="account-email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-[40px] w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--focus)]"
          />
        </div>
        <div>
          <label htmlFor="account-senha" className="mb-1 block text-xs text-[var(--muted)]">
            Senha
          </label>
          <input
            id="account-senha"
            type="password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="min-h-[40px] w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--focus)]"
          />
        </div>
        {erro && <p className="text-xs text-[var(--danger)]">{erro}</p>}
        <button
          type="submit"
          disabled={entrando}
          className="min-h-[40px] w-full rounded-md bg-[var(--brand)] px-3 text-sm font-medium text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {entrando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </Modal>
  );
}
