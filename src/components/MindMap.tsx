"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { Task } from "@/lib/types";
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
    // Raio proporcional ao painel: no embed estreito da visão de projeto
    // (420px de altura), usar sempre 260/150 fixos jogaria nó pra fora da
    // área visível mesmo com o hub centralizado. Painel grande (mapa em
    // tela cheia) mantém o alcance de sempre.
    const reach = Math.max(60, Math.min(center.x, center.y) - 70);
    const R1 = Math.min(260, reach);
    const R2 = Math.min(150, topicId ? reach : reach * 0.55);
    const topicNodes = new Map<string, Node & { angle: number }>();
    const taskNodes = new Map<string, Node>();

    const angleStep = (2 * Math.PI) / Math.max(visibleTopics.length, 1);
    visibleTopics.forEach((topic, i) => {
      const angle = topicId ? -Math.PI / 2 : i * angleStep - Math.PI / 2;
      const x = topicId ? 0 : R1 * Math.cos(angle);
      const y = topicId ? 0 : R1 * Math.sin(angle);
      topicNodes.set(topic.id, { x, y, angle });

      const topicTasks = rendered.filter((t) => t.topicId === topic.id);
      const isFullCircle = !!topicId;
      const arc = isFullCircle ? 2 * Math.PI : (Math.PI * 2) / 3;
      const start = angle - arc / 2;
      // Círculo completo (um só tópico aberto) não pode fechar o laço: dividir
      // por (n-1) faz o primeiro e o último nó caírem no mesmo ângulo — 360°
      // voltam pro ponto de partida. Arco parcial (vários tópicos) continua
      // dividindo por (n-1) de propósito, pra ocupar as pontas do leque.
      const denom = isFullCircle
        ? Math.max(topicTasks.length, 1)
        : Math.max(topicTasks.length - 1, 1);
      topicTasks.forEach((task, j) => {
        const a = topicTasks.length === 1 ? angle : start + (arc * j) / denom;
        taskNodes.set(task.id, { x: x + R2 * Math.cos(a), y: y + R2 * Math.sin(a) });
      });
    });

    return { topicNodes, taskNodes };
  }, [visibleTopics, rendered, topicId, center]);

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
              onClick={() => setTransform({ x: 0, y: 0, scale: 1 })}
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
                      <line
                        x1={0}
                        y1={0}
                        x2={node.x}
                        y2={node.y}
                        stroke={topic.color}
                        strokeWidth={2}
                        opacity={0.5}
                      />
                    )}
                    {topicTasks.map((task) => {
                      const tNode = layout.taskNodes.get(task.id);
                      if (!tNode) return null;
                      return (
                        <line
                          key={task.id}
                          x1={node.x}
                          y1={node.y}
                          x2={tNode.x}
                          y2={tNode.y}
                          stroke={topic.color}
                          strokeWidth={1.25}
                          opacity={0.35}
                        />
                      );
                    })}

                    <g transform={`translate(${node.x}, ${node.y})`}>
                      <circle r={34} fill={topic.color} />
                      <foreignObject x={-60} y={-34} width={120} height={68}>
                        <div className="flex h-full w-full items-center justify-center px-1 text-center text-[11px] font-semibold text-[#10100E]">
                          {topic.name}
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
                          <circle
                            r={8}
                            fill={STATUS_COLOR[task.status]}
                            stroke={overdue ? "var(--danger)" : "var(--color-ivory)"}
                            strokeWidth={overdue ? 3 : 1.5}
                          />
                          <circle
                            r={3}
                            cy={-14}
                            fill={PRIORITY_COLOR[task.priority]}
                          />
                          <foreignObject x={-70} y={12} width={140} height={44}>
                            <div className="pointer-events-none rounded bg-[var(--surface2)] px-1.5 py-0.5 text-center text-[10px] font-medium leading-tight text-[var(--foreground)] shadow-sm">
                              <span className="block truncate">{task.title}</span>
                              {(task.dueDate || total > 0) && (
                                <span className="block tabular-nums text-[9px] text-[var(--muted)]">
                                  {overdue && "! "}
                                  {task.dueDate && formatDateShort(task.dueDate)}
                                  {total > 0 && ` ☑${done}/${total}`}
                                </span>
                              )}
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
