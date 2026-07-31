import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { Combobox } from "@/components/canonicos/combobox";
import { ComboboxCriavel } from "@/components/canonicos/combobox-criavel";

/**
 * O jsdom não faz layout: offsetHeight, clientHeight e scrollHeight voltam 0 e
 * Element.scrollTo não existe. Sem isso o virtualizador acha que a área visível
 * tem 0px (desenha janela mínima) e que o scroll máximo é 0 (scrollToIndex não
 * sai do lugar). Os stubs abaixo emulam um container rolável de verdade:
 * 300px de altura visível, scrollHeight = altura declarada do espaçador, e
 * scrollTo gravando scrollTop. O evento "scroll" quem entrega é o teste
 * (`sincronizarRolagem`), porque no navegador ele também chega depois, e não
 * dentro da chamada que rolou.
 */
const ALTURA_VISIVEL = 300;
const ALTURA_LINHA = 32;
const RESPIRO_LISTA = 8;

function ehAreaRolagem(elemento: HTMLElement) {
  return elemento.dataset.testid === "combobox-area-rolagem";
}

beforeAll(() => {
  for (const propriedade of ["offsetHeight", "clientHeight"]) {
    Object.defineProperty(HTMLElement.prototype, propriedade, {
      configurable: true,
      get(this: HTMLElement) {
        return ehAreaRolagem(this) ? ALTURA_VISIVEL : 0;
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
});

afterEach(cleanup);

const TOTAL = 3349;
/** Cadastro do tamanho real do de insumos da EMT. */
const OPCOES = Array.from({ length: TOTAL }, (_, indice) => ({
  valor: `id-${indice}`,
  rotulo: `Insumo ${indice + 1}`,
}));
const ULTIMA = OPCOES[TOTAL - 1];

function abrir(props: Partial<React.ComponentProps<typeof Combobox>> = {}) {
  const onValorChange = vi.fn();
  render(
    <Combobox
      valor=""
      onValorChange={onValorChange}
      opcoes={OPCOES}
      {...props}
    />,
  );
  fireEvent.click(screen.getByRole("combobox"));
  return { onValorChange };
}

function area() {
  return screen.getByTestId("combobox-area-rolagem");
}

/** Entrega o evento de scroll que o navegador emitiria depois de rolar. */
function sincronizarRolagem() {
  fireEvent.scroll(area());
}

function rolarPara(offset: number) {
  const rolagem = area();
  rolagem.scrollTop = offset;
  fireEvent.scroll(rolagem);
}

function linhas() {
  return screen.getAllByRole("option");
}

function textos() {
  return linhas().map((linha) => linha.textContent);
}

function destacada() {
  return linhas().find((linha) => linha.dataset.destacado === "true");
}

function campoBusca() {
  return screen.getByPlaceholderText("Buscar ou digitar");
}

describe("Combobox com cadastro grande", () => {
  it("desenha só a janela visível, não as 3.349 linhas", () => {
    abrir();
    const desenhadas = linhas().length;
    expect(desenhadas).toBeGreaterThan(0);
    expect(desenhadas).toBeLessThan(60);
  });

  it("dá ao scroll a altura das 3.349 linhas, não a de 100 itens", () => {
    abrir();
    const altura = Number.parseFloat(
      screen.getByTestId("combobox-espacador").style.height,
    );
    expect(altura).toBe(TOTAL * ALTURA_LINHA + RESPIRO_LISTA);
    // O teto antigo (100 itens) daria 3.200px; aqui tem que ser o total inteiro.
    expect(altura).toBeGreaterThan(100 * ALTURA_LINHA);
  });

  it("não mostra mais o aviso de teto de renderização", () => {
    abrir();
    expect(screen.queryByText(/refinar a busca/i)).not.toBeInTheDocument();
    expect(screen.getByText("3.349 opções. Digite para filtrar.")).toBeInTheDocument();
  });

  it("alcança a última opção rolando a lista até o fim", () => {
    const { onValorChange } = abrir();
    rolarPara(area().scrollHeight - ALTURA_VISIVEL);

    expect(textos()).toContain(ULTIMA.rotulo);
    fireEvent.click(screen.getByText(ULTIMA.rotulo));
    expect(onValorChange).toHaveBeenCalledWith(ULTIMA.valor);
  });

  it("alcança a última opção pela busca e a contagem cai", () => {
    const { onValorChange } = abrir();
    fireEvent.change(campoBusca(), { target: { value: "Insumo 3349" } });

    expect(linhas()).toHaveLength(1);
    expect(screen.getByText("1 de 3.349 opções")).toBeInTheDocument();
    fireEvent.click(linhas()[0]);
    expect(onValorChange).toHaveBeenCalledWith(ULTIMA.valor);
  });

  it("filtra sobre o conjunto todo, não sobre as primeiras 100", () => {
    abrir();
    // "Insumo 250" só existe além do teto antigo de 100 linhas.
    fireEvent.change(campoBusca(), { target: { value: "insumo 250" } });
    expect(textos()).toEqual(["Insumo 250", "Insumo 2500", "Insumo 2501", "Insumo 2502", "Insumo 2503", "Insumo 2504", "Insumo 2505", "Insumo 2506", "Insumo 2507", "Insumo 2508", "Insumo 2509"]);
  });

  it("mostra o vazio quando nada casa com o texto", () => {
    abrir();
    fireEvent.change(campoBusca(), { target: { value: "cimento branco" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("Nada encontrado")).toBeInTheDocument();
  });
});

describe("Combobox: clique cai na opção que está embaixo do cursor", () => {
  // Uma renderização por clique: selecionar fecha a lista, então clicar duas
  // vezes no mesmo painel testaria um nó já desmontado.
  it.each([0, 6, 13])(
    "seleciona o valor da linha clicada no meio do cadastro (posição %i)",
    (posicao) => {
      const { onValorChange } = abrir();
      // Rola para o meio: a janela renderizada não começa mais no índice 0.
      rolarPara(1500 * ALTURA_LINHA);

      const linha = linhas()[posicao];
      const rotulo = linha.textContent ?? "";
      const esperado = OPCOES.find((o) => o.rotulo === rotulo)?.valor;
      expect(esperado).toBeTruthy();

      fireEvent.click(linha);
      expect(onValorChange).toHaveBeenCalledTimes(1);
      expect(onValorChange).toHaveBeenCalledWith(esperado);
    },
  );

  it("mantém a identidade da linha depois da janela deslizar", () => {
    const { onValorChange } = abrir();
    rolarPara(40 * ALTURA_LINHA);

    const alvo = screen.getByText("Insumo 45").closest('[role="option"]');
    expect(alvo).toBeTruthy();

    // Desliza a janela algumas linhas: o nó DOM da opção continua sendo dela
    // (chave = valor da opção). Se fosse chaveado por posição, o mesmo nó
    // passaria a mostrar outro insumo e o clique selecionaria o vizinho.
    rolarPara(45 * ALTURA_LINHA);

    expect(alvo).toHaveTextContent("Insumo 45");
    fireEvent.click(alvo as HTMLElement);
    expect(onValorChange).toHaveBeenCalledWith("id-44");
  });

  it("não muda o destaque ao passar o mouse (sem re-render entre apertar e soltar)", () => {
    abrir();
    const antes = destacada()?.textContent;
    fireEvent.mouseMove(linhas()[5]);
    fireEvent.mouseOver(linhas()[5]);
    fireEvent.pointerMove(linhas()[5]);
    expect(destacada()?.textContent).toBe(antes);
  });
});

describe("Combobox: teclado", () => {
  it("desce com a seta além da janela renderizada e o Enter pega o destacado", () => {
    const { onValorChange } = abrir();
    const busca = campoBusca();
    for (let i = 0; i < 40; i += 1) {
      fireEvent.keyDown(busca, { key: "ArrowDown" });
    }
    // A seta passou muito além das ~20 linhas que ficam no DOM: a lista rolou
    // atrás do destaque e a linha 41 virou linha renderizada.
    expect(area().scrollTop).toBeGreaterThan(0);
    sincronizarRolagem();
    expect(destacada()).toHaveTextContent("Insumo 41");

    fireEvent.keyDown(busca, { key: "Enter" });
    expect(onValorChange).toHaveBeenCalledWith("id-40");
  });

  it("começa no primeiro item e sobe circulando para o último", () => {
    const { onValorChange } = abrir();
    const busca = campoBusca();
    expect(destacada()).toHaveTextContent("Insumo 1");

    fireEvent.keyDown(busca, { key: "ArrowUp" });
    fireEvent.keyDown(busca, { key: "Enter" });
    expect(onValorChange).toHaveBeenCalledWith(ULTIMA.valor);
  });

  it("PageDown anda de dez em dez", () => {
    const { onValorChange } = abrir();
    const busca = campoBusca();
    fireEvent.keyDown(busca, { key: "PageDown" });
    fireEvent.keyDown(busca, { key: "PageDown" });
    fireEvent.keyDown(busca, { key: "Enter" });
    expect(onValorChange).toHaveBeenCalledWith("id-20");
  });

  it("Enter seleciona o primeiro resultado do texto digitado", () => {
    const { onValorChange } = abrir();
    const busca = campoBusca();
    fireEvent.change(busca, { target: { value: "Insumo 3348" } });
    fireEvent.keyDown(busca, { key: "Enter" });
    expect(onValorChange).toHaveBeenCalledWith("id-3347");
  });

  it("Escape fecha a lista", async () => {
    abrir();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(campoBusca(), { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
    );
  });

  it("abre destacando e rolando até o valor já selecionado", () => {
    abrir({ valor: "id-2000" });
    expect(area().scrollTop).toBeGreaterThan(0);
    sincronizarRolagem();
    expect(destacada()).toHaveTextContent("Insumo 2001");
  });
});

describe("Combobox: limpar seleção", () => {
  it("limpa mesmo com o cadastro inteiro na lista", () => {
    const { onValorChange } = abrir({ valor: "id-10", limpavel: true });
    fireEvent.click(screen.getByText("Limpar seleção"));
    expect(onValorChange).toHaveBeenCalledWith("");
  });
});

describe("ComboboxCriavel", () => {
  const TEXTOS = OPCOES.map((o) => o.rotulo);

  it("cria a opção a partir do texto digitado e a seleciona", async () => {
    const onCriar = vi.fn(async () => "30/60/90 dias");
    const onValorChange = vi.fn();
    render(
      <ComboboxCriavel
        valor=""
        onValorChange={onValorChange}
        opcoes={TEXTOS}
        onCriar={onCriar}
      />,
    );
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.change(screen.getByPlaceholderText(/buscar ou digitar/i), {
      target: { value: "30/60/90 dias" },
    });
    fireEvent.click(screen.getByText('Criar "30/60/90 dias"'));

    await waitFor(() => expect(onCriar).toHaveBeenCalledWith("30/60/90 dias"));
    expect(onValorChange).toHaveBeenCalledWith("30/60/90 dias");
  });

  it("mantém o Criar clicável mesmo com milhares de opções casando", () => {
    render(
      <ComboboxCriavel
        valor=""
        onValorChange={vi.fn()}
        opcoes={TEXTOS}
        onCriar={vi.fn(async () => "Insumo")}
      />,
    );
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.change(screen.getByPlaceholderText(/buscar ou digitar/i), {
      target: { value: "Insumo" },
    });
    // Os 3.349 casam e o "Criar" segue no rodapé fixo, sem precisar rolar.
    expect(screen.getByText("3.349 de 3.349 opções")).toBeInTheDocument();
    expect(screen.getByText('Criar "Insumo"')).toBeInTheDocument();
  });

  it("o Enter cria quando nenhuma opção casa", async () => {
    const onCriar = vi.fn(async () => "À vista");
    render(
      <ComboboxCriavel
        valor=""
        onValorChange={vi.fn()}
        opcoes={TEXTOS}
        onCriar={onCriar}
      />,
    );
    fireEvent.click(screen.getByRole("combobox"));
    const busca = screen.getByPlaceholderText(/buscar ou digitar/i);
    fireEvent.change(busca, { target: { value: "À vista" } });
    fireEvent.keyDown(busca, { key: "Enter" });
    await waitFor(() => expect(onCriar).toHaveBeenCalledWith("À vista"));
  });
});
