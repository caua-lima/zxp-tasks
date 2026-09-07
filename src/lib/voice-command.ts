/**
 * Interpreta o que foi ditado: "Tarefa Chamar Leads por 40 minutos".
 *
 * É função pura de propósito — o microfone é um detalhe do navegador, e a
 * parte que erra de verdade (achar a duração no meio da frase, limpar o
 * título) precisa poder ser testada sem falar com ninguém.
 */

export interface ComandoDeVoz {
  titulo: string;
  /** Minutos ditados. Ausente = a pessoa não disse tempo nenhum. */
  minutos?: number;
}

/**
 * Números por extenso que aparecem falando de tempo.
 *
 * O reconhecimento de voz costuma devolver dígitos ("40"), mas nem sempre —
 * "quarenta minutos" volta escrito com frequência suficiente pra valer o
 * mapa. Só os que uma pessoa realmente usa pra dizer duração.
 */
const NUMEROS: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  quinze: 15,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  noventa: 90,
  // "meia hora" são 30 minutos, não meia unidade de 30: o valor é 0,5 e a
  // unidade é que decide. Com `meia: 30` a conta dava 1800 minutos.
  meia: 0.5,
  meio: 0.5,
};

/** Sem acento e em minúsculas, só pra comparar — o título original é preservado. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** "tarefa", "nova tarefa", "adicionar tarefa" no começo são cerimônia. */
const PREFIXOS = [
  "adicionar tarefa",
  "adiciona tarefa",
  "nova tarefa",
  "criar tarefa",
  "cria tarefa",
  "tarefa",
  "bloco",
];

const UNIDADE = "(minutos|minuto|min|horas|hora|h)\\b";
const NUMERO = `(\\d{1,3}|${Object.keys(NUMEROS).join("|")})`;
// "por 40 minutos", "de 1 hora", "durante 30 min", ou só "40 minutos".
const DURACAO = new RegExp(`(?:\\b(?:por|de|durante|em)\\s+)?\\b${NUMERO}\\s*${UNIDADE}`, "i");

function valorDoNumero(bruto: string): number | null {
  const limpo = normalizar(bruto);
  if (/^\d+$/.test(limpo)) return Number(limpo);
  return NUMEROS[limpo] ?? null;
}

export function interpretarComandoDeVoz(fala: string): ComandoDeVoz | null {
  const original = fala.trim();
  if (!original) return null;

  // A busca acontece no texto sem acento, mas os índices valem pro original:
  // normalizar preserva o tamanho de cada caractere (só troca "á" por "a").
  const semAcento = normalizar(original);
  const achado = DURACAO.exec(semAcento);

  let minutos: number | undefined;
  let restante = original;

  if (achado) {
    const valor = valorDoNumero(achado[1]);
    const unidade = achado[2];
    if (valor !== null) {
      const emHoras = unidade.startsWith("h");
      minutos = Math.round(emHoras ? valor * 60 : valor);
      // Tira o trecho da duração de onde ele estava, sem mexer no resto.
      restante = original.slice(0, achado.index) + original.slice(achado.index + achado[0].length);
    }
  }

  let titulo = restante.replace(/\s+/g, " ").trim();

  const semAcentoTitulo = normalizar(titulo);
  for (const prefixo of PREFIXOS) {
    if (semAcentoTitulo.startsWith(prefixo + " ")) {
      titulo = titulo.slice(prefixo.length).trim();
      break;
    }
    if (semAcentoTitulo === prefixo) {
      titulo = "";
      break;
    }
  }

  // Sobras de ligação que ficam pendurando quando a duração vem no meio.
  titulo = titulo
    .replace(/[,;]+$/g, "")
    .replace(/\s+(por|de|durante|em)$/i, "")
    .trim();

  if (!titulo) return null;

  return {
    titulo: titulo.charAt(0).toUpperCase() + titulo.slice(1),
    ...(minutos !== undefined && minutos > 0 ? { minutos } : {}),
  };
}
