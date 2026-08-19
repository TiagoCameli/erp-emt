import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  EspelhoCartoes,
  EspelhoDestaque,
  EspelhoDinheiro,
  EspelhoImpresso,
  EspelhoLinhas,
  EspelhoSecao,
  EspelhoTabela,
  tomDoStatus,
} from "@/components/canonicos/espelho-impresso";
import { EMPRESA } from "@/config/marca";
import { formatarBRL, formatarData } from "@/lib/formatadores";

// Sem globals: true no vitest.config, o cleanup automático da RTL não roda.
afterEach(cleanup);

describe("EspelhoImpresso", () => {
  it("mostra tipo, situação, número e quem emitiu", () => {
    render(
      <EspelhoImpresso
        tipo="Conta a pagar"
        numero="LAN-2026-0015"
        situacao="Em aberto"
        tom="aberto"
        emitidoPor="Tiago Cameli"
        emitidoEm="2026-08-13T14:00:00Z"
      >
        <p>conteúdo</p>
      </EspelhoImpresso>,
    );
    expect(screen.getByText("Conta a pagar")).toBeInTheDocument();
    expect(screen.getByText("· Em aberto")).toBeInTheDocument();
    expect(screen.getByText("LAN-2026-0015")).toBeInTheDocument();
    expect(screen.getByText(/Tiago Cameli/)).toBeInTheDocument();
  });

  it("identifica a empresa no cabeçalho e diz o que o papel é no rodapé", () => {
    // O endereço subiu para o topo (é assim que se lê um papel que sai da
    // empresa) e o rodapé virou uma linha só. Se um dia alguém trocar o CNPJ em
    // src/config/marca.ts, este teste acompanha em vez de brigar.
    const { container } = render(
      <EspelhoImpresso
        tipo="Conta a pagar"
        numero="LAN-2026-0015"
        emitidoPor="Tiago"
        emitidoEm="2026-08-13T14:00:00Z"
      >
        <p>conteúdo</p>
      </EspelhoImpresso>,
    );
    expect(screen.getByText(EMPRESA.razaoSocial)).toBeInTheDocument();
    expect(screen.getByText(EMPRESA.logradouro)).toBeInTheDocument();
    expect(container.textContent).toContain(
      "Documento interno — Espelho de conta a pagar",
    );
  });

  it("documento sem número diz que não tem, em vez de deixar buraco", () => {
    render(
      <EspelhoImpresso
        tipo="Conta a pagar"
        numero={null}
        emitidoPor="Tiago"
        emitidoEm="2026-08-13T14:00:00Z"
      >
        <p>conteúdo</p>
      </EspelhoImpresso>,
    );
    expect(screen.getByText("sem número")).toBeInTheDocument();
  });

  it("marca o documento com a classe de quebra de página", () => {
    const { container } = render(
      <EspelhoImpresso
        tipo="Conta a pagar"
        numero="LAN-2026-0001"
        emitidoPor="Tiago"
        emitidoEm="2026-08-13T14:00:00Z"
      >
        <p>conteúdo</p>
      </EspelhoImpresso>,
    );
    // A quebra entre documentos vive no CSS (.espelho-documento), e o
    // componente só precisa carregar a marca. Sem ela, N espelhos saem
    // emendados na mesma folha.
    expect(container.querySelector(".espelho-documento")).not.toBeNull();
  });
});

describe("tomDoStatus", () => {
  it("segue o status padrão do ERP, e não um mapa próprio do papel", () => {
    // Mesma semântica do StatusBadge da tela: efetivado verde, pendente âmbar,
    // recusado vermelho, rascunho neutro. Se o papel tivesse mapa próprio, tela
    // e documento passariam a discordar sobre a cor do mesmo lançamento.
    expect(tomDoStatus("pago")).toBe("efetivado");
    expect(tomDoStatus("recebido")).toBe("efetivado");
    expect(tomDoStatus("aprovado")).toBe("efetivado");
    expect(tomDoStatus("pendente_aprovacao")).toBe("aberto");
    expect(tomDoStatus("rejeitado")).toBe("recusado");
    expect(tomDoStatus("cancelado")).toBe("recusado");
    expect(tomDoStatus("rascunho")).toBe("neutro");
  });
});

describe("EspelhoDestaque", () => {
  it("põe o nome, o selo e o valor em destaque", () => {
    render(
      <EspelhoDestaque
        rotulo="Fornecedor"
        titulo="SEFAZ-AC"
        badge="Parcela 19/60"
        descricao="Referente parcelamento"
        valor={3881.73}
      />,
    );
    expect(screen.getByText("SEFAZ-AC")).toBeInTheDocument();
    expect(screen.getByText("Parcela 19/60")).toBeInTheDocument();
    expect(screen.getByText(/3\.881,73/)).toBeInTheDocument();
  });

  it("sem nome sai travessão, e não um destaque em branco", () => {
    render(<EspelhoDestaque rotulo="Fornecedor" titulo={null} valor={10} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("EspelhoCartoes", () => {
  it("mostra rótulo, valor e nota de cada cartão", () => {
    render(
      <EspelhoCartoes
        cartoes={[
          { rotulo: "Parcelas pagas", valor: "2 de 3", nota: "última em 26/06" },
          { rotulo: "Em aberto", valor: "R$ 1.000,00" },
        ]}
      />,
    );
    expect(screen.getByText("Parcelas pagas")).toBeInTheDocument();
    expect(screen.getByText("2 de 3")).toBeInTheDocument();
    expect(screen.getByText("última em 26/06")).toBeInTheDocument();
    expect(screen.getByText("Em aberto")).toBeInTheDocument();
  });

  it("cartão sem valor sai travessão, e não em branco", () => {
    // "Pago em" de uma parcela não paga: em branco não distingue "não tem" de
    // "esqueceram de imprimir", num papel que serve de prova.
    render(<EspelhoCartoes cartoes={[{ rotulo: "Pago em", valor: null }]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("EspelhoLinhas", () => {
  it("mostra rótulo e valor de cada linha", () => {
    render(
      <EspelhoLinhas
        linhas={[
          { rotulo: "Fornecedor", valor: "BRITAM" },
          { rotulo: "Categoria", valor: "Brita" },
        ]}
      />,
    );
    expect(screen.getByText("Fornecedor")).toBeInTheDocument();
    expect(screen.getByText("BRITAM")).toBeInTheDocument();
    expect(screen.getByText("Categoria")).toBeInTheDocument();
  });

  it("linha sem valor sai como travessão, e não como vazio ambíguo", () => {
    render(<EspelhoLinhas linhas={[{ rotulo: "Descrição", valor: null }]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("EspelhoSecao", () => {
  it("mostra o rótulo da seção e o conteúdo", () => {
    render(
      <EspelhoSecao rotulo="Itens">
        <p>um item</p>
      </EspelhoSecao>,
    );
    expect(screen.getByText("Itens")).toBeInTheDocument();
    expect(screen.getByText("um item")).toBeInTheDocument();
  });
});

describe("EspelhoTabela", () => {
  const colunas = [
    { chave: "descricao", rotulo: "Descrição" },
    { chave: "valor", rotulo: "Valor", alinharDireita: true },
  ];

  it("mostra cabeçalho e linhas", () => {
    render(
      <EspelhoTabela
        colunas={colunas}
        linhas={[{ descricao: "Pedra", valor: "R$ 100,00" }]}
      />,
    );
    expect(screen.getByText("Descrição")).toBeInTheDocument();
    expect(screen.getByText("Pedra")).toBeInTheDocument();
    expect(screen.getByText("R$ 100,00")).toBeInTheDocument();
  });

  it("sem linha nenhuma diz que não há, em vez de tabela só com cabeçalho", () => {
    render(<EspelhoTabela colunas={colunas} linhas={[]} />);
    expect(screen.getByText("Nada a listar")).toBeInTheDocument();
  });

  it("mostra a linha de totais quando ela vem", () => {
    render(
      <EspelhoTabela
        colunas={colunas}
        linhas={[{ descricao: "Pedra", valor: "R$ 100,00" }]}
        totais={{ descricao: "Total", valor: "R$ 100,00" }}
      />,
    );
    expect(screen.getByText("Total")).toBeInTheDocument();
  });

  it("célula de corpo com string vazia sai travessão, e não em branco", () => {
    // A regressão real: parcela em aberto não tem data de pagamento, e a
    // coluna "Pago em" é montada com `formatarData(parcela.dataPagamento)`.
    // Chamar o formatador de verdade (em vez de escrever "" no teste) faz
    // este teste morrer se ele mudar de contrato.
    const { container } = render(
      <EspelhoTabela
        colunas={[
          { chave: "n", rotulo: "Nº" },
          { chave: "pagamento", rotulo: "Pago em" },
        ]}
        linhas={[{ n: 1, pagamento: formatarData(null) }]}
      />,
    );
    const celulas = container.querySelectorAll("tbody td");
    expect(celulas[0]?.textContent).toBe("1");
    expect(celulas[1]?.textContent).toBe("—");
  });

  it("célula de corpo nula, indefinida ou ausente sai travessão", () => {
    const { container } = render(
      <EspelhoTabela
        colunas={[
          { chave: "nulo", rotulo: "Nulo" },
          { chave: "indefinido", rotulo: "Indefinido" },
          { chave: "ausente", rotulo: "Ausente" },
        ]}
        linhas={[{ nulo: null, indefinido: undefined }]}
      />,
    );
    const celulas = container.querySelectorAll("tbody td");
    expect(celulas[0]?.textContent).toBe("—");
    expect(celulas[1]?.textContent).toBe("—");
    expect(celulas[2]?.textContent).toBe("—");
  });

  it("zero é informação do documento e sai como 0, nunca travessão", () => {
    // Guarda contra trocar a checagem explícita por uma de "falsy": zero é
    // quantidade zero, e `false` também não é ausência de dado.
    const { container } = render(
      <EspelhoTabela
        colunas={[
          { chave: "n", rotulo: "Nº" },
          { chave: "quantidade", rotulo: "Qtd", alinharDireita: true },
          { chave: "flag", rotulo: "Flag" },
        ]}
        linhas={[{ n: 0, quantidade: 0, flag: false }]}
      />,
    );
    const celulas = container.querySelectorAll("tbody td");
    expect(celulas[0]?.textContent).toBe("0");
    expect(celulas[1]?.textContent).toBe("0");
    expect(celulas[2]?.textContent).not.toBe("—");
  });

  it("coluna sem total continua em branco na linha de totais", () => {
    // Coluna sem total é coluna que NÃO TEM total (não existe "total de
    // Descrição"). Travessão ali só encheria a linha de ruído.
    const { container } = render(
      <EspelhoTabela
        colunas={colunas}
        linhas={[{ descricao: "Pedra", valor: "R$ 100,00" }]}
        totais={{ valor: "R$ 100,00" }}
      />,
    );
    const celulas = container.querySelectorAll("tfoot td");
    expect(celulas[0]?.textContent).toBe("");
    expect(celulas[1]?.textContent).toBe("R$ 100,00");
  });
});

describe("EspelhoDinheiro", () => {
  it("formata valor real como dinheiro", () => {
    const { container } = render(<EspelhoDinheiro valor={1234.56} />);
    expect(container.textContent).toBe(formatarBRL(1234.56));
  });

  it("zero é informação do documento (desconto, juros) e continua saindo como dinheiro", () => {
    const { container } = render(<EspelhoDinheiro valor={0} />);
    expect(container.textContent).toBe(formatarBRL(0));
  });

  it("sem valor sai como travessão, e não como R$ 0,00", () => {
    const semValor = render(<EspelhoDinheiro valor={null} />);
    expect(semValor.container.textContent).toBe("—");

    const indefinido = render(<EspelhoDinheiro valor={undefined} />);
    expect(indefinido.container.textContent).toBe("—");
  });
});
