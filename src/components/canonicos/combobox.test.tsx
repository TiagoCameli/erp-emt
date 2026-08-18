import * as React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import {
  Combobox,
  ROTULO_VALOR_ORFAO,
  rotuloOrfao,
} from "@/components/canonicos/combobox";
import { ComboboxCriavel } from "@/components/canonicos/combobox-criavel";
import {
  ALTURA_VISIVEL_TESTE as ALTURA_VISIVEL,
  instalarLayoutDeLista,
} from "@/components/canonicos/combobox-jsdom-teste";

/**
 * O layout falso da lista virtualizada mora em `combobox-jsdom-teste`, porque o
 * teste do seletor de fornecedores precisa do mesmo.
 */
const ALTURA_LINHA = 32;
const RESPIRO_LISTA = 8;

beforeAll(() => {
  instalarLayoutDeLista();
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

/**
 * Modo múltiplo. O que não pode acontecer: o caminho de valor único mudar de
 * comportamento (são 45 arquivos usando), e a lista se reorganizar embaixo do
 * cursor enquanto se marca (é o defeito que a virtualização deste componente foi
 * feita para evitar).
 */
describe("Combobox: modo múltiplo", () => {
  function abrirMulti(valores: string[] = []) {
    const onValoresChange = vi.fn();
    render(
      <Combobox
        valor=""
        onValorChange={vi.fn()}
        valores={valores}
        onValoresChange={onValoresChange}
        opcoes={OPCOES}
        limpavel
      />,
    );
    fireEvent.click(screen.getByRole("combobox"));
    return { onValoresChange };
  }

  it("marcar acrescenta sem tirar o que já estava", () => {
    const { onValoresChange } = abrirMulti(["id-0"]);
    fireEvent.click(screen.getByText("Insumo 2"));
    expect(onValoresChange).toHaveBeenCalledWith(["id-0", "id-1"]);
  });

  it("clicar de novo desmarca", () => {
    const { onValoresChange } = abrirMulti(["id-0", "id-1"]);
    fireEvent.click(screen.getByText("Insumo 1"));
    expect(onValoresChange).toHaveBeenCalledWith(["id-1"]);
  });

  it("o painel NÃO fecha ao marcar", () => {
    // Marcar cinco fornecedores não pode custar cinco aberturas.
    abrirMulti([]);
    fireEvent.click(screen.getByText("Insumo 1"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("os já marcados aparecem no topo quando o painel abre", () => {
    abrirMulti(["id-100", "id-200"]);
    const linhas = screen.getAllByRole("option");
    expect(linhas[0]).toHaveTextContent("Insumo 101");
    expect(linhas[1]).toHaveTextContent("Insumo 201");
  });

  it("a ordem NÃO muda enquanto se marca, para o clique não cair no vizinho", () => {
    // Com pai de verdade, que grava a escolha e re-renderiza: é o único jeito de
    // provar o congelamento. Sem ele o teste passaria por não haver re-render.
    function Pai() {
      const [escolhidos, setEscolhidos] = React.useState<string[]>([]);
      return (
        <Combobox
          valor=""
          onValorChange={vi.fn()}
          valores={escolhidos}
          onValoresChange={setEscolhidos}
          opcoes={OPCOES}
        />
      );
    }
    cleanup();
    render(<Pai />);
    fireEvent.click(screen.getByRole("combobox"));

    const primeiraAntes = screen.getAllByRole("option")[0].textContent;
    // Marca uma opção lá de baixo da janela visível.
    fireEvent.click(screen.getByText("Insumo 5"));

    // Ela foi marcada de fato. A busca é dentro da LISTA porque o gatilho passa a
    // mostrar o nome do único selecionado, e "Insumo 5" casaria nos dois.
    const lista = within(screen.getByRole("listbox"));
    expect(lista.getByText("Insumo 5").closest('[role="option"]')).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // ...e mesmo assim a primeira linha continua a mesma: nada pulou de lugar.
    expect(screen.getAllByRole("option")[0]).toHaveTextContent(
      primeiraAntes ?? "",
    );
  });

  it("ao reabrir, aí sim os marcados sobem para o topo", () => {
    function Pai() {
      const [escolhidos, setEscolhidos] = React.useState<string[]>([]);
      return (
        <Combobox
          valor=""
          onValorChange={vi.fn()}
          valores={escolhidos}
          onValoresChange={setEscolhidos}
          opcoes={OPCOES}
        />
      );
    }
    cleanup();
    render(<Pai />);
    const gatilho = screen.getByRole("combobox");

    fireEvent.click(gatilho);
    fireEvent.click(within(screen.getByRole("listbox")).getByText("Insumo 5"));
    fireEvent.click(gatilho); // fecha
    fireEvent.click(gatilho); // abre de novo

    expect(screen.getAllByRole("option")[0]).toHaveTextContent("Insumo 5");
  });

  it("o gatilho conta os marcados, e mostra o nome quando é um só", () => {
    cleanup();
    const { rerender } = render(
      <Combobox
        valor=""
        onValorChange={vi.fn()}
        valores={["id-5"]}
        onValoresChange={vi.fn()}
        opcoes={OPCOES}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("Insumo 6");

    rerender(
      <Combobox
        valor=""
        onValorChange={vi.fn()}
        valores={["id-5", "id-6", "id-7"]}
        onValoresChange={vi.fn()}
        opcoes={OPCOES}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("3 selecionados");
  });

  it("limpar seleção zera tudo de uma vez", () => {
    const { onValoresChange } = abrirMulti(["id-1", "id-2"]);
    fireEvent.click(screen.getByText("Limpar seleção (todos)"));
    expect(onValoresChange).toHaveBeenCalledWith([]);
  });

  it("Enter no teclado alterna em vez de fechar", () => {
    const { onValoresChange } = abrirMulti([]);
    const busca = screen.getByPlaceholderText("Buscar ou digitar");
    fireEvent.keyDown(busca, { key: "Enter" });
    expect(onValoresChange).toHaveBeenCalledWith(["id-0"]);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("id escolhido que não está na lista de opções não some da seleção", () => {
    // Acontece com link colado: o fornecedor pode ter saído do filtro do select.
    cleanup();
    render(
      <Combobox
        valor=""
        onValorChange={vi.fn()}
        valores={["id-orfao"]}
        onValoresChange={vi.fn()}
        opcoes={OPCOES}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("id-orfao");
  });

  it("sem as props do plural, segue sendo seleção única e fecha ao escolher", () => {
    // A trava de regressão dos 45 arquivos que já usam o componente.
    const { onValorChange } = abrir({ valor: "id-0", limpavel: true });
    fireEvent.click(screen.getByText("Insumo 2"));
    expect(onValorChange).toHaveBeenCalledWith("id-1");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
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

describe("valor fora das opcoes", () => {
  const UUID = "eb121acd-11e8-4b41-9f69-8aede125ba3d";

  it("nao mostra o UUID: cai em 'Registro nao encontrado'", () => {
    render(<Combobox valor={UUID} onValorChange={vi.fn()} opcoes={OPCOES} />);
    const gatilho = screen.getByRole("combobox");
    expect(gatilho).toHaveTextContent(ROTULO_VALOR_ORFAO);
    expect(gatilho.textContent).not.toContain(UUID);
  });

  it("mostra o nome quando quem chama sabe qual e", () => {
    render(
      <Combobox
        valor={UUID}
        onValorChange={vi.fn()}
        opcoes={OPCOES}
        rotuloDoValor="Boleto 30 dias"
      />,
    );
    const gatilho = screen.getByRole("combobox");
    expect(gatilho).toHaveTextContent("Boleto 30 dias");
    expect(gatilho.textContent).not.toContain(UUID);
  });

  it("rotuloDoValor so de espaco nao vale como nome", () => {
    render(
      <Combobox
        valor={UUID}
        onValorChange={vi.fn()}
        opcoes={OPCOES}
        rotuloDoValor="   "
      />,
    );
    expect(screen.getByRole("combobox")).toHaveTextContent(ROTULO_VALOR_ORFAO);
  });

  it("valor de texto (filtro vindo da URL) continua aparecendo como e", () => {
    // Caso que a regra antiga existia para atender, e que nao pode regredir:
    // em filtro o proprio valor e legivel e informa.
    render(
      <Combobox valor="aprovado" onValorChange={vi.fn()} opcoes={OPCOES} />,
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("aprovado");
  });

  it("o valor orfao continua selecionavel na lista, com o nome certo", () => {
    render(
      <Combobox
        valor={UUID}
        onValorChange={vi.fn()}
        opcoes={OPCOES}
        rotuloDoValor="Boleto 30 dias"
      />,
    );
    fireEvent.click(screen.getByRole("combobox"));
    expect(within(area()).getByText("Boleto 30 dias")).toBeInTheDocument();
  });

  it("no modo multiplo o id marcado tambem nao vira UUID na tela", () => {
    render(
      <Combobox
        valor=""
        onValorChange={vi.fn()}
        valores={[UUID]}
        onValoresChange={vi.fn()}
        opcoes={OPCOES}
      />,
    );
    const gatilho = screen.getByRole("combobox");
    expect(gatilho).toHaveTextContent(ROTULO_VALOR_ORFAO);
    expect(gatilho.textContent).not.toContain(UUID);
  });

  it("valor que existe nas opcoes ignora rotuloDoValor", () => {
    render(
      <Combobox
        valor={ULTIMA.valor}
        onValorChange={vi.fn()}
        opcoes={OPCOES}
        rotuloDoValor="nome errado que nao deve aparecer"
      />,
    );
    const gatilho = screen.getByRole("combobox");
    expect(gatilho).toHaveTextContent(ULTIMA.rotulo);
    expect(gatilho.textContent).not.toContain("nome errado");
  });
});

describe("rotuloOrfao", () => {
  it("UUID em qualquer caixa vira o aviso", () => {
    expect(rotuloOrfao("EB121ACD-11E8-4B41-9F69-8AEDE125BA3D")).toBe(
      ROTULO_VALOR_ORFAO,
    );
  });

  it("texto livre passa inteiro", () => {
    expect(rotuloOrfao("Boleto 30 dias")).toBe("Boleto 30 dias");
    expect(rotuloOrfao("2026-08")).toBe("2026-08");
  });

  it("quase-UUID nao e UUID", () => {
    expect(rotuloOrfao("eb121acd-11e8-4b41-9f69")).toBe(
      "eb121acd-11e8-4b41-9f69",
    );
  });
});
