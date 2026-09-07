"use client";

import { useEffect, useRef, useState } from "react";
import { ComandoDeVoz, interpretarComandoDeVoz } from "@/lib/voice-command";

/**
 * Tipagem mínima da Web Speech API.
 *
 * Ela não existe no `lib.dom` do TypeScript porque nunca virou padrão — é
 * prefixada em todos os navegadores que a implementam. Só o que este botão
 * usa está aqui; inventar a interface inteira seria fingir uma garantia que
 * a API não dá.
 */
interface ReconhecimentoDeFala {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

type ConstrutorDeReconhecimento = new () => ReconhecimentoDeFala;

function pegarConstrutor(): ConstrutorDeReconhecimento | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: ConstrutorDeReconhecimento;
    webkitSpeechRecognition?: ConstrutorDeReconhecimento;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function BotaoDeVoz({
  onComando,
  onErro,
}: {
  onComando: (comando: ComandoDeVoz) => void;
  onErro: (mensagem: string) => void;
}) {
  const [disponivel, setDisponivel] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const sessao = useRef<ReconhecimentoDeFala | null>(null);

  useEffect(() => {
    // API do navegador, inexistente no servidor: ler na renderização
    // quebraria a hidratação.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisponivel(pegarConstrutor() !== null);
    return () => sessao.current?.stop();
  }, []);

  if (!disponivel) return null;

  function ouvir() {
    if (ouvindo) {
      sessao.current?.stop();
      return;
    }
    const Construtor = pegarConstrutor();
    if (!Construtor) return;

    const rec = new Construtor();
    sessao.current = rec;
    rec.lang = "pt-BR";
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      const fala = e.results[0]?.[0]?.transcript ?? "";
      const comando = interpretarComandoDeVoz(fala);
      if (comando) onComando(comando);
      else onErro(fala ? `Não entendi "${fala}".` : "Não ouvi nada.");
    };
    rec.onerror = (e) => {
      // "no-speech" e "aborted" acontecem o tempo todo (soltar o botão, o
      // silêncio estourar o tempo) e não são falha de nada.
      if (e.error === "no-speech" || e.error === "aborted") return;
      onErro(
        e.error === "not-allowed"
          ? "Sem permissão pro microfone. Libere nos ajustes do navegador."
          : "Não consegui usar o microfone agora."
      );
    };
    rec.onend = () => {
      setOuvindo(false);
      sessao.current = null;
    };

    try {
      rec.start();
      setOuvindo(true);
    } catch {
      onErro("Não consegui usar o microfone agora.");
    }
  }

  return (
    <button
      type="button"
      onClick={ouvir}
      aria-pressed={ouvindo}
      aria-label={ouvindo ? "Parar de ouvir" : "Ditar a tarefa"}
      title='Ex: "Tarefa Chamar Leads por 40 minutos"'
      className={`min-h-[44px] shrink-0 rounded-md border px-3 text-sm font-semibold transition ${
        ouvindo
          ? "animate-pulse border-[var(--danger)] text-[var(--danger)]"
          : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface2)]"
      }`}
    >
      {ouvindo ? "● Ouvindo" : "🎤"}
    </button>
  );
}
