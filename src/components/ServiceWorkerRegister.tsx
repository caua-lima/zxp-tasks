"use client";

import { useEffect, useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function ServiceWorkerRegister() {
  // navigator.onLine não existe no SSR — o snapshot do servidor assume online.
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  );

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    /**
     * Em desenvolvimento o service worker é desregistrado, não instalado.
     *
     * Os chunks do dev server reaproveitam o mesmo nome de arquivo com
     * conteúdo diferente a cada recompilação — o `/_next/static/` que em
     * produção é imutável e pode ser servido do cache, aqui não é. Com o SW
     * ligado, editar um componente e recarregar continuava mostrando o código
     * antigo, sem nenhum erro: silencioso e caro de descobrir.
     */
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) reg.unregister();
      });
      if (typeof caches !== "undefined") {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-[80] rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-xs text-[var(--muted)] shadow-lg"
    >
      Offline — o ZXP Tasks continua funcionando e guarda os dados neste dispositivo.
    </div>
  );
}
