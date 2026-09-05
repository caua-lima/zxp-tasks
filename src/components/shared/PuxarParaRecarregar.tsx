"use client";

import { useEffect, useRef, useState } from "react";

/** Quanto precisa arrastar pra soltar e recarregar. */
const LIMITE = 70;
/** Depois disso a borracha para de esticar, pra não parecer travado. */
const MAXIMO = 110;

/**
 * Puxar pra baixo recarrega — o gesto que todo app de celular tem.
 *
 * Precisa ser feito à mão por dois motivos: o conteúdo rola dentro deste
 * contêiner (o `body` não rola, então o navegador nunca vê o gesto), e
 * instalado na tela de início o iPhone não oferece recarregar de jeito
 * nenhum — nem gesto, nem barra de endereço.
 */
export function PuxarParaRecarregar({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [puxada, setPuxada] = useState(0);
  const [recarregando, setRecarregando] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let inicioY: number | null = null;
    let distancia = 0;

    function onStart(e: TouchEvent) {
      // Só arma o gesto se já estiver no topo. Começar no meio da lista e
      // rolar até o topo não pode virar recarregamento no meio do caminho.
      inicioY = el!.scrollTop <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null;
      distancia = 0;
    }

    function onMove(e: TouchEvent) {
      if (inicioY === null) return;
      const delta = e.touches[0].clientY - inicioY;
      if (delta <= 0 || el!.scrollTop > 0) {
        inicioY = null;
        distancia = 0;
        setPuxada(0);
        return;
      }
      // Resistência: o dedo anda mais que o indicador, como no gesto nativo.
      distancia = Math.min(MAXIMO, delta * 0.5);
      // Sem isto o iPhone faz a página inteira balançar por cima do gesto.
      // Exige listener não-passivo — daí o addEventListener manual.
      e.preventDefault();
      setPuxada(distancia);
    }

    function onEnd() {
      if (inicioY !== null && distancia >= LIMITE) {
        setRecarregando(true);
        window.location.reload();
      }
      inicioY = null;
      distancia = 0;
      setPuxada(0);
    }

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const pronto = puxada >= LIMITE;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div
        aria-hidden={!recarregando}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center overflow-hidden transition-[height] duration-150"
        style={{ height: recarregando ? MAXIMO / 2 : puxada }}
      >
        <span
          className="mt-2 rounded-full border border-[var(--border)] bg-[var(--surface2)] px-3 py-1 text-[11px] font-medium"
          style={{
            color: pronto || recarregando ? "var(--brand)" : "var(--muted)",
            opacity: recarregando ? 1 : Math.min(1, puxada / LIMITE),
          }}
        >
          {recarregando ? "Recarregando..." : pronto ? "Solte pra recarregar" : "Puxe pra recarregar"}
        </span>
      </div>

      <div style={{ transform: `translateY(${puxada}px)` }}>{children}</div>
    </div>
  );
}
