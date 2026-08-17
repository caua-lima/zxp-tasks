"use client";

import { useEffect, useRef } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, children, footer, wide }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--sidebar)] shadow-xl ${
          wide ? "max-w-2xl" : "max-w-md"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-base font-semibold text-[var(--foreground)]">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md px-2 py-1 text-[var(--muted)] hover:bg-[var(--surface)]"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="border-t border-[var(--border)] px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
