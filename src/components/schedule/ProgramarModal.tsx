"use client";

import { FormEvent, useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  DIAS_UTEIS,
  descreverDias,
  duracaoDaProgramacao,
  problemaDaProgramacao,
} from "@/lib/programacao";
import { ANTECEDENCIA_MIN } from "@/lib/despertador";
import { EstadoNotificacao, pedirPermissao, permissaoAtual } from "@/lib/notifications";
import { registrarAparelho } from "@/lib/push";
import { topicKind } from "@/lib/wishlist";
import { Modal } from "../shared/Modal";

const DIAS = [
  { d: 0, curto: "D", nome: "Domingo" },
  { d: 1, curto: "S", nome: "Segunda" },
  { d: 2, curto: "T", nome: "Terça" },
  { d: 3, curto: "Q", nome: "Quarta" },
  { d: 4, curto: "Q", nome: "Quinta" },
  { d: 5, curto: "S", nome: "Sexta" },
  { d: 6, curto: "S", nome: "Sábado" },
];

const campo =
  "min-h-[40px] w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--focus)] [color-scheme:dark]";
const rotulo = "mb-1 block text-xs font-medium text-[var(--muted)]";

function duracaoLegivel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/**
 * Cria e gerencia blocos que se repetem sozinhos, como o expediente do
 * trabalho. A lista das programações existentes fica no mesmo lugar em que
 * se cria uma nova: é aqui que a pessoa vem quando o horário muda.
 */
export function ProgramarModal({ onClose }: { onClose: () => void }) {
  const {
    programacoes,
    topics,
    addProgramacao,
    alternarProgramacao,
    alternarDespertador,
    removerProgramacao,
  } = useApp();

  const [title, setTitle] = useState("");
  const [topicId, setTopicId] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>(DIAS_UTEIS);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("18:00");
  const [autoStart, setAutoStart] = useState(true);
  const [alarme, setAlarme] = useState(false);
  const [permissao, setPermissao] = useState<EstadoNotificacao>(() => permissaoAtual());

  /**
   * Ligar o despertador é o momento de pedir a permissão de notificação e
   * inscrever este aparelho no push: o pedido só é aceito num gesto da
   * pessoa, e sem a inscrição o servidor não tem pra onde mandar o aviso.
   */
  async function garantirAvisos() {
    const resultado = permissaoAtual() === "default" ? await pedirPermissao() : permissaoAtual();
    setPermissao(resultado);
    if (resultado === "granted") void registrarAparelho();
  }
  const [erro, setErro] = useState("");

  const projetos = useMemo(
    () => topics.filter((t) => !t.archivedAt && !t.deletedAt && topicKind(t) !== "wishlist"),
    [topics]
  );
  const nomeDoProjeto = (id?: string) => topics.find((t) => t.id === id)?.name;
  const duracao = duracaoDaProgramacao({ startTime, endTime });

  function salvar(e: FormEvent) {
    e.preventDefault();
    const input = {
      title,
      topicId: topicId || undefined,
      weekdays,
      startTime,
      endTime,
      autoStart,
      alarme,
      fuso: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    const problema = problemaDaProgramacao(input);
    if (problema) {
      setErro(problema);
      return;
    }
    addProgramacao(input);
    setTitle("");
    setErro("");
  }

  return (
    <Modal
      title="Programar tarefa"
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface)]"
          >
            Fechar
          </button>
        </div>
      }
    >
      <form onSubmit={salvar} className="space-y-3">
        <div>
          <label htmlFor="prog-nome" className={rotulo}>
            Nome
          </label>
          <input
            id="prog-nome"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setErro("");
            }}
            placeholder="Ex: SDR Pronix"
            className={campo}
          />
        </div>

        <div>
          <span className={rotulo}>Dias</span>
          <div className="flex gap-1.5">
            {DIAS.map(({ d, curto, nome }) => {
              const marcado = weekdays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={marcado}
                  aria-label={nome}
                  title={nome}
                  onClick={() =>
                    setWeekdays((atuais) =>
                      marcado ? atuais.filter((x) => x !== d) : [...atuais, d]
                    )
                  }
                  className={`min-h-[40px] flex-1 rounded-md border text-xs font-semibold transition ${
                    marcado
                      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface)]"
                  }`}
                >
                  {curto}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="prog-inicio" className={rotulo}>
              Das
            </label>
            <input
              id="prog-inicio"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={`${campo} tabular-nums`}
            />
          </div>
          <div>
            <label htmlFor="prog-fim" className={rotulo}>
              Até
            </label>
            <input
              id="prog-fim"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={`${campo} tabular-nums`}
            />
          </div>
        </div>

        {projetos.length > 0 && (
          <div>
            <label htmlFor="prog-projeto" className={rotulo}>
              Projeto
            </label>
            <select
              id="prog-projeto"
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              className={campo}
            >
              <option value="">Sem projeto</option>
              {projetos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <label className="flex cursor-pointer items-start gap-2 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={autoStart}
            onChange={(e) => setAutoStart(e.target.checked)}
            className="mt-0.5 accent-[var(--accent)]"
          />
          <span>
            Ligar o cronômetro sozinho no horário.
            <span className="block text-[11px]">
              Não precisa abrir o app às {startTime}: quando abrir, ele já estará rodando desde
              essa hora — e fecha sozinho às {endTime}.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-2 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={alarme}
            onChange={(e) => {
              setAlarme(e.target.checked);
              if (e.target.checked) void garantirAvisos();
            }}
            className="mt-0.5 accent-[var(--accent)]"
          />
          <span>
            Ativar despertador.
            <span className="block text-[11px]">
              Avisa {ANTECEDENCIA_MIN} minutos antes (&ldquo;em {ANTECEDENCIA_MIN} minutos:{" "}
              {title.trim() || "sua tarefa"}&rdquo;) e de novo às {startTime}, mesmo com o app
              fechado.
            </span>
          </span>
        </label>

        {alarme && permissao !== "granted" && (
          <p role="alert" className="rounded-md border border-[var(--warning)] p-2 text-[11px] text-[var(--foreground)]">
            {permissao === "denied"
              ? "As notificações estão bloqueadas neste aparelho — o despertador não vai tocar aqui até você liberar nos ajustes do navegador/celular."
              : permissao === "indisponivel"
                ? "Este navegador não mostra notificações. No iPhone, abra o app pelo ícone da tela de início."
                : "Permita as notificações pra o despertador conseguir avisar."}
          </p>
        )}

        {erro && (
          <p role="alert" className="text-xs text-[var(--danger)]">
            {erro}
          </p>
        )}

        <button
          type="submit"
          className="min-h-[42px] w-full rounded-md bg-[var(--accent)] text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-dark)]"
        >
          Programar{duracao > 0 ? ` · ${duracaoLegivel(duracao)} por dia` : ""}
        </button>
      </form>

      {programacoes.length > 0 && (
        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <p className={rotulo}>Programadas</p>
          <ul className="space-y-2">
            {programacoes.map((p) => (
              <li
                key={p.id}
                className={`flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 ${
                  p.pausedAt ? "opacity-60" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-[var(--foreground)]">{p.title}</p>
                  <p className="text-[11px] tabular-nums text-[var(--muted)]">
                    {descreverDias(p.weekdays)} · {p.startTime}–{p.endTime}
                    {nomeDoProjeto(p.topicId) && ` · ${nomeDoProjeto(p.topicId)}`}
                    {p.alarme && " · ⏰ despertador"}
                    {p.pausedAt && " · pausada"}
                  </p>
                </div>
                <button
                  type="button"
                  aria-pressed={!!p.alarme}
                  aria-label={`${p.alarme ? "Desativar" : "Ativar"} despertador de ${p.title}`}
                  title={p.alarme ? "Despertador ligado" : "Ativar despertador"}
                  onClick={() => {
                    if (!p.alarme) void garantirAvisos();
                    alternarDespertador(p.id);
                  }}
                  className={`min-h-[36px] shrink-0 rounded-md border px-2 text-sm ${
                    p.alarme
                      ? "border-[var(--accent)] bg-[var(--accent)]"
                      : "border-[var(--border)] opacity-60 hover:bg-[var(--surface)]"
                  }`}
                >
                  ⏰
                </button>
                <button
                  type="button"
                  onClick={() => alternarProgramacao(p.id)}
                  className="min-h-[36px] shrink-0 rounded-md border border-[var(--border)] px-2.5 text-xs text-[var(--muted)] hover:bg-[var(--surface)]"
                >
                  {p.pausedAt ? "Retomar" : "Pausar"}
                </button>
                <button
                  type="button"
                  onClick={() => removerProgramacao(p.id)}
                  aria-label={`Excluir programação ${p.title}`}
                  className="min-h-[36px] shrink-0 rounded-md px-2 text-sm text-[var(--muted)] hover:text-[var(--danger)]"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            Excluir para de gerar blocos novos. Os dias que já aconteceram continuam no
            histórico.
          </p>
        </div>
      )}
    </Modal>
  );
}
