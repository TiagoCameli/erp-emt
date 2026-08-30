import "@testing-library/jest-dom/vitest";

/**
 * Régua de canvas fingida, para o jsdom.
 *
 * O Combobox mede o rótulo mais longo com `canvas.measureText` para dimensionar
 * o painel (ver `medirLarguraDoPainel`). O jsdom não implementa `getContext`:
 * devolve null e ainda imprime "Not implemented" em TODO arquivo de teste que
 * monta um Combobox — e são muitos. Sem stub o componente cai no caminho de
 * "não deu para medir" e a conta de largura nunca é exercitada por teste
 * nenhum.
 *
 * Métrica fiel não existe aqui de qualquer jeito (o jsdom não carrega fonte
 * nem aplica o Tailwind). O que o teste precisa é que a conta seja
 * DETERMINÍSTICA, para dar para provar as duas coisas que importam: o painel
 * cresce junto com o rótulo, e para no teto. 7px por caractere é a ordem de
 * grandeza de `text-sm` numa sans-serif.
 */
export const LARGURA_POR_CARACTERE_TESTE = 7;

// Nem todo teste roda em jsdom: os de importação de planilha declaram ambiente
// `node`, e lá `HTMLCanvasElement` não existe. Sem esta guarda o setup estoura
// na CARGA do arquivo e derruba a suíte inteira antes do primeiro teste.
if (typeof HTMLCanvasElement !== "undefined") {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    writable: true,
    value: () => ({
      font: "",
      measureText: (texto: string) => ({
        width: texto.length * LARGURA_POR_CARACTERE_TESTE,
      }),
    }),
  });
}

/**
 * `ResizeObserver` fingido, também para o jsdom.
 *
 * O Radix usa `ResizeObserver` para medir o trilho do Slider
 * (`@radix-ui/react-use-size`), e o jsdom não o implementa: sem este stub, todo
 * teste que renderiza a barra da faixa de valor morre num `ReferenceError` que
 * não tem nada a ver com o que ele queria provar.
 *
 * Observa nada de propósito: o jsdom não faz layout, então não há tamanho para
 * relatar. O que o Radix precisa é que a API exista para montar o componente.
 */
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
