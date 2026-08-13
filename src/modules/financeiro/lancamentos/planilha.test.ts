import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { formatarDataHora } from "@/lib/formatadores";
import type { LancamentoLista } from "@/modules/financeiro/lancamentos/queries";
import {
  ABA_PLANILHA_LANCAMENTOS,
  CABECALHOS_PLANILHA_LANCAMENTOS,
  COLUNAS_PLANILHA_LANCAMENTOS,
  dataParaCelula,
  linhaPlanilhaLancamento,
  montarPlanilhaLancamentos,
  nomeArquivoPlanilhaLancamentos,
} from "@/modules/financeiro/lancamentos/planilha";

/** Lançamento a pagar completo, o caso mais comum da lista. */
const lancamento: LancamentoLista = {
  id: "11111111-1111-4111-8111-111111111111",
  numero: "LAN-2026-0015",
  tipo: "a_pagar",
  origem: "oc",
  descricao: "Combustível julho",
  categoriaNome: "Combustível",
  fornecedorNome: "Posto Rio Branco",
  valor: 1234.56,
  dataVencimento: "2026-08-10",
  status: "aprovado",
  qtdParcelas: 3,
  dataCompra: "2026-07-10",
  mesCompetencia: "2026-07-01",
  criadoEm: "2026-07-11T14:30:00.000Z",
  revisao: "revisado",
};

/** Índice de uma coluna pelo cabeçalho, para o teste não contar posição na mão. */
function coluna(cabecalho: string): number {
  const indice = CABECALHOS_PLANILHA_LANCAMENTOS.indexOf(cabecalho);
  expect(indice, `coluna "${cabecalho}" não existe`).toBeGreaterThanOrEqual(0);
  return indice;
}

describe("linhaPlanilhaLancamento", () => {
  it("tem uma célula por cabeçalho", () => {
    // A invariante que impede o pior defeito da planilha: número embaixo do
    // título errado, com o arquivo abrindo sem erro nenhum.
    expect(linhaPlanilhaLancamento(lancamento)).toHaveLength(
      CABECALHOS_PLANILHA_LANCAMENTOS.length,
    );
  });

  it("escreve o lançamento nas colunas certas", () => {
    const linha = linhaPlanilhaLancamento(lancamento);

    expect(linha[coluna("Número")]).toBe("LAN-2026-0015");
    expect(linha[coluna("Tipo")]).toBe("A pagar");
    expect(linha[coluna("Descrição")]).toBe("Combustível julho");
    expect(linha[coluna("Categoria")]).toBe("Combustível");
    expect(linha[coluna("Fornecedor")]).toBe("Posto Rio Branco");
    expect(linha[coluna("Mês de referência")]).toBe("07/2026");
    expect(linha[coluna("Status")]).toBe("Aprovado");
    expect(linha[coluna("Parcelas")]).toBe(3);
    expect(linha[coluna("Revisão")]).toBe("Revisado");
    expect(linha[coluna("Origem")]).toBe("Ordem de compra");
    // Pelo formatador, não por literal: o texto sai no fuso de Rio Branco.
    expect(linha[coluna("Criado em")]).toBe(formatarDataHora(lancamento.criadoEm));
  });

  it("manda o valor como NÚMERO, para a planilha somar", () => {
    const valor = linhaPlanilhaLancamento(lancamento)[coluna("Valor")];
    expect(typeof valor).toBe("number");
    expect(valor).toBe(1234.56);
  });

  it("manda data da compra e vencimento como data do Excel", () => {
    const linha = linhaPlanilhaLancamento(lancamento);
    expect(linha[coluna("Data da compra")]).toBeInstanceOf(Date);
    expect((linha[coluna("Data da compra")] as Date).toISOString()).toBe(
      "2026-07-10T00:00:00.000Z",
    );
    expect((linha[coluna("Vencimento")] as Date).toISOString()).toBe(
      "2026-08-10T00:00:00.000Z",
    );
  });

  it("recebível em aberto sai como 'A receber', igual à tela", () => {
    // Todo lançamento nasce com status 'a_pagar', recebível incluído: escrever
    // "A pagar" numa conta a receber faria a planilha contradizer o sistema.
    const linha = linhaPlanilhaLancamento({
      ...lancamento,
      tipo: "a_receber",
      status: "a_pagar",
      revisao: "nao-se-aplica",
    });

    expect(linha[coluna("Tipo")]).toBe("A receber");
    expect(linha[coluna("Status")]).toBe("A receber");
    // Revisão não vale para recebível: célula em branco, não um traço que
    // atrapalharia filtro e tabela dinâmica.
    expect(linha[coluna("Revisão")]).toBe("");
  });

  it("traduz os outros estados de revisão", () => {
    expect(
      linhaPlanilhaLancamento({ ...lancamento, revisao: "sem-conta" })[
        coluna("Revisão")
      ],
    ).toBe("Sem conta");
    expect(
      linhaPlanilhaLancamento({ ...lancamento, revisao: "parcial" })[
        coluna("Revisão")
      ],
    ).toBe("Conta parcial");
  });

  it("campo vazio vira célula em branco, não 'null'", () => {
    const linha = linhaPlanilhaLancamento({
      ...lancamento,
      numero: null,
      categoriaNome: null,
      fornecedorNome: null,
      dataVencimento: null,
    });

    expect(linha[coluna("Número")]).toBe("");
    expect(linha[coluna("Categoria")]).toBe("");
    expect(linha[coluna("Fornecedor")]).toBe("");
    expect(linha[coluna("Vencimento")]).toBeNull();
  });

  it("marca as colunas de dinheiro e de data para o formato da célula", () => {
    const porTipo = (tipo: string) =>
      COLUNAS_PLANILHA_LANCAMENTOS.filter(
        (definicao) => definicao.tipo === tipo,
      ).map((definicao) => definicao.cabecalho);

    expect(porTipo("dinheiro")).toEqual(["Valor"]);
    expect(porTipo("data")).toEqual(["Data da compra", "Vencimento"]);
  });
});

describe("dataParaCelula", () => {
  it("usa meia-noite UTC, que é o que o exceljs converte sem deslocar o dia", () => {
    const data = dataParaCelula("2026-08-01");
    expect(data?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    // Série do Excel é inteira: se fosse fuso local, cairia no dia anterior.
    expect((data as Date).getTime() / 86_400_000).toBe(
      Math.trunc((data as Date).getTime() / 86_400_000),
    );
  });

  it("data ausente ou fora do formato vira célula em branco", () => {
    expect(dataParaCelula(null)).toBeNull();
    expect(dataParaCelula(undefined)).toBeNull();
    expect(dataParaCelula("")).toBeNull();
    expect(dataParaCelula("01/08/2026")).toBeNull();
  });
});

describe("nomeArquivoPlanilhaLancamentos", () => {
  it("carimba a data, para dois downloads no mês não terem o mesmo nome", () => {
    expect(nomeArquivoPlanilhaLancamentos("2026-08-13")).toBe(
      "lancamentos-2026-08-13.xlsx",
    );
  });
});

/**
 * Escreve o arquivo de verdade e relê o que saiu. É o único jeito de saber que a
 * célula de dinheiro é número (e não texto), que a data caiu no dia certo e que
 * o total é fórmula: tudo isso é escolha do exceljs no momento de gravar, e um
 * arquivo errado abre normalmente no Excel, só com o conteúdo errado.
 */
describe("montarPlanilhaLancamentos, arquivo relido", () => {
  const segundo: LancamentoLista = {
    ...lancamento,
    id: "22222222-2222-4222-8222-222222222222",
    numero: "LAN-2026-0016",
    valor: 65.44,
    dataVencimento: null,
    revisao: "sem-conta",
  };

  /** Escreve em buffer e abre de novo, como o Excel faria. */
  async function relerPlanilha(itens: LancamentoLista[]) {
    const buffer = await montarPlanilhaLancamentos(itens).xlsx.writeBuffer();
    const lido = new ExcelJS.Workbook();
    await lido.xlsx.load(buffer);
    const aba = lido.getWorksheet(ABA_PLANILHA_LANCAMENTOS);
    if (!aba) throw new Error("aba não encontrada no arquivo gerado");
    return aba;
  }

  it("grava cabeçalho, uma linha por lançamento e a linha de total", async () => {
    const aba = await relerPlanilha([lancamento, segundo]);

    expect(aba.getRow(1).getCell(1).value).toBe("Número");
    expect(aba.getRow(2).getCell(coluna("Número") + 1).value).toBe(
      "LAN-2026-0015",
    );
    expect(aba.getRow(3).getCell(coluna("Número") + 1).value).toBe(
      "LAN-2026-0016",
    );
    // Cabeçalho + 2 lançamentos + total.
    expect(aba.rowCount).toBe(4);
    expect(aba.getRow(4).getCell(1).value).toBe("Total (2 lançamentos)");
  });

  it("valor é número com formato de moeda, não texto", async () => {
    const aba = await relerPlanilha([lancamento, segundo]);
    const celula = aba.getRow(2).getCell(coluna("Valor") + 1);

    expect(celula.value).toBe(1234.56);
    expect(typeof celula.value).toBe("number");
    expect(celula.numFmt).toContain("R$");
  });

  it("data cai no dia certo (e não no anterior) com formato de data", async () => {
    const aba = await relerPlanilha([lancamento]);
    const celula = aba.getRow(2).getCell(coluna("Data da compra") + 1);

    expect(celula.value).toBeInstanceOf(Date);
    expect((celula.value as Date).toISOString()).toBe(
      "2026-07-10T00:00:00.000Z",
    );
    expect(celula.numFmt).toBe("dd/mm/yyyy");
  });

  it("total é fórmula SUBTOTAL sobre as linhas de dados", async () => {
    const aba = await relerPlanilha([lancamento, segundo]);
    const total = aba.getRow(4).getCell(coluna("Valor") + 1);

    // Fórmula e não valor fixo: acompanha o filtro e as linhas que sobrarem.
    expect(total.formula).toBe("SUBTOTAL(109,F2:F3)");
    // A fórmula precisa cobrir exatamente as linhas de dados: se pegar a própria
    // linha de total, o Excel abre com erro de referência circular.
    expect(total.formula).not.toContain("F4");
  });

  it("congela o cabeçalho e liga o filtro sem incluir a linha de total", async () => {
    const aba = await relerPlanilha([lancamento, segundo]);

    // Uma vista só, com o cabeçalho congelado (ySplit: 1 = a primeira linha).
    expect(aba.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    // Relido do arquivo o filtro volta como faixa ("A1:N3"), não como o objeto
    // que foi gravado. Linha 3 é a última de dados: a 4 é o total, e total dentro
    // do filtro seria somado como se fosse mais um lançamento.
    const ultimaColuna = aba.getColumn(COLUNAS_PLANILHA_LANCAMENTOS.length)
      .letter;
    expect(aba.autoFilter).toBe(`A1:${ultimaColuna}3`);
  });

  it("vencimento vazio fica em branco, sem virar data de 1900", async () => {
    const aba = await relerPlanilha([segundo]);
    const celula = aba.getRow(2).getCell(coluna("Vencimento") + 1);

    expect(celula.value).toBeNull();
  });
});
