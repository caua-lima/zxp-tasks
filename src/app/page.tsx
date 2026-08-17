"use client";

import { useMemo, useState } from "react";
import { AppProvider, useApp } from "@/context/AppContext";
import { Sidebar } from "@/components/Sidebar";
import { KanbanBoard } from "@/components/KanbanBoard";
import { MindMap } from "@/components/MindMap";
import { TopBar } from "@/components/TopBar";
import { TaskPriority } from "@/lib/types";

function HomeInner() {
  const { topics, ready } = useApp();
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [view, setView] = useState<"kanban" | "mindmap">("kanban");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | null>(null);

  const title = useMemo(() => {
    if (!selectedTopicId) return "Todos os tópicos";
    return topics.find((t) => t.id === selectedTopicId)?.name ?? "Todos os tópicos";
  }, [selectedTopicId, topics]);

  if (!ready) return null;

  return (
    <div className="flex h-dvh w-full">
      <Sidebar
        selectedTopicId={selectedTopicId}
        onSelectTopic={setSelectedTopicId}
        view={view}
        onChangeView={setView}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={title}
          onMenuClick={() => setSidebarOpen(true)}
          priorityFilter={priorityFilter}
          onChangePriorityFilter={setPriorityFilter}
        />
        <div className="min-h-0 flex-1">
          {view === "kanban" ? (
            <KanbanBoard topicId={selectedTopicId} priorityFilter={priorityFilter} />
          ) : (
            <MindMap topicId={selectedTopicId} priorityFilter={priorityFilter} />
          )}
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <AppProvider>
      <HomeInner />
    </AppProvider>
  );
}
