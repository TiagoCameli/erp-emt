import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  EspelhoCampos,
  EspelhoImpresso,
  EspelhoSecao,
  EspelhoTabela,
} from "@/components/canonicos/espelho-impresso";

describe("EspelhoImpresso", () => {
  it("mostra tipo, número e quem emitiu", () => {
    render(
      <EspelhoImpresso
        tipo="Ordem de compra"
        numero="OC-2026-0001"
        emitidoPor="Tiago Cameli"
        emitidoEm="2026-08-13T14:00:00Z"
      >
        <p>conteúdo</p>
      </EspelhoImpresso>,
    );
    expect(screen.getByText("Ordem de compra")).toBeInTheDocument();
    expect(screen.getByText("OC-2026-0001")).toBeInTheDocument();
    expect(screen.getByText(/Tiago Cameli/)).toBeInTheDocument();
  });

  it("documento sem número diz que não tem, em vez de deixar buraco", () => {
    render(
      <EspelhoImpresso
        tipo="Lançamento"
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
        tipo="Lançamento"
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

describe("EspelhoCampos", () => {
  it("mostra rótulo e valor de cada campo", () => {
    render(
      <EspelhoCampos
        campos={[
          { rotulo: "Fornecedor", valor: "BRITAM" },
          { rotulo: "Status", valor: "Aprovado" },
        ]}
      />,
    );
    expect(screen.getByText("Fornecedor")).toBeInTheDocument();
    expect(screen.getByText("BRITAM")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("campo sem valor sai como travessão, e não como vazio ambíguo", () => {
    render(<EspelhoCampos campos={[{ rotulo: "Observações", valor: null }]} />);
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
});
