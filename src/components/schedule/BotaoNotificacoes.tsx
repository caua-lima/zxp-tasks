"use client";

import { useEffect, useState } from "react";
import {
  EstadoNotificacao,
  avisarTeste,
  estaInstalado,
  pedirPermissao,
  permissaoAtual,
} from "@/lib/notifications";

/**
 * Liga os avisos do cronômetro, num botão só.
 *
 * Existe separado do "Começar" porque o pedido de permissão aparecia junto
 * com o primeiro bloco iniciado — no meio de outra tarefa, e sem explicar
 * o que ia acontecer. Aqui a pessoa decide na hora que quiser, e recebe um
 * aviso de teste na mesma hora pra confirmar que funcionou.
 */
export function BotaoNotificacoes() {
  // O estado só existe no navegador; no servidor a API nem é definida.
  const [estado, setEstado] = useState<EstadoNotificacao | null>(null);
  const [instalado, setInstalado] = useState(true);

  useEffect(() => {
    // Estado externo do navegador que não existe no servidor: ler durante a
    // renderização quebraria a hidratação, e não há evento pra assinar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEstado(permissaoAtual());
    setInstalado(estaInstalado());
  }, []);

  if (estado === null || estado === "granted") return null;

  async function ativar() {
    const resultado = await pedirPermissao();
    setEstado(resultado);
    // Usa o resultado do pedido, não uma releitura: no iPhone o valor lido
    // logo depois do prompt ainda vinha "default".
    if (resultado === "granted") avisarTeste(resultado);
  }

  if (estado === "denied") {
    return (
      <p className="mt-3 rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-[11px] text-[var(--muted)]">
        Os avisos estão bloqueados. Pra liberar: Ajustes do celular → ZXP Tasks →
        Notificações.
      </p>
    );
  }

  // Sem a API. No iPhone isso quer dizer, quase sempre, que o app foi aberto
  // pelo Safari e não pelo ícone — e é exatamente isso que precisa mudar.
  if (estado === "indisponivel") {
    return (
      <p className="mt-3 rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-[11px] text-[var(--muted)]">
        {instalado
          ? "Este navegador não manda avisos."
          : "Pra receber avisos no celular, abra o ZXP Tasks pelo ícone da tela de início (Compartilhar → Adicionar à Tela de Início). Pelo navegador o iPhone não deixa."}
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={ativar}
      className="mt-3 min-h-[40px] w-full rounded-md border border-[var(--brand)] px-3 text-sm font-semibold text-[var(--brand)] hover:bg-[var(--surface2)]"
    >
      Ativar notificações
    </button>
  );
}
