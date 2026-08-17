import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CellContext, ColumnDef } from "@tanstack/react-table";

import { montarColunas } from "@/modules/financeiro/lancamentos/components/lancamentos-tabela";
import type { LancamentoLista } from "@/modules/financeiro/lancamentos/queries";

afterEach(() => cleanup());

function lancamento(troca: Partial<LancamentoLista> = {}): LancamentoLista {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    numero: "LAN-2026-0015",
    tipo: "a_pagar",
    origem: "manual",
    descricao: "Combustível julho",
    categoriaNome: "Combustível",
    fornecedorNome: "GUERRA IMPLEMENTOS RODOVIARIOS S.A",
    valor: 1234.56,
    dataVencimento: "2026-08-10",
    status: "a_pagar",
    qtdParcelas: 3,
    dataCompra: "2026-07-10",
    mesCompetencia: "2026-07-01",
    criadoEm: "2026-07-11T14:30:00.000Z",
    valorPago: 0,
    valorAberto: 1234.56,
    valorVencido: 0,
    descontoObtido: 0,
    revisao: "sem-conta",
    // Sem recorte: a coluna do recorte só existe quando a URL recorta.
    valorRecorte: null,
    ...troca,
  };
}

/** Rótulo de cada coluna, na ordem em que a tabela mostra. */
function rotulos(rotuloRecorte: string | null = null): string[] {
  return montarColunas(rotuloRecorte).map((coluna) => {
    const meta = coluna.meta as { rotulo?: string } | undefined;
    if (meta?.rotulo) return meta.rotulo;
    return typeof coluna.header === "string" ? coluna.header : "(sem rótulo)";
  });
}

/** Renderiza a célula de uma coluna para um lançamento. */
function renderizarCelula(
  rotulo: string,
  registro: LancamentoLista,
): ReturnType<typeof render> {
  const coluna = montarColunas(null).find((c) => {
    const meta = c.meta as { rotulo?: string } | undefined;
    return meta?.rotulo === rotulo || c.header === rotulo;
  });
  if (!coluna) throw new Error(`coluna "${rotulo}" não existe na tabela`);
  const celula = (coluna as ColumnDef<LancamentoLista, unknown>).cell;
  if (typeof celula !== "function") {
    throw new Error(`coluna "${rotulo}" não tem cell própria`);
  }
  // Só `row.original` é usado pelas células desta tabela; o resto do contexto do
  // TanStack não entra na conta.
  const contexto = { row: { original: registro } } as CellContext<
    LancamentoLista,
    unknown
  >;
  return render(<>{celula(contexto)}</>);
}

describe("coluna de fornecedor na listagem", () => {
  it("existe, e vem antes da descrição", () => {
    // Antes de quem? Do que descreve a compra. Quem varre a lista lê "de quem é"
    // junto com "o que é": é o par que identifica o lançamento numa linha.
    const lista = rotulos();
    expect(lista).toContain("Fornecedor");
    expect(lista.indexOf("Fornecedor")).toBeLessThan(
      lista.indexOf("Descrição e categoria"),
    );
  });

  it("mostra o nome do fornecedor", () => {
    renderizarCelula("Fornecedor", lancamento());
    expect(
      screen.getByText("GUERRA IMPLEMENTOS RODOVIARIOS S.A"),
    ).toBeInTheDocument();
  });

  it("lançamento sem fornecedor mostra traço, não vazio", () => {
    // Célula em branco numa lista densa parece falha de carregamento. O traço é
    // o padrão do app para "não tem", e é o que as outras colunas já fazem.
    renderizarCelula("Fornecedor", lancamento({ fornecedorNome: null }));
    expect(screen.getByText("-")).toBeInTheDocument();
  });
});

describe("as colunas de sempre continuam lá", () => {
  it("mantém a ordem e o conjunto conhecido", () => {
    // Guarda contra remover ou reordenar coluna sem querer: a lista é a régua
    // que a pessoa vê, e a preferência salva por usuário se apoia nos ids.
    expect(rotulos()).toEqual([
      "Número",
      "Tipo",
      "Fornecedor",
      "Descrição e categoria",
      "Valor",
      "Data da compra",
      "Mês de referência",
      "Vencimento",
      "Revisão",
      "Status",
    ]);
  });

  it("com recorte entra a coluna do recorte, sem tirar as outras", () => {
    const comRecorte = rotulos("Vencido");
    expect(comRecorte).toContain("Vencido");
    expect(comRecorte).toContain("Fornecedor");
    expect(comRecorte.length).toBe(rotulos().length + 1);
  });
});
