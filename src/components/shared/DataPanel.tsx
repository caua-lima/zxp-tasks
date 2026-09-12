"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { BackupValidation, estimateSizeKb, validateBackup } from "@/lib/task-backup";
import { lastBackupDate } from "@/lib/storage";
import { Modal } from "./Modal";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToast } from "./Toast";

export function DataPanel({ onClose }: { onClose: () => void }) {
  const { board, tasks, topics, exportData, importData, restoreTask, purgeTask, emptyTrash } =
    useApp();
  const { user } = useAuth();
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ json: string; validation: BackupValidation } | null>(
    null
  );
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const trash = tasks.filter((t) => t.deletedAt);
  const active = tasks.filter((t) => !t.deletedAt);

  function handleExport() {
    const blob = new Blob([exportData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zxp-tasks-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Backup exportado.");
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const json = await file.text();
    e.target.value = "";
    const validation = validateBackup(json);
    if (!validation.valid) {
      showToast(validation.error ?? "Arquivo inválido.");
      return;
    }
    setPending({ json, validation });
  }

  function runImport(mode: "merge" | "replace") {
    if (!pending) return;
    const report = importData(pending.json, mode);
    setPending(null);
    if (!report) {
      showToast("Não foi possível importar esse arquivo.");
      return;
    }
    showToast(
      `Importado: ${report.tasksAdded} tarefas, ${report.topicsAdded} tópicos, ` +
        `${report.scheduleAdded} blocos de cronograma` +
        (report.duplicatesSkipped > 0 ? ` · ${report.duplicatesSkipped} ignorados` : "")
    );
  }

  const last = lastBackupDate();

  return (
    <>
      <Modal title="Dados e backup" onClose={onClose} wide>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Tarefas", value: active.length },
              { label: "Tópicos", value: topics.length },
              { label: "Na lixeira", value: trash.length },
              { label: "Tamanho (KB)", value: estimateSizeKb(board) },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-3"
              >
                <p className="font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums text-[var(--foreground)]">
                  {s.value}
                </p>
                <p className="text-[11px] text-[var(--muted)]">{s.label}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-[var(--muted)]">
            Último snapshot automático:{" "}
            {last ? new Date(last).toLocaleString("pt-BR") : "nenhum ainda"}
          </p>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-3">
            <p className="text-xs leading-relaxed text-[var(--foreground)]">
              {user ? (
                <>
                  Seus dados sincronizam com a sua conta e acompanham você em qualquer aparelho
                  logado. O backup exportado aqui é uma cópia extra — útil pra migrar de conta ou
                  se algo der errado do lado do servidor.
                </>
              ) : (
                <>
                  Seus dados ficam <strong>somente neste navegador</strong>. Se limpar os dados do
                  navegador sem backup, suas tarefas podem ser perdidas. Entre numa conta para
                  sincronizar entre aparelhos.
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleExport}
              className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-ink)] hover:bg-[var(--accent-dark)]"
            >
              Exportar backup
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={handleFile}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface2)]"
            >
              Importar backup
            </button>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">
                Lixeira{" "}
                <span className="tabular-nums text-[var(--muted)]">({trash.length})</span>
              </h3>
              {trash.length > 0 && (
                <button
                  onClick={() => setConfirmEmpty(true)}
                  className="rounded px-2 py-1 text-xs text-[var(--danger)] hover:bg-[var(--surface2)]"
                >
                  Esvaziar lixeira
                </button>
              )}
            </div>
            {trash.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">Lixeira vazia.</p>
            ) : (
              <ul className="space-y-1.5">
                {trash.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-[var(--muted)]">
                      {t.title}
                      {(() => {
                        const topico = topics.find((x) => x.id === t.topicId);
                        return topico?.deletedAt ? (
                          <span className="text-[11px]"> · {topico.name} (excluído)</span>
                        ) : null;
                      })()}
                    </span>
                    <button
                      onClick={() => {
                        restoreTask(t.id);
                        showToast("Tarefa restaurada.");
                      }}
                      className="rounded px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--surface3)]"
                    >
                      Restaurar
                    </button>
                    <button
                      onClick={() => setConfirmPurge(t.id)}
                      className="rounded px-2 py-1 text-xs text-[var(--danger)] hover:bg-[var(--surface3)]"
                    >
                      Excluir
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Modal>

      {pending && !confirmReplace && (
        <Modal
          title="Importar backup"
          onClose={() => setPending(null)}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setPending(null)}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface)]"
              >
                Cancelar
              </button>
              <button
                onClick={() => setConfirmReplace(true)}
                className="rounded-md px-3 py-1.5 text-sm font-medium"
                style={{ backgroundColor: "var(--danger)", color: "#fff" }}
              >
                Substituir tudo
              </button>
              <button
                onClick={() => runImport("merge")}
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-ink)] hover:bg-[var(--accent-dark)]"
              >
                Mesclar
              </button>
            </div>
          }
        >
          <div className="space-y-3 text-sm">
            <p className="text-[var(--muted)]">
              Um snapshot dos dados atuais é guardado antes de qualquer mudança.
            </p>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-[var(--border)] bg-[var(--surface2)] p-3 text-xs">
              {[
                ["Tópicos", pending.validation.topics],
                ["Tarefas", pending.validation.tasks],
                ["Blocos de cronograma", pending.validation.schedule],
                ["Metas", pending.validation.metas],
                ["Programações", pending.validation.programacoes],
                ["Grupos", pending.validation.groups],
                ["Revisões semanais", pending.validation.weeklyReviews],
                ["Dias com foco marcado", pending.validation.dailyFocusDays],
              ].map(([label, value]) => (
                <li key={label} className="flex justify-between gap-2 text-[var(--foreground)]">
                  <span className="text-[var(--muted)]">{label}</span>
                  <span className="tabular-nums">{value}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-[var(--muted)]">
              <strong>Mesclar</strong> mantém o que já existe e adiciona o que falta.{" "}
              <strong>Substituir tudo</strong> apaga os dados atuais e coloca os do arquivo no
              lugar.
            </p>
          </div>
        </Modal>
      )}

      {pending && confirmReplace && (
        <ConfirmDialog
          title="Substituir todos os dados?"
          message="Tudo o que existe agora — tópicos, tarefas, cronograma, metas — é trocado pelo conteúdo do arquivo. Um snapshot do que existe é guardado antes, mas a troca em si não tem desfazer pela interface."
          confirmLabel="Substituir tudo"
          danger
          onCancel={() => setConfirmReplace(false)}
          onConfirm={() => {
            setConfirmReplace(false);
            runImport("replace");
          }}
        />
      )}

      {confirmEmpty && (
        <ConfirmDialog
          title="Esvaziar lixeira"
          message={`Isso apaga definitivamente ${trash.length} ${trash.length === 1 ? "tarefa" : "tarefas"}. Um snapshot é salvo antes, mas não há como desfazer pela interface.`}
          confirmLabel="Apagar definitivamente"
          danger
          onCancel={() => setConfirmEmpty(false)}
          onConfirm={() => {
            emptyTrash();
            setConfirmEmpty(false);
            showToast("Lixeira esvaziada.");
          }}
        />
      )}

      {confirmPurge && (
        <ConfirmDialog
          title="Excluir definitivamente"
          message="Essa tarefa some de vez. Um snapshot é salvo antes, mas não há como desfazer pela interface."
          confirmLabel="Apagar definitivamente"
          danger
          onCancel={() => setConfirmPurge(null)}
          onConfirm={() => {
            purgeTask(confirmPurge);
            setConfirmPurge(null);
            showToast("Tarefa apagada.");
          }}
        />
      )}
    </>
  );
}
