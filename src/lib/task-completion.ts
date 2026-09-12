import { Board } from "./types";
import { createRecurringTask } from "./recurrence";
import { aplicarConclusaoNasMetas } from "./metas";

/**
 * Conclui UMA tarefa com a mesma semântica em qualquer lugar do app que
 * concluir passe a chamar: carimba `completedAt` (sem apagar o que já
 * tinha), gera a próxima ocorrência de quem é recorrente — uma única vez,
 * guardado por `recurrenceSpawned` — e marca o dia nas metas ligadas a ela.
 *
 * Existia batido em quatro lugares diferentes (concluir pelo quadro,
 * concluir bloco do cronograma, auto-conclusão por tempo, "já fiz" com
 * tarefa existente), e só UM deles gerava a próxima ocorrência — concluir
 * uma recorrente pelo cronograma quebrava a corrente sem avisar. Função
 * única em vez de regra espalhada: só existe um jeito de "concluir".
 *
 * Idempotente: tarefa já concluída não é reprocessada (não gera segunda
 * ocorrência, não regrava a data de conclusão).
 *
 * `gerarId` é injetado (não `uuid()` direto) pra continuar pura e testável
 * sem precisar mockar geração de id aleatório.
 */
export function concluirTarefaNoBoard(
  board: Board,
  taskId: string,
  nowIso: string,
  dia: string,
  gerarId: () => string
): Board {
  const alvo = board.tasks.find((t) => t.id === taskId);
  if (!alvo || alvo.status === "done") return board;

  const deveGerarProxima = !!alvo.recurrence && !alvo.recurrenceSpawned;
  const tasks = board.tasks.map((t) =>
    t.id === taskId
      ? {
          ...t,
          status: "done" as const,
          completedAt: t.completedAt ?? nowIso,
          recurrenceSpawned: t.recurrenceSpawned || deveGerarProxima,
          updatedAt: nowIso,
        }
      : t
  );

  if (deveGerarProxima) {
    const proxima = createRecurringTask(alvo, gerarId(), nowIso);
    if (proxima) tasks.push(proxima);
  }

  return aplicarConclusaoNasMetas({ ...board, tasks }, [taskId], dia);
}
