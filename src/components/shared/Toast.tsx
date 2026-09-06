"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface ToastState {
  id: number;
  message: string;
  undo?: () => void;
  /** Rótulo do botão. Padrão "Desfazer" — nem toda ação é um arrependimento. */
  acaoLabel?: string;
}

interface ToastContextValue {
  showToast: (message: string, undo?: () => void, acaoLabel?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback(
    (message: string, undo?: () => void, acaoLabel?: string) => {
      setToast({ id: Date.now(), message, undo, acaoLabel });
    },
    []
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-4 py-2.5 text-sm text-[var(--foreground)] shadow-lg"
        >
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
              className="font-semibold text-[var(--brand)] hover:underline"
            >
              {toast.acaoLabel ?? "Desfazer"}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
