"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { ScheduleBlock, Topic } from "@/lib/types";
import { DURATION_PRESETS } from "@/lib/schedule";
import { Modal } from "../shared/Modal";

const campo =
  "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--focus)]";
const rotulo = "mb-1 block text-xs font-medium text-[var(--muted)]";

/**
 * Corrige um bloco já criado: nome, duração e projeto.
 *
 * Renomear aqui renomeia também a tarefa vinculada — o bloco e a tarefa são
 * a mesma coisa vista de dois ângulos, e deixar os nomes divergirem
 * transformaria o vínculo em armadilha ("qual das duas é a de verdade?").
 */
export function EditarBloco({
  block,
  projetos,
  onClose,
}: {
  block: ScheduleBlock;
  projetos: Topic[];
  onClose: () => void;
}) {
  const { updateBlock, updateTask } = useApp();
  const [title, setTitle] = useState(block.title);
  const [minutes, setMinutes] = useState(block.plannedMinutes);
  const [topicId, setTopicId] = useState(block.topicId ?? "");
  const [tempoLivre, setTempoLivre] = useState(!!block.openEnded);

  // Um bloco que já tem tarefa não pode trocar de projeto por aqui: a tarefa
  // ficaria numa pasta e o bloco apontando pra outra.
  const projetoTravado = !!block.taskId;

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const nome = title.trim();
    if (!nome) return;

    updateBlock(block.id, {
      title: nome,
      plannedMinutes: Math.max(1, minutes),
      // `undefined` em vez de `false` pra não gravar a chave à toa em bloco
      // que nunca foi de tempo livre.
      openEnded: tempoLivre ? true : undefined,
      ...(projetoTravado ? {} : { topicId: topicId || undefined }),
    });
    if (block.taskId && nome !== block.title) {
      updateTask(block.taskId, { title: nome });
    }
    onClose();
  }

  return (
    <Modal
      title="Editar bloco"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface)]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="form-bloco"
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-ink)] hover:bg-[var(--accent-dark)]"
          >
            Salvar
          </button>
        </div>
      }
    >
      <form id="form-bloco" onSubmit={salvar} className="space-y-3">
        <div>
          <label htmlFor="bloco-nome" className={rotulo}>
            Nome
          </label>
          <input
            id="bloco-nome"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={campo}
          />
        </div>

        <div>
          <span className={rotulo}>Duração</span>
          <div className="flex flex-wrap gap-1.5">
            {DURATION_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMinutes(m);
                  setTempoLivre(false);
                }}
                aria-pressed={minutes === m && !tempoLivre}
                className={`min-h-[36px] rounded-md border px-3 text-xs font-medium transition ${
                  minutes === m
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface)]"
                }`}
              >
                {m} min
              </button>
            ))}
            <input
              type="number"
              min={1}
              value={DURATION_PRESETS.includes(minutes) ? "" : minutes}
              onChange={(e) => {
                setMinutes(Math.max(1, Number(e.target.value) || 1));
                setTempoLivre(false);
              }}
              placeholder="outro"
              aria-label="Duração personalizada em minutos"
              className="min-h-[36px] w-20 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs tabular-nums text-[var(--foreground)] outline-none focus:border-[var(--focus)]"
            />
            <button
              type="button"
              onClick={() => setTempoLivre((v) => !v)}
              aria-pressed={tempoLivre}
              title="Cronômetro conta pra cima, sem tempo combinado"
              className={`min-h-[36px] rounded-md border px-3 text-xs font-medium transition ${
                tempoLivre
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface)]"
              }`}
            >
              sem tempo
            </button>
          </div>
          {tempoLivre && (
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              Sem tempo combinado: o cronômetro conta pra cima e não existe
              &ldquo;passou do tempo&rdquo;.
            </p>
          )}
          {block.accumulatedMs > 0 && !tempoLivre && (
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              O tempo já cronometrado não é apagado — só muda o quanto estava
              planejado.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="bloco-projeto" className={rotulo}>
            Projeto
          </label>
          <select
            id="bloco-projeto"
            value={topicId}
            onChange={(e) => setTopicId(e.target.value)}
            disabled={projetoTravado}
            className={`${campo} disabled:opacity-50`}
          >
            <option value="">Sem projeto</option>
            {projetos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {projetoTravado && (
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              Este bloco está ligado a uma tarefa do projeto. Pra mudar de
              projeto, apague o bloco e crie outro.
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
