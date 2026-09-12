// Todo cache deste app usa este prefixo — é o que permite limpar só o que é
// nosso na ativação, sem arriscar apagar um cache de outra coisa que algum
// dia exista sob esta mesma origem (o Cache API já é isolado por origem,
// mas nada garante que só este service worker cria caches aqui).
const PREFIX = "zxp-tasks-";
const CACHE = PREFIX + "v5";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE && k.startsWith(PREFIX)).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

/**
 * Navegação (o HTML do app) é network-first: cache-first aqui prendia o
 * usuário numa versão antiga do app pra sempre, já que o HTML nunca era
 * revalidado. O cache continua servindo como fallback offline.
 *
 * Assets com hash no nome (/_next/static/...) são imutáveis: cache-first.
 */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Só resposta de verdade vira fallback offline. Cachear um 404/500
          // faria a PRÓXIMA vez offline abrir a página de erro do servidor
          // em vez do app — trocar um problema passageiro por um permanente.
          if (res.ok) {
            const copy = res.clone();
            // `waitUntil` estende a vida do evento até a escrita terminar —
            // sem isso, o navegador podia encerrar o service worker logo
            // depois de `respondWith` resolver, cancelando a gravação no
            // meio e deixando o cache silenciosamente desatualizado.
            event.waitUntil(caches.open(CACHE).then((c) => c.put(request, copy)));
          }
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok && url.pathname.startsWith("/_next/static/")) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((c) => c.put(request, copy)));
          }
          return res;
        })
    )
  );
});

/**
 * Tocar na notificação traz o app pra frente em vez de abrir outra janela —
 * no celular, abrir uma segunda instância do PWA é desnorteante.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow("/");
    })
  );
});

/**
 * Aviso vindo de outro aparelho (Web Push).
 *
 * Este handler roda mesmo com o app fechado — é o que faz "iniciei no PC"
 * chegar no celular. O `tag` é o mesmo dos avisos locais pra que um
 * substitua o outro em vez de empilhar dois cartões da mesma coisa.
 */
self.addEventListener("push", (event) => {
  let dados = { titulo: "ZXP Tasks", corpo: "" };
  try {
    if (event.data) dados = { ...dados, ...event.data.json() };
  } catch {
    // Carga que não é JSON não pode derrubar o aviso inteiro.
    if (event.data) dados.corpo = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.corpo,
      icon: "/manifest-icon-192",
      badge: "/manifest-icon-192",
      tag: "zxp-bloco-rodando",
    })
  );
});
