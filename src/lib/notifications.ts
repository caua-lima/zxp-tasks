/**
 * Avisos do cronômetro na central de notificações do aparelho.
 *
 * O que dá e o que NÃO dá pra fazer aqui, porque a diferença importa:
 *
 * - Dá pra mandar um aviso ao começar um bloco e outro quando o tempo
 *   planejado acaba.
 * - NÃO dá pra desenhar um cronômetro que corre sozinho na tela de bloqueio
 *   do iPhone. Aquilo é Live Activity, exclusivo de app nativo — nenhum app
 *   web consegue criar um. O aviso daqui é uma notificação normal, parada.
 * - No iPhone, notificação de app web só existe se o app tiver sido aberto
 *   PELO ícone da tela de início. Aberto pelo Safari, a API nem existe.
 *
 * O aviso de "tempo acabou" é agendado com `setTimeout`, ou seja, depende do
 * app continuar vivo em segundo plano. O sistema pode congelar a página e
 * atrasar (ou engolir) esse aviso — por isso ele é um extra, e não a forma
 * de saber as horas: a fonte de verdade continua sendo o instante de início
 * salvo no bloco.
 */

const TAG_INICIO = "zxp-bloco-rodando";

export type EstadoNotificacao =
  /** O navegador não tem a API — no iPhone, isso quer dizer "abra pelo ícone". */
  | "indisponivel"
  /** Dá pra pedir. */
  | "default"
  | "granted"
  | "denied";

function suportado(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator
  );
}

/** O app foi aberto pelo ícone da tela de início (e não pelo navegador). */
export function estaInstalado(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS antigo não implementa display-mode e usa esta propriedade própria.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function permissaoAtual(): EstadoNotificacao {
  if (!suportado()) return "indisponivel";
  return Notification.permission as EstadoNotificacao;
}

/**
 * Pede a permissão. Só funciona a partir de um gesto do usuário — navegador
 * nenhum aceita o pedido disparado sozinho ao abrir a página.
 *
 * Devolve o resultado do próprio pedido em vez de reler
 * `Notification.permission`: no Safari do iPhone o valor lido logo depois do
 * prompt ainda vinha "default", e o aviso era descartado justamente na vez
 * em que a pessoa acabara de autorizar.
 */
export async function pedirPermissao(): Promise<EstadoNotificacao> {
  if (!suportado()) return "indisponivel";
  try {
    const resultado = await Notification.requestPermission();
    return resultado as EstadoNotificacao;
  } catch {
    return "denied";
  }
}

/**
 * O service worker ativo, ou `null` se ele não aparecer a tempo.
 *
 * `navigator.serviceWorker.ready` NUNCA resolve quando não há worker
 * registrado — não rejeita, fica pendurada. Sem esta corrida contra o
 * relógio, o `await` prendia a função pra sempre e a notificação
 * simplesmente não saía, sem erro nenhum pra denunciar o motivo.
 */
async function registroAtivo(timeoutMs = 3000): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return Promise.race([
    navigator.serviceWorker.ready.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

async function mostrar(
  titulo: string,
  opcoes: NotificationOptions,
  permissao: EstadoNotificacao = permissaoAtual()
): Promise<void> {
  if (permissao !== "granted") return;
  try {
    // Pelo service worker quando existe: é o único caminho que o iPhone
    // aceita, e no Android é o que faz a notificação sobreviver à aba
    // fechar. `new Notification()` cobre o desktop sem worker.
    const registro = await registroAtivo();
    if (registro) {
      await registro.showNotification(titulo, opcoes);
      return;
    }
    new Notification(titulo, opcoes);
  } catch {
    // Notificação é enfeite: se falhar, o app segue funcionando igual.
  }
}

const BASE: NotificationOptions = {
  icon: "/manifest-icon-192",
  badge: "/manifest-icon-192",
  tag: TAG_INICIO,
};

function horario(instante: number): string {
  return new Date(instante).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** `restanteMs` é quanto falta do bloco a partir de agora. */
export function avisarInicio(
  titulo: string,
  minutos: number,
  restanteMs: number,
  permissao?: EstadoNotificacao
): void {
  void mostrar(
    `▶ ${titulo}`,
    {
      ...BASE,
      body: `Tarefa de ${minutos} min iniciada. Termina às ${horario(Date.now() + restanteMs)}.`,
      // Sem som: começar a trabalhar não é um alarme.
      silent: true,
    },
    permissao
  );
}

export function avisarFim(titulo: string, minutos: number): void {
  void mostrar(`⏱ ${titulo}`, {
    ...BASE,
    body: `Os ${minutos} min planejados acabaram.`,
  });
}

/** Aviso de teste, pra pessoa conferir na hora que ativou. */
export function avisarTeste(permissao?: EstadoNotificacao): void {
  void mostrar(
    "ZXP Tasks",
    {
      ...BASE,
      tag: "zxp-teste",
      body: "Pronto — é assim que os avisos do cronômetro vão chegar.",
    },
    permissao
  );
}

/** Tira o aviso de "em andamento" da central — ao pausar ou concluir. */
export function limparAvisoDeInicio(): void {
  if (!suportado()) return;
  void registroAtivo()
    .then((reg) => reg?.getNotifications({ tag: TAG_INICIO }))
    .then((notificacoes) => notificacoes?.forEach((n) => n.close()))
    .catch(() => {});
}

const agendados = new Map<string, ReturnType<typeof setTimeout>>();

/** Agenda o aviso de fim. Chamar de novo pro mesmo bloco substitui o anterior. */
export function agendarFim(id: string, titulo: string, minutos: number, emMs: number): void {
  cancelarFim(id);
  if (emMs <= 0) return;
  agendados.set(
    id,
    setTimeout(() => {
      agendados.delete(id);
      avisarFim(titulo, minutos);
    }, emMs)
  );
}

export function cancelarFim(id: string): void {
  const t = agendados.get(id);
  if (t === undefined) return;
  clearTimeout(t);
  agendados.delete(id);
}
