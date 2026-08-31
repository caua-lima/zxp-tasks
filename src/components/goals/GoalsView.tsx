"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { TopicKind } from "@/lib/types";
import { isWishlist, wishlistTotals } from "@/lib/wishlist";
import { calculateTopicProgress } from "@/lib/task-utils";
import { formatBRL } from "@/lib/money";

/**
 * A metade "Objetivos" do app: as pastas do que quero conquistar ou comprar.
 * É só uma porta de entrada — cada pasta abre na visão de projeto, que já
 * tem tudo. Aqui só importa bater o olho e escolher onde entrar.
 */
export function GoalsView({ onOpenTopic }: { onOpenTopic: (id: string) => void }) {
  const { topics, tasks, addTopic } = useApp();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<TopicKind>("wishlist");

  const active = useMemo(() => topics.filter((t) => !t.archivedAt), [topics]);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const topic = addTopic(n, kind);
    setName("");
    onOpenTopic(topic.id);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--foreground)]">
          Objetivos
        </h1>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          O que você quer conquistar ou comprar. Toque numa pasta pra ver os itens.
        </p>
      </header>

      <form
        onSubmit={handleAdd}
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
      >
        <div className="mb-2 flex gap-1">
          {(["wishlist", "project"] as TopicKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`min-h-[36px] flex-1 rounded-md px-2 text-xs font-medium transition ${
                kind === k
                  ? "bg-[var(--brand)] text-[var(--accent-ink)]"
                  : "bg-[var(--surface2)] text-[var(--muted)] hover:bg-[var(--surface3)]"
              }`}
            >
              {k === "wishlist" ? "Coisas pra comprar" : "Projeto"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              kind === "wishlist" ? "Ex: Melhorias no carro" : "Ex: Mentoria RUMO"
            }
            aria-label="Nome do objetivo"
            className="min-h-[44px] min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--focus)]"
          />
          <button
            type="submit"
            className="min-h-[44px] shrink-0 rounded-md bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)]"
          >
            Criar
          </button>
        </div>
      </form>

      {active.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
          Nenhum objetivo ainda. Crie o primeiro acima — por exemplo &quot;Melhorias no
          carro&quot; com insulfilm e troca de pneu dentro.
        </div>
      ) : (
        <ul className="space-y-2">
          {active.map((topic) => {
            const wishlist = isWishlist(topic);
            const totals = wishlist ? wishlistTotals(tasks, topic.id) : null;
            const progress = calculateTopicProgress(tasks, topic.id);
            return (
              <li key={topic.id}>
                <button
                  onClick={() => onOpenTopic(topic.id)}
                  className="flex min-h-[64px] w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:border-[var(--brand)]"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: topic.color }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--foreground)]">
                      {topic.name}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                      {totals ? (
                        <>
                          <span className="tabular-nums text-[var(--brand)]">
                            {formatBRL(totals.wantedCents)}
                          </span>{" "}
                          · {totals.itemsWanted}{" "}
                          {totals.itemsWanted === 1 ? "item" : "itens"}
                          {totals.itemsBought > 0 && (
                            <span className="text-[var(--success)]">
                              {" "}
                              · {totals.itemsBought} comprado
                              {totals.itemsBought === 1 ? "" : "s"}
                            </span>
                          )}
                        </>
                      ) : progress.total > 0 ? (
                        <span className="tabular-nums">
                          {progress.done}/{progress.total} concluídas
                          {progress.overdue > 0 && (
                            <span className="text-[var(--danger)]">
                              {" "}
                              · {progress.overdue} atrasadas
                            </span>
                          )}
                        </span>
                      ) : (
                        "Vazio — toque pra adicionar"
                      )}
                    </span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-[var(--muted)]">
                    ›
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
