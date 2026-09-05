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
 * - No iPhone, notificação de app web só existe se o app estiver instalado
 *   na tela de início (Compartilhar → Adicionar à Tela de Início) e a
 *   permissão tiver sido concedida. No navegador comum, nada aparece.
 *
 * O aviso de "tempo acabou" é agendado com `setTimeout`, ou seja, depende do
 * app continuar vivo em segundo plano. O sistema pode congelar a página e
 * atrasar (ou engolir) esse aviso — por isso ele é um extra, e não a forma
 * de saber as horas: a fonte de verdade continua sendo o instante de início
 * salvo no bloco.
 */

const TAG_INICIO = "zxp-bloco-rodando";

function suportado(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function permissaoAtual(): NotificationPermission | "indisponivel" {
  if (!suportado()) return "indisponivel";
  return Notification.permission;
}

/**
 * Pede a permissão. Só pode ser chamada a partir de um gesto do usuário —
 * os navegadores recusam pedidos disparados sozinhos ao abrir a página.
 */
export async function pedirPermissao(): Promise<NotificationPermission | "indisponivel"> {
  if (!suportado()) return "indisponivel";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

async function mostrar(titulo: string, opcoes: NotificationOptions): Promise<void> {
  if (!suportado() || Notification.permission !== "granted") return;
  try {
    // Pelo service worker quando existe: é o único caminho que funciona no
    // Android e no iPhone instalado na tela de início. `new Notification()`
    // fica de reserva pro desktop.
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(titulo, opcoes);
      return;
    }
    new Notification(titulo, opcoes);
  } catch {
    // Notificação é enfeite: se falhar, o app segue funcionando igual.
  }
}

function horario(instante: number): string {
  return new Date(instante).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** `restanteMs` é quanto falta do bloco a partir de agora. */
export function avisarInicio(titulo: string, restanteMs: number): void {
  void mostrar(`▶ ${titulo}`, {
    body: `Em andamento — termina às ${horario(Date.now() + restanteMs)}.`,
    tag: TAG_INICIO,
    icon: "/manifest-icon-192",
    badge: "/manifest-icon-192",
    // Sem som/vibração: começar a trabalhar não é um alarme.
    silent: true,
  });
}

export function avisarFim(titulo: string, minutos: number): void {
  void mostrar(`⏱ ${titulo}`, {
    body: `Os ${minutos} min planejados acabaram.`,
    tag: TAG_INICIO,
    icon: "/manifest-icon-192",
    badge: "/manifest-icon-192",
  });
}

/** Tira o aviso de "em andamento" da central — ao pausar ou concluir. */
export function limparAvisoDeInicio(): void {
  if (!suportado()) return;
  void navigator.serviceWorker
    ?.getRegistration()
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
