import { Board, Meta, Programacao, ScheduleBlock, Task, WeeklyReviewNote } from "./types";

/**
 * Assinatura canônica: JSON com as chaves de cada objeto em ordem e sem
 * chaves `undefined`.
 *
 * `JSON.stringify` puro não serve para comparar com o que volta do banco: o
 * `jsonb` do Postgres não guarda a ordem das chaves, e `undefined` some no
 * caminho. Sem normalizar, o mesmo conteúdo dava "diferente".
 */
export function assinatura(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(assinatura).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${assinatura(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

const igual = (a: unknown, b: unknown) => assinatura(a) === assinatura(b);

/**
 * Os dois lados mudaram o mesmo item desde a última versão em comum.
 *
 * Com `updatedAt` nos dois (tarefas têm), vence a edição mais recente. Sem
 * ele: se existe versão em comum, vence o local — é o que a pessoa acabou de
 * fazer neste aparelho; se NÃO existe (primeiro login aqui, ou primeira vez
 * depois desta correção), vence a nuvem — o aparelho pode estar parado há
 * dias, e deixar ele vencer era exatamente o que desfazia renomeações.
 */
function escolher<T>(local: T, remoto: T, temBase: boolean): T {
  const l = (local as { updatedAt?: unknown }).updatedAt;
  const r = (remoto as { updatedAt?: unknown }).updatedAt;
  if (typeof l === "string" && typeof r === "string" && l !== r) return l > r ? local : remoto;
  return temBase ? local : remoto;
}

/**
 * Mescla de três vias de uma coleção por chave.
 *
 * Pra cada item compara o local, o remoto e a base (a última versão que este
 * aparelho sabe estar igual à nuvem):
 * - só um lado mudou → vale a mudança (renomear no PC chega no celular, em vez
 *   de o celular "renomear de volta" pro nome velho que ainda tinha);
 * - um lado apagou e o outro não mexeu → fica apagado (antes voltava);
 * - apagou de um lado e EDITOU do outro → fica, com a edição: perder trabalho
 *   é pior que um item reaparecer;
 * - os dois mudaram → `conflito`.
 */
function mesclarPorChave<T>(
  local: T[],
  base: T[] | null,
  remoto: T[],
  chave: (x: T) => string,
  conflito: (l: T, r: T, b: T | undefined) => T
): T[] {
  const mapaR = new Map(remoto.map((x) => [chave(x), x]));
  const mapaB = base ? new Map(base.map((x) => [chave(x), x])) : null;
  const vistos = new Set<string>();
  const resultado: T[] = [];

  const decidir = (k: string, l: T | undefined, r: T | undefined) => {
    const b = mapaB?.get(k);
    if (l !== undefined && r !== undefined) {
      if (igual(l, r)) return l;
      if (b !== undefined && igual(l, b)) return r;
      if (b !== undefined && igual(r, b)) return l;
      return conflito(l, r, b);
    }
    const unico = (l ?? r) as T;
    // Existia na base e sumiu de um lado: apagado de propósito, a não ser que
    // o lado que ainda tem tenha editado depois.
    if (b !== undefined && igual(unico, b)) return undefined;
    return unico;
  };

  for (const l of local) {
    const k = chave(l);
    if (vistos.has(k)) continue;
    vistos.add(k);
    const v = decidir(k, l, mapaR.get(k));
    if (v !== undefined) resultado.push(v);
  }
  for (const r of remoto) {
    const k = chave(r);
    if (vistos.has(k)) continue;
    vistos.add(k);
    const v = decidir(k, undefined, r);
    if (v !== undefined) resultado.push(v);
  }
  return resultado;
}

/** Mapa `chave → valor` mesclado em três vias, entrada a entrada. */
function mesclarMapa<V>(
  local: Record<string, V>,
  base: Record<string, V> | null,
  remoto: Record<string, V>,
  conflito: (l: V, r: V) => V
): Record<string, V> {
  const paraLista = (m: Record<string, V>) => Object.entries(m).map(([k, v]) => ({ k, v }));
  const lista = mesclarPorChave(
    paraLista(local),
    base ? paraLista(base) : null,
    paraLista(remoto),
    (e) => e.k,
    (l, r) => ({ k: l.k, v: conflito(l.v, r.v) })
  );
  return Object.fromEntries(lista.map((e) => [e.k, e.v]));
}

/**
 * Metas: o mesmo dia anotado nos dois aparelhos é mesclado dia a dia. Só um
 * lado anotou → vale a anotação (inclusive desfazer). Os dois mexeram no
 * mesmo dia → o maior valor, que nunca inventa progresso.
 */
function conflitoDeMeta(temBase: boolean) {
  return (l: Meta, r: Meta, b: Meta | undefined): Meta => ({
    ...escolher(l, r, temBase),
    registros: mesclarMapa(l.registros, b?.registros ?? null, r.registros, (x, y) => Math.max(x, y)),
  });
}

/** Feriado tirado num aparelho precisa valer no outro — senão o bloco volta. */
function conflitoDeProgramacao(temBase: boolean) {
  return (l: Programacao, r: Programacao): Programacao => ({
    ...escolher(l, r, temBase),
    diasPulados: [...new Set([...(l.diasPulados ?? []), ...(r.diasPulados ?? [])])],
  });
}

/**
 * Une o quadro deste aparelho com o da nuvem.
 *
 * `base` é a última versão que este aparelho sabe estar igual à nuvem — é o
 * que permite distinguir "eu mudei isto" de "isto só está velho aqui". Sem
 * ela (`null`), tudo que difere é tratado como conflito e a nuvem vence.
 */
export function sincronizarQuadros(local: Board, base: Board | null, remoto: Board): Board {
  const temBase = base !== null;
  const padrao = <T,>(l: T, r: T) => escolher(l, r, temBase);
  const porId = <T extends { id: string }>(x: T) => x.id;

  const topics = mesclarPorChave(local.topics, base?.topics ?? null, remoto.topics, porId, padrao);
  const groups = mesclarPorChave(local.groups ?? [], base?.groups ?? null, remoto.groups ?? [], porId, padrao);
  const schedule = mesclarPorChave<ScheduleBlock>(
    local.schedule,
    base?.schedule ?? null,
    remoto.schedule,
    porId,
    padrao
  );
  const metas = mesclarPorChave(
    local.metas ?? [],
    base?.metas ?? null,
    remoto.metas ?? [],
    porId,
    conflitoDeMeta(temBase)
  );
  const programacoes = mesclarPorChave(
    local.programacoes ?? [],
    base?.programacoes ?? null,
    remoto.programacoes ?? [],
    porId,
    conflitoDeProgramacao(temBase)
  );

  // Tarefa cujo tópico não existe em lugar nenhum ficaria invisível. Só
  // descarta a que veio de fora — a que já está aqui é da pessoa e fica.
  const idsTopicos = new Set(topics.map((t) => t.id));
  const idsLocais = new Set(local.tasks.map((t) => t.id));
  const tasks = mesclarPorChave<Task>(local.tasks, base?.tasks ?? null, remoto.tasks, porId, padrao)
    .filter((t) => idsLocais.has(t.id) || idsTopicos.has(t.topicId));

  // Revisão é uma por SEMANA: os dois aparelhos podem ter criado a da mesma
  // semana com ids diferentes, e duas revisões da mesma semana não fazem sentido.
  const semanas = new Set<string>();
  const weeklyReviews = mesclarPorChave<WeeklyReviewNote>(
    local.weeklyReviews,
    base?.weeklyReviews ?? null,
    remoto.weeklyReviews,
    porId,
    padrao
  ).filter((w) => (semanas.has(w.weekStart) ? false : (semanas.add(w.weekStart), true)));

  const dailyFocus = mesclarMapa(local.dailyFocus, base?.dailyFocus ?? null, remoto.dailyFocus, padrao);

  const settings =
    base && igual(local.settings, base.settings)
      ? remoto.settings
      : base && igual(remoto.settings, base.settings)
        ? local.settings
        : padrao(local.settings, remoto.settings);

  return {
    ...local,
    topics,
    tasks,
    groups,
    schedule,
    weeklyReviews,
    dailyFocus,
    settings,
    metas,
    programacoes,
  };
}
