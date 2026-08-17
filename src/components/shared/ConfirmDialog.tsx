"use client";

import { Modal } from "./Modal";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmar",
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface)]"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md px-3 py-1.5 text-sm font-medium"
            style={
              danger
                ? { backgroundColor: "var(--danger)", color: "#fff" }
                : { backgroundColor: "var(--brand)", color: "var(--accent-ink)" }
            }
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-[var(--muted)]">{message}</p>
    </Modal>
  );
}
