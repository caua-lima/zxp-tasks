"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppProvider, useApp } from "@/context/AppContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Sidebar, ViewKey } from "@/components/Sidebar";
import { MindMap } from "@/components/MindMap";
import { TopBar } from "@/components/TopBar";
import { TodayView } from "@/components/today/TodayView";
import { ScheduleView } from "@/components/schedule/ScheduleView";
import { GoalsView } from "@/components/goals/GoalsView";
import { WeeklyReview } from "@/components/review/WeeklyReview";
import { RelatorioView } from "@/components/report/RelatorioView";
import { MetasView } from "@/components/metas/MetasView";
import { ProjectView } from "@/components/projects/ProjectView";
import { TaskModal } from "@/components/TaskModal";
import { DataPanel } from "@/components/shared/DataPanel";
import { AccountPanel } from "@/components/shared/AccountPanel";
import { CommandPalette, Command } from "@/components/shared/CommandPalette";
import { ShortcutsHelp } from "@/components/shared/ShortcutsHelp";
import { ToastProvider, useToast } from "@/components/shared/Toast";
import { PuxarParaRecarregar } from "@/components/shared/PuxarParaRecarregar";
import { PortaDeEntrada } from "@/components/shared/PortaDeEntrada";
import { SortKey, TaskFilters } from "@/lib/task-filters";
import { Task } from "@/lib/types";

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/**
 * O quadro na tela continua funcionando (fica em memória), mas algo no
 * armazenamento deste navegador não está bem — silenciar isso é o que fazia
 * um board corrompido virar vazio sem ninguém notar.
 */
function AvisoDeArmazenamento({
  tipo,
}: {
  tipo: "corrompido" | "cota-excedida" | "indisponivel" | "desconhecido";
}) {
  const texto: Record<typeof tipo, string> = {
    corrompido:
      "O que estava salvo neste navegador ficou ilegível. O app abriu vazio, mas uma cópia do conteúdo original foi guardada — exporte os dados (Dados > Exportar) assim que puder pra não depender só dela.",
    "cota-excedida":
      "O armazenamento deste navegador está cheio. As últimas alterações podem não ter sido salvas aqui — exporte um backup e considere apagar backups antigos em Dados.",
    indisponivel:
      "Não consegui salvar neste navegador agora (aba anônima, armazenamento bloqueado). O que você fizer nesta sessão pode se perder ao fechar a aba.",
    desconhecido:
      "Não consegui salvar as últimas alterações neste navegador. Exporte um backup em Dados pra não correr risco.",
  };
  return (
    <div
      role="alert"
      className="border-b border-[var(--warning)] bg-[var(--surface2)] px-4 py-2 text-xs text-[var(--foreground)]"
    >
      ⚠️ {texto[tipo]}
    </div>
  );
}

function HomeInner() {
  const { topics, tasks, ready, setTaskStatus, getLastOpenedTaskId, storageError } = useApp();
  const { showToast } = useToast();
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>("schedule");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filters, setFilters] = useState<TaskFilters>({});
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const { user } = useAuth();
  const [quickTask, setQuickTask] = useState<Task | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);

  const pendingGoTo = useRef(false);

  const selectedTopic = topics.find((t) => t.id === selectedTopicId);

  const title = useMemo(() => {
    if (view === "schedule") return "Cronograma";
    if (view === "goals") return "Projetos";
    if (view === "metas") return "Metas";
    if (view === "today") return "Hoje";
    if (view === "review") return "Revisão semanal";
    if (view === "report") return "Relatório";
    if (view === "mindmap") return "Mapa mental";
    if (view === "project") return selectedTopic?.name ?? "Projeto";
    if (!selectedTopicId) return "Todos os tópicos";
    return selectedTopic?.name ?? "Todos os tópicos";
  }, [view, selectedTopicId, selectedTopic]);

  const openNewTask = useCallback(() => {
    setQuickTask(null);
    setQuickOpen(true);
  }, []);

  const openTask = useCallback((task: Task) => {
    setQuickTask(task);
    setQuickOpen(true);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;

      // Sequência "g" + destino, no estilo dos apps de teclado.
      if (pendingGoTo.current) {
        pendingGoTo.current = false;
        const destino: Record<string, ViewKey> = {
          c: "schedule",
          o: "goals",
          h: "today",
          m: "mindmap",
          r: "review",
          l: "report",
        };
        const alvo = destino[e.key.toLowerCase()];
        if (alvo) {
          e.preventDefault();
          setView(alvo);
          return;
        }
      }

      const key = e.key.toLowerCase();
      if (key === "g") {
        pendingGoTo.current = true;
        return;
      }
      if (key === "n") {
        e.preventDefault();
        openNewTask();
      } else if (key === "/") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
      } else if (key === "e" || key === "d") {
        const lastId = getLastOpenedTaskId();
        const task = lastId ? tasks.find((t) => t.id === lastId) : undefined;
        if (!task) return;
        e.preventDefault();
        if (key === "e") {
          openTask(task);
        } else if (task.status !== "done") {
          const previous = task.status;
          setTaskStatus(task.id, "done");
          showToast("Tarefa concluída.", () => setTaskStatus(task.id, previous));
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openNewTask, openTask, getLastOpenedTaskId, tasks, setTaskStatus, showToast]);

  const commands: Command[] = useMemo(
    () => [
      { id: "new", label: "Nova tarefa", hint: "N", run: openNewTask },
      { id: "schedule", label: "Ir para Cronograma", hint: "G C", run: () => setView("schedule") },
      { id: "goals", label: "Ir para Projetos", hint: "G P", run: () => setView("goals") },
      { id: "metas", label: "Ir para Metas", run: () => setView("metas") },
      { id: "today", label: "Ir para Hoje (foco)", hint: "G H", run: () => setView("today") },
      { id: "mind", label: "Ir para Mapa mental", hint: "G M", run: () => setView("mindmap") },
      {
        id: "review",
        label: "Ir para Revisão semanal",
        hint: "G R",
        run: () => setView("review"),
      },
      {
        id: "report",
        label: "Ir para Relatório",
        hint: "G L",
        run: () => setView("report"),
      },
      { id: "data", label: "Abrir dados e backup", run: () => setDataOpen(true) },
      {
        id: "account",
        label: user ? "Abrir conta" : "Entrar",
        run: () => setAccountOpen(true),
      },
      { id: "help", label: "Mostrar atalhos", hint: "?", run: () => setHelpOpen(true) },
      {
        id: "all-topics",
        label: "Ver todos os tópicos",
        run: () => {
          setSelectedTopicId(null);
          setView("goals");
        },
      },
      ...topics
        .filter((t) => !t.archivedAt && !t.deletedAt)
        .map((t) => ({
          id: `topic-${t.id}`,
          label: `Abrir projeto: ${t.name}`,
          hint: "Projeto",
          run: () => {
            setSelectedTopicId(t.id);
            setView("project");
          },
        })),
    ],
    [openNewTask, topics, user]
  );

  if (!ready) return null;

  const filterMode: "full" | "priority" | "none" =
    view === "mindmap"
      ? "full"
      : view === "today"
        ? "priority"
        : "none";

  return (
    <div className="flex h-dvh w-full">
      <Sidebar
        selectedTopicId={selectedTopicId}
        onSelectTopic={(id) => {
          setSelectedTopicId(id);
          // Clicar num tópico abre o projeto; "todos" volta pra lista deles.
          setView(id ? "project" : "goals");
        }}
        view={view}
        onChangeView={setView}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenAccount={() => setAccountOpen(true)}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={title}
          onMenuClick={() => setSidebarOpen(true)}
          filters={filters}
          onChangeFilters={setFilters}
          sortKey={sortKey}
          onChangeSort={setSortKey}
          filterMode={filterMode}
          onOpenData={() => setDataOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
        />
        {storageError && <AvisoDeArmazenamento tipo={storageError} />}
        <PuxarParaRecarregar className="min-h-0 flex-1 overflow-y-auto">
          {view === "schedule" && <ScheduleView />}
          {view === "goals" && (
            <GoalsView
              onOpenTopic={(id) => {
                setSelectedTopicId(id);
                setView("project");
              }}
            />
          )}
          {view === "today" && (
            <TodayView
              onOpenProjects={() => setView("goals")}
              priorityFilter={filters.priority ?? null}
              searchTerm={filters.search ?? ""}
            />
          )}
          {/* Sempre a vida inteira, nunca só o projeto selecionado — o mapa
              de UM projeto já existe dentro dele mesmo (aba "Mapa mental"
              do projeto). Repetir o recorte aqui seria a mesma tela duas
              vezes, só que com menos contexto em volta. */}
          {view === "mindmap" && (
            <MindMap topicId={null} filters={filters} sortKey={sortKey} />
          )}
          {view === "review" && <WeeklyReview />}
          {view === "report" && <RelatorioView />}
          {view === "metas" && <MetasView />}
          {view === "project" &&
            (selectedTopicId ? (
              <ProjectView topicId={selectedTopicId} />
            ) : (
              <div className="p-6 text-center text-sm text-[var(--muted)]">
                Escolha um tópico na barra lateral.
              </div>
            ))}
        </PuxarParaRecarregar>
      </main>

      {paletteOpen && (
        <CommandPalette
          commands={commands}
          onOpenTask={openTask}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {dataOpen && <DataPanel onClose={() => setDataOpen(false)} />}
      {accountOpen && <AccountPanel onClose={() => setAccountOpen(false)} />}
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}

      {quickOpen && (
        <TaskModal
          task={quickTask}
          defaultTopicId={selectedTopicId}
          defaultStatus="todo"
          onClose={() => setQuickOpen(false)}
        />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <AppProvider>
        <ToastProvider>
          {/* A porta fica DENTRO dos provedores: o quadro local continua
              sendo carregado, e é ele que se une ao da nuvem no primeiro
              login em vez de ficar órfão neste navegador. */}
          <PortaDeEntrada>
            <HomeInner />
          </PortaDeEntrada>
        </ToastProvider>
      </AppProvider>
    </AuthProvider>
  );
}
