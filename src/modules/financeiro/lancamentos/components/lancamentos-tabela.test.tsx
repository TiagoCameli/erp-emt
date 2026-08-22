import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CellContext, ColumnDef } from "@tanstack/react-table";

import { montarColunas } from "@/modules/financeiro/lancamentos/components/lancamentos-tabela";
import { COLUNA_DO_BANCO } from "@/modules/financeiro/lancamentos/ordenacao";
import type { LancamentoLista } from "@/modules/financeiro/lancamentos/queries";

afterEach(() => cleanup());

function lancamento(troca: Partial<LancamentoLista> = {}): LancamentoLista {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    numero: "LAN-2026-0015",
    numeroDocumento: null,
    anexos: 0,
    tipo: "a_pagar",
    origem: "manual",
    descricao: "Combustível julho",
    categoriaNome: "Combustível",
    centroCustoRotulo: "BR-364 Lote 9",
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
      "Número do documento",
      "Tipo",
      "Fornecedor",
      "Descrição e categoria",
      // Entrou em 22/08/2026, entre a descrição e o valor: "o que é", "onde
      // cai" e "quanto" se leem nessa ordem.
      "Centro de custo",
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


describe("quais colunas ordenam", () => {
  /** Ids das colunas que a tabela deixa ordenar. */
  function ordenaveis(rotuloRecorte: string | null = null): string[] {
    return montarColunas(rotuloRecorte)
      .filter((coluna) => coluna.enableSorting !== false)
      .map((coluna) => {
        const comId = coluna as { id?: string; accessorKey?: string };
        return comId.id ?? comId.accessorKey ?? "(sem id)";
      })
      .sort();
  }

  it("a tabela e o catálogo do servidor dizem a MESMA coisa", () => {
    // ESTE TESTE AMARRA AS DUAS PONTAS. A lista ordena no servidor sobre o filtro
    // inteiro, então coluna com seta que o servidor não sabe ordenar viraria um
    // clique que não faz nada, e coluna sem seta que o servidor sabe ordenar é
    // recurso escondido. Se este teste ficar vermelho, uma das duas pontas mudou
    // sozinha.
    expect(ordenaveis()).toEqual(Object.keys(COLUNA_DO_BANCO).sort());
  });

  it("a coluna do recorte também não ordena", () => {
    // O valor da fatia é somado no app a partir das parcelas, então ele não existe
    // como coluna para o banco ordenar. Sem isto ela nasceria com seta que não
    // ordena nada, e só aparece para quem chegou clicando num relatório.
    expect(ordenaveis("Vencido")).toEqual(ordenaveis());
    expect(ordenaveis("Vencido")).not.toContain("valorRecorte");
  });

  it("fornecedor e revisão não ordenam, e isso é de propósito", () => {
    // Fornecedor vem de join e Revisão é calculada das parcelas: nenhuma das duas
    // existe como coluna de `lancamentos` para o `order` do banco.
    expect(ordenaveis()).not.toContain("fornecedorNome");
    expect(ordenaveis()).not.toContain("revisao");
  });
});

describe("sinal de anexo e número do documento", () => {
  it("o clipe fica na coluna Número, que é a que todo mundo vê", () => {
    // Numa coluna opcional o sinal só apareceria para quem já a ligou, ou seja,
    // para quem já sabia procurar. A coluna Número aparece para todo mundo.
    renderizarCelula("Número", lancamento({ anexos: 3 }));
    expect(screen.getByRole("img", { name: "3 anexos" })).toBeInTheDocument();
  });

  it("lançamento sem anexo não ganha clipe nenhum", () => {
    renderizarCelula("Número", lancamento({ anexos: 0 }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    // E o número continua lá: o clipe entra ao lado, não no lugar.
    expect(screen.getByText("LAN-2026-0015")).toBeInTheDocument();
  });

  it("mostra o número do documento do fornecedor", () => {
    renderizarCelula(
      "Número do documento",
      lancamento({ numeroDocumento: "NF 12345" }),
    );
    expect(screen.getByText("NF 12345")).toBeInTheDocument();
  });

  it("sem documento mostra traço, não célula vazia", () => {
    renderizarCelula("Número do documento", lancamento({ numeroDocumento: null }));
    expect(screen.getByText("-")).toBeInTheDocument();
  });
});
