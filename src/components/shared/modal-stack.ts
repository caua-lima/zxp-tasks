/**
 * Pilha dos diálogos empilháveis abertos no momento (Modal, CommandPalette),
 * do mais antigo ao mais recente — só o do topo deve reagir a Escape/Tab.
 *
 * `stopPropagation` sozinho não resolve isso: dois listeners de `keydown`
 * presos direto no `document` não têm relação de ancestralidade entre si,
 * então os dois recebem a mesma tecla independente do que um faz com ela.
 */
let pilha: symbol[] = [];

export function entrarNaPilha(id: symbol) {
  pilha.push(id);
}

export function sairDaPilha(id: symbol) {
  pilha = pilha.filter((existente) => existente !== id);
}

export function souOTopoDaPilha(id: symbol) {
  return pilha[pilha.length - 1] === id;
}
