"use client";

import { useMemo, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { Task } from "@/lib/types";
import { TaskModal } from "./TaskModal";

const STATUS_LABEL: Record<string, string> = {
  todo: "A fazer",
  doing: "Fazendo",
  done: "Feito",
};

interface Node {
  x: number;
  y: number;
}

interface MindMapProps {
  topicId: string | null;
}

export function MindMap({ topicId }: MindMapProps) {
  const { topics, tasks } = useApp();
  const [modalTask, setModalTask] = useState<Task | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const dragState = useRef<{ x: number; y: number } | null>(null);

  const visibleTopics = topicId ? topics.filter((t) => t.id === topicId) : topics;

  const layout = useMemo(() => {
    const R1 = 260;
    const R2 = 140;
    const topicNodes = new Map<string, Node & { angle: number }>();
    const taskNodes = new Map<string, Node>();

    const angleStep = (2 * Math.PI) / Math.max(visibleTopics.length, 1);
    visibleTopics.forEach((topic, i) => {
      const angle = topicId ? -Math.PI / 2 : i * angleStep - Math.PI / 2;
      const x = topicId ? 0 : R1 * Math.cos(angle);
      const y = topicId ? 0 : R1 * Math.sin(angle);
      topicNodes.set(topic.id, { x, y, angle });

      const topicTasks = tasks.filter((t) => t.topicId === topic.id);
      const arc = topicId ? 2 * Math.PI : (Math.PI * 2) / 3;
      const start = angle - arc / 2;
      topicTasks.forEach((task, j) => {
        const denom = Math.max(topicTasks.length - 1, 1);
        const a =
          topicTasks.length === 1
            ? angle
            : start + (arc * j) / denom;
        taskNodes.set(task.id, {
          x: x + R2 * Math.cos(a),
          y: y + R2 * Math.sin(a),
        });
      });
    });

    return { topicNodes, taskNodes };
  }, [visibleTopics, tasks, topicId]);

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    setTransform((t) => ({
      ...t,
      scale: Math.min(2.5, Math.max(0.4, t.scale - e.deltaY * 0.001)),
    }));
  }

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

  const statusColor: Record<string, string> = {
    todo: "#94a3b8",
    doing: "#eab308",
    done: "#22c55e",
  };

  if (topics.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-center text-sm text-black/50 dark:text-white/50">
        Crie um tópico e algumas tarefas pra ver o mapa mental.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(circle,_rgba(0,0,0,0.04)_1px,_transparent_1px)] bg-[length:20px_20px] dark:bg-[radial-gradient(circle,_rgba(255,255,255,0.06)_1px,_transparent_1px)]">
      <div className="absolute right-3 top-3 z-10 flex gap-1">
        <button
          onClick={() => setTransform((t) => ({ ...t, scale: Math.min(2.5, t.scale + 0.15) }))}
          className="rounded-md bg-white px-2 py-1 text-sm font-medium shadow hover:bg-black/5 dark:bg-neutral-800 dark:hover:bg-white/10"
        >
          +
        </button>
        <button
          onClick={() => setTransform((t) => ({ ...t, scale: Math.max(0.4, t.scale - 0.15) }))}
          className="rounded-md bg-white px-2 py-1 text-sm font-medium shadow hover:bg-black/5 dark:bg-neutral-800 dark:hover:bg-white/10"
        >
          −
        </button>
        <button
          onClick={() => setTransform({ x: 0, y: 0, scale: 1 })}
          className="rounded-md bg-white px-2 py-1 text-sm font-medium shadow hover:bg-black/5 dark:bg-neutral-800 dark:hover:bg-white/10"
        >
          reset
        </button>
      </div>

      <svg
        className="h-full w-full cursor-grab active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <g
          transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}
        >
          <g transform="translate(600, 400)">
            {!topicId && (
              <>
                <circle r={44} fill="var(--foreground)" opacity={0.9} />
                <text
                  textAnchor="middle"
                  dy="5"
                  fontSize={13}
                  fontWeight={600}
                  fill="var(--background)"
                >
                  Tarefas
                </text>
              </>
            )}

            {visibleTopics.map((topic) => {
              const node = layout.topicNodes.get(topic.id);
              if (!node) return null;
              const topicTasks = tasks.filter((t) => t.topicId === topic.id);
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
                      <div className="flex h-full w-full items-center justify-center px-1 text-center text-[11px] font-semibold text-white">
                        {topic.name}
                      </div>
                    </foreignObject>
                  </g>

                  {topicTasks.map((task) => {
                    const tNode = layout.taskNodes.get(task.id);
                    if (!tNode) return null;
                    return (
                      <g
                        key={task.id}
                        transform={`translate(${tNode.x}, ${tNode.y})`}
                        className="cursor-pointer"
                        onClick={() => setModalTask(task)}
                      >
                        <circle r={7} fill={statusColor[task.status]} stroke="white" strokeWidth={1.5} />
                        <foreignObject x={-70} y={10} width={140} height={40}>
                          <div className="pointer-events-none rounded bg-white/90 px-1.5 py-0.5 text-center text-[10px] font-medium leading-tight text-black shadow-sm dark:bg-neutral-800/90 dark:text-white">
                            {task.title}
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

      <div className="absolute bottom-3 left-3 flex gap-3 rounded-md bg-white/80 px-3 py-1.5 text-[11px] font-medium shadow backdrop-blur dark:bg-neutral-800/80">
        {Object.entries(STATUS_LABEL).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: statusColor[key] }}
            />
            {label}
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
