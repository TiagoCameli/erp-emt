/**
 * Layout falso para testar a lista virtualizada do Combobox no jsdom.
 *
 * O jsdom não faz layout: `offsetHeight`, `clientHeight` e `scrollHeight` voltam
 * 0 e `Element.scrollTo` não existe. Sem isso o virtualizador conclui que a área
 * visível tem 0px e **não desenha linha nenhuma** — o teste então não acha as
 * opções e falha por um motivo que não tem nada a ver com o que ele queria
 * provar. Estes stubs emulam um container rolável de verdade: 300px de altura
 * visível, `scrollHeight` igual à altura declarada do espaçador, e `scrollTo`
 * gravando `scrollTop`.
 *
 * Mora aqui, e não dentro de um arquivo de teste, porque mais de um teste precisa
 * (o do próprio Combobox e o do seletor de fornecedores do extrato), e duas
 * cópias divergiriam na primeira mudança do componente.
 *
 * Só para teste: nada de produção importa este arquivo.
 */

/** Altura visível fingida da área rolável, em px. */
export const ALTURA_VISIVEL_TESTE = 300;

function ehAreaRolagem(elemento: HTMLElement) {
  return elemento.dataset.testid === "combobox-area-rolagem";
}

/** Instala os stubs. Chame uma vez, num `beforeAll`. */
export function instalarLayoutDeLista() {
  for (const propriedade of ["offsetHeight", "clientHeight"]) {
    Object.defineProperty(HTMLElement.prototype, propriedade, {
      configurable: true,
      get(this: HTMLElement) {
        return ehAreaRolagem(this) ? ALTURA_VISIVEL_TESTE : 0;
      },
    });
  }
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) {
      if (!ehAreaRolagem(this)) return 0;
      const espacador = this.firstElementChild as HTMLElement | null;
      return Number.parseFloat(espacador?.style.height ?? "0") || 0;
    },
  });
  Object.defineProperty(Element.prototype, "scrollTo", {
    configurable: true,
    writable: true,
    value(this: Element, opcoes?: { top?: number }) {
      if (typeof opcoes?.top === "number") this.scrollTop = opcoes.top;
    },
  });
}
