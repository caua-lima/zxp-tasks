"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { Task, Topic } from "@/lib/types";
import { TaskFilters, filterTasks } from "@/lib/task-filters";
import { checklistProgress, isTaskOverdue } from "@/lib/task-utils";
import { PRIORITY_COLOR, PRIORITY_LABEL } from "@/lib/priority";
import { formatDateShort } from "@/lib/date-utils";
import { TaskModal } from "./TaskModal";

const STATUS_LABEL: Record<string, string> = {
  todo: "A fazer",
  doing: "Fazendo",
  done: "Feito",
};

const STATUS_COLOR: Record<string, string> = {
  todo: "#B5B2A6",
  doing: "#F0A74A",
  done: "#36B37E",
};

/** Distância vertical entre duas tarefas da mesma coluna. */
const ESPACO_LINHA = 52;
/** Respiro entre as faixas de dois tópicos do mesmo lado. */
const ESPACO_ENTRE_GRUPOS = 56;
/** Distância horizontal do hub até o tópico e do tópico até suas tarefas. */
const DISTANCIA_TOPICO = 200;
const DISTANCIA_TAREFA = 250;

/** Caixa dos nós, usada pra calcular o enquadramento inicial. */
const CARTAO = { w: 156, h: 38 };
const PILULA = { w: 148, h: 42 };

/** Acima disso o SVG vira sopa; melhor pedir filtro do que desenhar tudo. */
const MAX_NODES = 60;

interface Node {
  x: number;
  y: number;
}

interface MindMapProps {
  topicId: string | null;
  filters: TaskFilters;
}

export function MindMap({ topicId, filters }: MindMapProps) {
  const { topics, tasks: allTasks } = useApp();
  const [modalTask, setModalTask] = useState<Task | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [asList, setAsList] = useState(false);
  const dragState = useRef<{ x: number; y: number } | null>(null);

  /**
   * O mapa desenha em pixels absolutos (sem viewBox) centrado no meio do
   * painel — não num canvas fixo de 1200×800. Sem isso, num painel menor
   * (o embed de 420px de altura na visão de projeto, por exemplo) o hub
   * ficava fora da área visível e só sobrava, por sorte, o nó que caía
   * dentro do recorte.
   */
  const containerRef = useRef<HTMLDivElement>(null);
  const [center, setCenter] = useState({ x: 400, y: 300 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setCenter({ x: rect.width / 2, y: rect.height / 2 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // Reforço: girar/redimensionar o celular muda o tamanho do contêiner
    // (ele é h-full/w-full, guiado pelo layout flex da página) sem
    // necessariamente disparar o ResizeObserver em todo engine — resize da
    // janela é o gatilho mais confiável pra esse caso específico.
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const tasks = useMemo(
    () => filterTasks(allTasks, { ...filters, topicId }),
    [allTasks, filters, topicId]
  );

  const visibleTopics = topicId ? topics.filter((t) => t.id === topicId) : topics;
  const tooMany = tasks.length > MAX_NODES;

  /**
   * Nós saem agrupados por status: as tarefas de um mesmo status ficam em
   * arcos vizinhos ao redor do tópico, em vez de espalhadas na ordem de
   * criação. Com muitas tarefas, ler o mapa vira ler blocos.
   */
  const rendered = useMemo(() => {
    const order: Record<string, number> = { todo: 0, doing: 1, done: 2 };
    const grouped = [...tasks].sort(
      (a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9)
    );
    return tooMany ? grouped.slice(0, MAX_NODES) : grouped;
  }, [tasks, tooMany]);

  const layout = useMemo(() => {
    /**
     * Layout de árvore, não de leque: os ramos saem pros lados e as tarefas
     * de cada tópico ficam empilhadas em coluna.
     *
     * A versão anterior espalhava as tarefas num arco ao redor do tópico. Só
     * que os cartões são largos (156px) e fixos: em qualquer arco, dois
     * vizinhos com poucos graus de diferença se sobrepõem na horizontal, e
     * aumentar o raio até resolver jogava o resto do mapa longe demais. Em
     * coluna a distância entre vizinhos é conhecida e a sobreposição é
     * impossível por construção — que é como mapa mental de verdade se
     * organiza.
     *
     * Tudo é calculado em coordenadas próprias, sem olhar o tamanho do
     * painel; encaixar na tela é trabalho do zoom automático mais abaixo.
     */
    const topicNodes = new Map<string, Node & { angle: number }>();
    const taskNodes = new Map<string, Node>();

    const tarefasDe = (id: string) => rendered.filter((t) => t.topicId === id);

    if (topicId) {
      // Um tópico só: ele é o centro e as tarefas descem em duas colunas,
      // uma de cada lado, alternando pra manter o desenho equilibrado.
      const topic = visibleTopics[0];
      if (!topic) return { topicNodes, taskNodes };
      topicNodes.set(topic.id, { x: 0, y: 0, angle: 0 });

      const lista = tarefasDe(topic.id);
      const colunas: Task[][] = [[], []];
      lista.forEach((t, i) => colunas[i % 2].push(t));
      colunas.forEach((coluna, lado) => {
        const dir = lado === 0 ? 1 : -1;
        const alturaTotal = (coluna.length - 1) * ESPACO_LINHA;
        coluna.forEach((task, j) => {
          taskNodes.set(task.id, {
            x: dir * DISTANCIA_TAREFA,
            y: j * ESPACO_LINHA - alturaTotal / 2,
          });
        });
      });
      return { topicNodes, taskNodes };
    }

    // Vários tópicos: hub no meio, tópicos alternando entre o lado direito e
    // o esquerdo. Cada tópico reserva uma faixa vertical do tamanho da sua
    // lista, e as faixas de um mesmo lado são empilhadas sem se tocar.
    const lados: Topic[][] = [[], []];
    visibleTopics.forEach((t, i) => lados[i % 2].push(t));

    lados.forEach((doLado, lado) => {
      const dir = lado === 0 ? 1 : -1;
      const alturas = doLado.map((t) =>
        Math.max(1, tarefasDe(t.id).length) * ESPACO_LINHA
      );
      const total =
        alturas.reduce((a, b) => a + b, 0) +
        Math.max(0, doLado.length - 1) * ESPACO_ENTRE_GRUPOS;

      let topo = -total / 2;
      doLado.forEach((topic, i) => {
        const altura = alturas[i];
        const meio = topo + altura / 2;
        topicNodes.set(topic.id, { x: dir * DISTANCIA_TOPICO, y: meio, angle: 0 });

        tarefasDe(topic.id).forEach((task, j) => {
          taskNodes.set(task.id, {
            x: dir * (DISTANCIA_TOPICO + DISTANCIA_TAREFA),
            y: topo + j * ESPACO_LINHA + ESPACO_LINHA / 2,
          });
        });

        topo += altura + ESPACO_ENTRE_GRUPOS;
      });
    });

    return { topicNodes, taskNodes };
  }, [visibleTopics, rendered, topicId]);

  /**
   * Enquadramento inicial: calcula a caixa que contém todos os nós e devolve
   * a transformação que a encaixa no painel. Sem isso o mapa sempre abria em
   * escala 1 e, num painel pequeno (ou com muitas tarefas), metade dele
   * nascia fora da área visível — a pessoa tinha que arrastar pra descobrir
   * que havia mais coisa ali.
   */
  const enquadramento = useMemo(() => {
    const caixas: { x: number; y: number; w: number; h: number }[] = [];
    layout.topicNodes.forEach((n) => caixas.push({ ...PILULA, x: n.x, y: n.y }));
    layout.taskNodes.forEach((n) => caixas.push({ ...CARTAO, x: n.x, y: n.y }));
    if (caixas.length === 0) return { x: 0, y: 0, scale: 1 };

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of caixas) {
      minX = Math.min(minX, c.x - c.w / 2);
      maxX = Math.max(maxX, c.x + c.w / 2);
      minY = Math.min(minY, c.y - c.h / 2);
      maxY = Math.max(maxY, c.y + c.h / 2);
    }

    const larguraUtil = Math.max(1, center.x * 2 - 32);
    const alturaUtil = Math.max(1, center.y * 2 - 96); // barra de ações + legenda
    const escala = Math.min(
      1,
      larguraUtil / Math.max(1, maxX - minX),
      alturaUtil / Math.max(1, maxY - minY)
    );
    // Abaixo disso o texto do cartão vira borrão; melhor caber por arrasto.
    const scale = Math.max(0.3, escala);

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return {
      x: center.x * (1 - scale) - scale * cx,
      y: center.y * (1 - scale) - scale * cy,
      scale,
    };
  }, [layout, center]);

  // Reenquadra quando o conteúdo ou o tamanho do painel muda — não a cada
  // render, senão anularia o arrasto/zoom que a pessoa acabou de fazer.
  const chaveEnquadramento = `${Math.round(center.x)}x${Math.round(center.y)}|${topicId ?? ""}|${rendered.length}|${visibleTopics.length}`;
  const ultimoEnquadramento = useRef("");
  useEffect(() => {
    if (ultimoEnquadramento.current === chaveEnquadramento) return;
    ultimoEnquadramento.current = chaveEnquadramento;
    setTransform(enquadramento);
  }, [chaveEnquadramento, enquadramento]);

  function onPointerDown(e: React.PointerEvent) {
    dragState.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    setTransform((t) => ({
      ...t,
      x: e.clientX - dragState.current!.x,
      y: e.clientY - dragState.current!.y,
    }));
  }
  function onPointerUp() {
    dragState.current = null;
  }

  if (topics.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[var(--muted)]">
        Crie um tópico e algumas tarefas pra ver o mapa mental.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-[radial-gradient(circle,_rgba(246,243,232,0.07)_1px,_transparent_1px)] bg-[length:20px_20px]"
    >
      <div className="absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-1">
        <button
          onClick={() => setAsList((v) => !v)}
          className="min-h-[36px] rounded-md bg-[var(--surface)] px-2.5 text-xs font-medium text-[var(--foreground)] shadow hover:bg-[var(--surface2)]"
        >
          {asList ? "Ver mapa" : "Ver em lista"}
        </button>
        {!asList && (
          <>
            <button
              onClick={() => setTransform((t) => ({ ...t, scale: Math.min(2.5, t.scale + 0.15) }))}
              aria-label="Aproximar"
              className="min-h-[36px] rounded-md bg-[var(--surface)] px-2.5 text-sm font-medium text-[var(--foreground)] shadow hover:bg-[var(--surface2)]"
            >
              +
            </button>
            <button
              onClick={() => setTransform((t) => ({ ...t, scale: Math.max(0.4, t.scale - 0.15) }))}
              aria-label="Afastar"
              className="min-h-[36px] rounded-md bg-[var(--surface)] px-2.5 text-sm font-medium text-[var(--foreground)] shadow hover:bg-[var(--surface2)]"
            >
              −
            </button>
            <button
              onClick={() => setTransform(enquadramento)}
              className="min-h-[36px] rounded-md bg-[var(--surface)] px-2.5 text-xs font-medium text-[var(--foreground)] shadow hover:bg-[var(--surface2)]"
            >
              Resetar
            </button>
          </>
        )}
      </div>

      {tooMany && !asList && (
        <p className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-md bg-[var(--surface)] px-3 py-1.5 text-center text-[11px] text-[var(--warning)] shadow">
          Este tópico tem muitas tarefas. Mostrando {MAX_NODES} de {tasks.length} — use
          filtros para explorar.
        </p>
      )}

      {asList ? (
        <div className="h-full overflow-y-auto p-4 pt-16">
          <ul className="mx-auto max-w-2xl space-y-2">
            {tasks.map((task) => {
              const topic = topics.find((t) => t.id === task.topicId);
              const { done, total } = checklistProgress(task);
              return (
                <li key={task.id}>
                  <button
                    onClick={() => setModalTask(task)}
                    className="flex min-h-[44px] w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-left"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: STATUS_COLOR[task.status] }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-[var(--foreground)]">
                        {task.title}
                      </span>
                      <span className="text-[11px] text-[var(--muted)]">
                        {topic?.name} · {STATUS_LABEL[task.status]} ·{" "}
                        {PRIORITY_LABEL[task.priority]}
                        {task.dueDate && ` · ${formatDateShort(task.dueDate)}`}
                        {total > 0 && ` · ${done}/${total}`}
                        {isTaskOverdue(task) && " · atrasada"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {tasks.length === 0 && (
              <li className="text-center text-sm text-[var(--muted)]">
                Nenhuma tarefa com os filtros atuais.
              </li>
            )}
          </ul>
        </div>
      ) : (
        <svg
          className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          role="img"
          aria-label="Mapa mental das tarefas. Use o botão Ver em lista para a versão acessível."
        >
          <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
            <g transform={`translate(${center.x}, ${center.y})`}>
              {!topicId && (
                <>
                  <circle r={44} fill="var(--brand)" />
                  <text
                    textAnchor="middle"
                    dy="5"
                    fontSize={13}
                    fontWeight={600}
                    fill="var(--accent-ink)"
                  >
                    ZXP
                  </text>
                </>
              )}

              {visibleTopics.map((topic) => {
                const node = layout.topicNodes.get(topic.id);
                if (!node) return null;
                const topicTasks = rendered.filter((t) => t.topicId === topic.id);
                return (
                  <g key={topic.id}>
                    {!topicId && (
                      <path
                        d={`M 0 0 C ${node.x / 2} 0, ${node.x / 2} ${node.y}, ${node.x} ${node.y}`}
                        fill="none"
                        stroke={topic.color}
                        strokeWidth={2.5}
                        opacity={0.55}
                      />
                    )}
                    {topicTasks.map((task) => {
                      const tNode = layout.taskNodes.get(task.id);
                      if (!tNode) return null;
                      return (
                        <path
                          key={task.id}
                          // Curva em vez de reta: num mapa mental as ligações
                          // retas viram um "sol" de raios que embaralha a
                          // leitura quando há muitos nós.
                          d={`M ${node.x} ${node.y} C ${(node.x + tNode.x) / 2} ${node.y}, ${(node.x + tNode.x) / 2} ${tNode.y}, ${tNode.x} ${tNode.y}`}
                          fill="none"
                          stroke={topic.color}
                          strokeWidth={1.5}
                          opacity={task.completedAt ? 0.18 : 0.4}
                        />
                      );
                    })}

                    <g transform={`translate(${node.x}, ${node.y})`}>
                      <rect
                        x={-74}
                        y={-21}
                        width={148}
                        height={42}
                        rx={21}
                        fill={topic.color}
                      />
                      <foreignObject x={-74} y={-21} width={148} height={42}>
                        <div className="flex h-full w-full items-center justify-center gap-1.5 px-3 text-center">
                          <span className="truncate font-[family-name:var(--font-display)] text-[12px] font-semibold text-[#10100E]">
                            {topic.name}
                          </span>
                          <span className="shrink-0 rounded-full bg-[#10100E]/20 px-1.5 text-[10px] font-semibold tabular-nums text-[#10100E]">
                            {topicTasks.length}
                          </span>
                        </div>
                      </foreignObject>
                    </g>

                    {topicTasks.map((task) => {
                      const tNode = layout.taskNodes.get(task.id);
                      if (!tNode) return null;
                      const overdue = isTaskOverdue(task);
                      const { done, total } = checklistProgress(task);
                      return (
                        <g
                          key={task.id}
                          transform={`translate(${tNode.x}, ${tNode.y})`}
                          className="cursor-pointer"
                          onClick={() => setModalTask(task)}
                        >
                          <title>
                            {task.title} — {STATUS_LABEL[task.status]},{" "}
                            {PRIORITY_LABEL[task.priority]}
                            {task.dueDate ? `, prazo ${formatDateShort(task.dueDate)}` : ""}
                            {overdue ? ", atrasada" : ""}
                          </title>
                          {/*
                            Cartão em vez de bolinha com legenda solta: o nó
                            precisa dizer o que é sem o olho ter que casar um
                            ponto com um rótulo ao lado. A faixa da esquerda
                            carrega a prioridade, e a borda vermelha marca
                            atraso — cor nunca sozinha, sempre com texto.
                          */}
                          <rect
                            x={-78}
                            y={-19}
                            width={156}
                            height={38}
                            rx={9}
                            fill="var(--surface2)"
                            stroke={overdue ? "var(--danger)" : "var(--border)"}
                            strokeWidth={overdue ? 2 : 1}
                            opacity={task.completedAt ? 0.55 : 1}
                          />
                          <path
                            d="M -78 -10 L -78 10 A 9 9 0 0 1 -78 -10 Z"
                            fill={PRIORITY_COLOR[task.priority]}
                          />
                          <rect
                            x={-78}
                            y={-19}
                            width={4}
                            height={38}
                            fill={PRIORITY_COLOR[task.priority]}
                            opacity={task.completedAt ? 0.5 : 1}
                          />
                          <foreignObject x={-72} y={-19} width={148} height={38}>
                            <div
                              className="pointer-events-none flex h-full flex-col justify-center px-2"
                              style={{ opacity: task.completedAt ? 0.6 : 1 }}
                            >
                              <span
                                className={`truncate text-[11px] font-medium leading-tight text-[var(--foreground)] ${
                                  task.completedAt ? "line-through" : ""
                                }`}
                              >
                                {task.title}
                              </span>
                              <span className="flex items-center gap-1 truncate text-[9px] leading-tight text-[var(--muted)]">
                                <span
                                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: STATUS_COLOR[task.status] }}
                                />
                                {STATUS_LABEL[task.status]}
                                {task.dueDate && (
                                  <span
                                    className="tabular-nums"
                                    style={overdue ? { color: "var(--danger)" } : undefined}
                                  >
                                    · {overdue ? "! " : ""}
                                    {formatDateShort(task.dueDate)}
                                  </span>
                                )}
                                {total > 0 && (
                                  <span className="tabular-nums">
                                    · {done}/{total}
                                  </span>
                                )}
                              </span>
                            </div>
                          </foreignObject>
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </g>
          </g>
        </svg>
      )}

      <div className="absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-md bg-[var(--surface)]/90 px-3 py-1.5 text-[11px] font-medium text-[var(--foreground)] shadow backdrop-blur">
        {Object.entries(STATUS_LABEL).map(([key, lbl]) => (
          <div key={key} className="flex items-center gap-1">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: STATUS_COLOR[key] }}
              aria-hidden="true"
            />
            {lbl}
          </div>
        ))}
      </div>

      {modalTask && (
        <TaskModal
          task={modalTask}
          defaultTopicId={modalTask.topicId}
          defaultStatus={modalTask.status}
          onClose={() => setModalTask(null)}
        />
      )}
    </div>
  );
}
