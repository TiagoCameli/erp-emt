import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CellContext, ColumnDef } from "@tanstack/react-table";

import { colunas } from "@/modules/compras/ordens/components/ordens-tabela";
import type { OrdemLista } from "@/modules/compras/ordens/queries";

afterEach(() => cleanup());

function ordem(troca: Partial<OrdemLista> = {}): OrdemLista {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    numero: "OC-2026-0042",
    fornecedorNome: "VIBRA ENERGIA S.A",
    descricao: "Diesel S10 para a frota",
    categoriaNome: "Combustível",
    qtdCategorias: 1,
    valorTotal: 29473.5,
    status: "aprovado",
    dataCompra: "2026-08-17",
    mesCompetencia: "2026-08-01",
    condicaoPagamentoDescricao: null,
    formaPagamentoNome: null,
    cotacaoNumero: null,
    numeroDocumento: null,
    anexos: 0,
    criadoEm: "2026-08-17T14:30:00.000Z",
    criadoPorNome: "Andreia Alencar",
    quitadaSemNota: false,
    ...troca,
  };
}

/** Rótulos das colunas, na ordem em que a tela desenha. */
function rotulos(): string[] {
  return colunas.map((coluna) => String(coluna.header ?? "(sem cabeçalho)"));
}

/** Renderiza só a célula de uma coluna, para uma ordem. */
function renderizarCelula(rotulo: string, registro: OrdemLista) {
  const coluna = colunas.find((c) => String(c.header) === rotulo);
  if (!coluna) throw new Error(`coluna "${rotulo}" não existe`);

  const celula = (coluna as ColumnDef<OrdemLista, unknown> & { cell?: unknown })
    .cell;
  if (typeof celula !== "function") {
    throw new Error(`coluna "${rotulo}" não tem cell própria`);
  }
  // Só `row.original` é usado pelas células desta tabela; o resto do contexto do
  // TanStack não entra na conta. Mesmo recorte de lancamentos-tabela.test.tsx.
  const contexto = { row: { original: registro } } as CellContext<
    OrdemLista,
    unknown
  >;
  return render(<>{celula(contexto)}</>);
}

describe("sinal de anexo na lista de ordens", () => {
  it("o clipe fica na coluna Número, que é a que todo mundo vê", () => {
    // A coluna Número é `fixa`. Pôr o sinal numa coluna opcional faria ele
    // aparecer só para quem já a ligou, ou seja, para quem já sabia procurar.
    renderizarCelula("Número", ordem({ anexos: 4 }));
    expect(screen.getByRole("img", { name: "4 anexos" })).toBeInTheDocument();
  });

  it("ordem sem anexo não ganha clipe nenhum", () => {
    // Clipe apagado em toda linha vira ruído e a coluna deixa de ser lida de
    // relance: sem anexo não se desenha nada.
    renderizarCelula("Número", ordem({ anexos: 0 }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("o número da OC continua lá quando o clipe entra", () => {
    // O clipe entra AO LADO do número, nunca no lugar dele.
    renderizarCelula("Número", ordem({ anexos: 2 }));
    expect(screen.getByText("OC-2026-0042")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "2 anexos" })).toBeInTheDocument();
  });
});

describe("coluna do número do documento", () => {
  it("existe na listagem", () => {
    expect(rotulos()).toContain("Número do documento");
  });

  it("mostra o número do documento do fornecedor", () => {
    renderizarCelula(
      "Número do documento",
      ordem({ numeroDocumento: "NF 12345" }),
    );
    expect(screen.getByText("NF 12345")).toBeInTheDocument();
  });

  it("não inventa número quando a OC ainda não tem documento", () => {
    // Muita OC é emitida antes de a nota existir. A célula tem que dizer "não
    // tem", não mostrar o número da OC nem ficar em branco por acidente.
    renderizarCelula("Número do documento", ordem({ numeroDocumento: null }));
    expect(screen.queryByText("OC-2026-0042")).not.toBeInTheDocument();
  });

  /**
   * O número do documento é do FORNECEDOR e o número é o da OC no sistema: são
   * duas colunas diferentes, e juntá-las faria a busca e a conferência mentirem.
   */
  it("é uma coluna separada da coluna Número", () => {
    const lista = rotulos();
    expect(lista).toContain("Número");
    expect(lista.indexOf("Número")).not.toBe(
      lista.indexOf("Número do documento"),
    );
  });
});
