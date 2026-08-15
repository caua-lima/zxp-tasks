"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";

interface SidebarProps {
  selectedTopicId: string | null;
  onSelectTopic: (id: string | null) => void;
  view: "kanban" | "mindmap";
  onChangeView: (view: "kanban" | "mindmap") => void;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({
  selectedTopicId,
  onSelectTopic,
  view,
  onChangeView,
  open,
  onClose,
}: SidebarProps) {
  const { topics, tasks, addTopic, renameTopic, deleteTopic } = useApp();
  const [newTopic, setNewTopic] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  function handleAddTopic(e: React.FormEvent) {
    e.preventDefault();
    const name = newTopic.trim();
    if (!name) return;
    const topic = addTopic(name);
    setNewTopic("");
    onSelectTopic(topic.id);
  }

  function startEdit(id: string, name: string) {
    setEditingId(id);
    setEditingName(name);
  }

  function commitEdit() {
    if (editingId && editingName.trim()) {
      renameTopic(editingId, editingName);
    }
    setEditingId(null);
  }

  function handleDelete(id: string) {
    if (confirm("Excluir este tópico e todas as suas tarefas?")) {
      deleteTopic(id);
      if (selectedTopicId === id) onSelectTopic(null);
    }
  }

  function selectTopic(id: string | null) {
    onSelectTopic(id);
    onClose();
  }

  function changeView(v: "kanban" | "mindmap") {
    onChangeView(v);
    onClose();
  }

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}
      <aside
        className={`${open ? "flex" : "hidden"} fixed inset-y-0 left-0 z-40 h-full w-72 shrink-0 flex-col border-r border-black/10 bg-[var(--background)] dark:border-white/10 md:static md:flex md:w-64 md:bg-black/[0.02] md:dark:bg-white/[0.03]`}
      >
      <div className="flex items-start justify-between p-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Tarefas ZXP</h1>
          <p className="text-xs text-black/50 dark:text-white/50">
            Kanban pessoal por tópicos
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-black/50 hover:bg-black/5 dark:text-white/50 dark:hover:bg-white/10 md:hidden"
          aria-label="Fechar menu"
        >
          ×
        </button>
      </div>

      <div className="flex gap-1 px-3 pb-3">
        <button
          onClick={() => changeView("kanban")}
          className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition ${
            view === "kanban"
              ? "bg-black text-white dark:bg-white dark:text-black"
              : "bg-black/5 text-black/70 hover:bg-black/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"
          }`}
        >
          Kanban
        </button>
        <button
          onClick={() => changeView("mindmap")}
          className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition ${
            view === "mindmap"
              ? "bg-black text-white dark:bg-white dark:text-black"
              : "bg-black/5 text-black/70 hover:bg-black/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"
          }`}
        >
          Mapa mental
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3">
        <button
          onClick={() => selectTopic(null)}
          className={`mb-1 flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition ${
            selectedTopicId === null
              ? "bg-black/10 dark:bg-white/10"
              : "hover:bg-black/5 dark:hover:bg-white/5"
          }`}
        >
          <span className="font-medium">Todos os tópicos</span>
          <span className="text-xs text-black/40 dark:text-white/40">
            {tasks.length}
          </span>
        </button>

        <div className="mt-2 space-y-0.5">
          {topics.map((topic) => {
            const count = tasks.filter((t) => t.topicId === topic.id).length;
            return (
              <div
                key={topic.id}
                className={`group flex items-center gap-2 rounded-md px-2 py-2 text-sm transition ${
                  selectedTopicId === topic.id
                    ? "bg-black/10 dark:bg-white/10"
                    : "hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: topic.color }}
                />
                {editingId === topic.id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="min-w-0 flex-1 rounded border border-black/20 bg-transparent px-1 py-0.5 text-sm outline-none dark:border-white/20"
                  />
                ) : (
                  <button
                    onClick={() => selectTopic(topic.id)}
                    onDoubleClick={() => startEdit(topic.id, topic.name)}
                    className="min-w-0 flex-1 truncate text-left"
                    title="Clique duplo para renomear"
                  >
                    {topic.name}
                  </button>
                )}
                <span className="text-xs text-black/40 dark:text-white/40">
                  {count}
                </span>
                <button
                  onClick={() => handleDelete(topic.id)}
                  className="hidden shrink-0 text-black/30 hover:text-red-500 group-hover:block dark:text-white/30"
                  title="Excluir tópico"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <form onSubmit={handleAddTopic} className="border-t border-black/10 p-3 dark:border-white/10">
        <div className="flex gap-1.5">
          <input
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            placeholder="Novo tópico..."
            className="min-w-0 flex-1 rounded-md border border-black/15 bg-white px-2 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:bg-black/20 dark:focus:border-white/40"
          />
          <button
            type="submit"
            className="shrink-0 rounded-md bg-black px-2.5 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            +
          </button>
        </div>
      </form>
      </aside>
    </>
  );
}
