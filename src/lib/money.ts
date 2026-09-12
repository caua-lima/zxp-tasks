/**
 * Dinheiro em CENTAVOS (inteiro) em todo o app. Somar reais em float
 * produz "R$ 1.234,5600000001" no total de uma lista de desejos.
 */

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatBRL(cents: number): string {
  return BRL.format(cents / 100);
}

/** "R$ 1.234,56" → "1.234,56", pra preencher um input de edição. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Converte o que a pessoa digitou em centavos. Aceita as formas que
 * aparecem de verdade: "1500", "1500,50", "1.500,50", "R$ 1.500", "1500.50".
 *
 * O caso ambíguo é ponto sozinho: "1.500" em pt-BR é mil e quinhentos, mas
 * "1.5" é um e cinquenta. A regra usada — ponto com exatamente 3 dígitos
 * depois e nenhuma vírgula é separador de milhar — cobre os dois sem
 * perguntar nada a quem está digitando.
 *
 * Devolve `null` (não 0) quando não dá pra ler número nenhum: campo vazio
 * precisa ser distinguível de "custa zero".
 */
export function parseBRL(input: string): number | null {
  const cleaned = input.replace(/[R$\s ]/gi, "").trim();
  if (!cleaned) return null;
  if (!/^-?[\d.,]+$/.test(cleaned)) return null;

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  let normalized: string;
  if (hasComma && hasDot) {
    // O separador decimal é o que aparece por último.
    normalized =
      cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (hasComma) {
    normalized = cleaned.replace(",", ".");
  } else if (hasDot) {
    const afterLastDot = cleaned.length - cleaned.lastIndexOf(".") - 1;
    const isThousandSeparator = afterLastDot === 3;
    normalized = isThousandSeparator ? cleaned.replace(/\./g, "") : cleaned;
  } else {
    normalized = cleaned;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export interface ValorComposto {
  /** Soma de todas as partes, em centavos. */
  cents: number;
  /** Cada valor encontrado, em centavos, na ordem em que foi escrito. */
  parts: number[];
}

/**
 * Lê um preço montado por partes: "multimídia 1.200 + mão de obra 300".
 *
 * Um desejo quase nunca tem um preço só — tem o produto e o que falta pra
 * ele funcionar (instalação, frete, mão de obra). Obrigar a pessoa a somar
 * de cabeça antes de digitar é justamente o tipo de conta que ela abriu o
 * app pra não fazer.
 *
 * Gramática explícita, não "soma todo número do texto": o "+" é o ÚNICO
 * separador de partes. Cada parte entre "+" pode ter um rótulo livre em
 * volta, mas só pode conter UM valor reconhecido — duas partes sem "+"
 * ("iPhone 15 5000", "2 x 300") não dizem qual número é o preço, e somar os
 * dois de qualquer jeito já produziu total errado sem avisar ninguém. Sinal
 * de negativo também não é uma operação suportada aqui. Nesses casos a
 * função devolve `null`, o mesmo valor de "não tem preço nenhum" — quem
 * chama já trata os dois como "preço inválido, não salva".
 *
 * Aceita o sufixo "k" ("1.2k" = 1.200) porque é como preço costuma ser
 * falado. Devolve `null` quando não há número nenhum — campo vazio precisa
 * continuar distinguível de "custa zero".
 */
export function parseValorComposto(input: string): ValorComposto | null {
  const parts: number[] = [];
  // Sinal opcional (pra DETECTAR negativo, não pra aceitar) + dígitos com
  // ponto/vírgula no meio + "k" opcional logo depois.
  const regex = /-?\d[\d.,]*\s*k?/gi;

  for (const segmento of input.split("+")) {
    const encontrados = [...segmento.matchAll(regex)];
    if (encontrados.length === 0) continue; // parte só com rótulo — ignora
    if (encontrados.length > 1) return null; // dois números na mesma parte: ambíguo

    const bruto = encontrados[0][0].trim();
    if (bruto.startsWith("-")) return null; // negativo não é suportado
    const temK = /k$/i.test(bruto);
    const numero = temK ? bruto.slice(0, -1).trim() : bruto;
    const cents = parseBRL(numero);
    if (cents === null) return null;
    parts.push(temK ? cents * 1000 : cents);
  }

  if (parts.length === 0) return null;
  return { cents: parts.reduce((a, b) => a + b, 0), parts };
}
