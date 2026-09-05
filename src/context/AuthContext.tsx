"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "@/lib/supabase";

/**
 * Resultado do cadastro. `precisaConfirmarEmail` é true quando o Supabase
 * criou a conta mas não devolveu sessão — significa que a opção "Confirm
 * email" está ligada e a conta só funciona depois de clicar no link. Sem
 * distinguir isso, o cadastro pareceria ter falhado silenciosamente.
 */
export interface SignUpResult {
  precisaConfirmarEmail: boolean;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** Sincronização exige Supabase configurado (ver .env.local.example). */
  syncAvailable: boolean;
  login: (email: string, senha: string) => Promise<void>;
  signUp: (email: string, senha: string) => Promise<SignUpResult>;
  logout: () => Promise<void>;
  updateEmail: (novoEmail: string) => Promise<void>;
  updatePassword: (novaSenha: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);

  useEffect(() => {
    if (!supabase) return;

    // Sessão já existente (voltou ao app depois de ter logado antes).
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  function exigeSupabase() {
    if (!supabase) throw new Error("Sincronização não está configurada neste app.");
    return supabase;
  }

  async function login(email: string, senha: string) {
    const client = exigeSupabase();
    const { error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });
    if (error) throw error;
  }

  async function signUp(email: string, senha: string): Promise<SignUpResult> {
    const client = exigeSupabase();
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password: senha,
    });
    if (error) throw error;
    return { precisaConfirmarEmail: !data.session };
  }

  async function logout() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  async function updateEmail(novoEmail: string) {
    const client = exigeSupabase();
    const { error } = await client.auth.updateUser({ email: novoEmail.trim() });
    if (error) throw error;
  }

  async function updatePassword(novaSenha: string) {
    const client = exigeSupabase();
    const { error } = await client.auth.updateUser({ password: novaSenha });
    if (error) throw error;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        syncAvailable: supabaseConfigured,
        login,
        signUp,
        logout,
        updateEmail,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
