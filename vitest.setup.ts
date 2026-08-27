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
