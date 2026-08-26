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
