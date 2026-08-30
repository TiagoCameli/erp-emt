import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { LINHAS_CABECALHO_MARCA } from "@/lib/planilha-marca";
import {
  abaAging,
  abaCustoCc,
  abaDre,
  abaPosicaoBancaria,
} from "@/modules/financeiro/relatorios/planilha-abas";
import {
  montarPlanilhaDeRelatorio,
  type EscritaDeAba,
} from "@/modules/financeiro/relatorios/planilha-relatorio";

/**
 * As abas de exportação dos relatórios financeiros.
 *
 * Os testes releem o .xlsx GERADO: o que precisa estar certo é o arquivo que
 * chega na mão de quem recebe, e uma célula sob o cabeçalho errado abre sem erro
 * nenhum. Cada asserção casa a célula pelo ÍNDICE DO CABEÇALHO, nunca por
 * posição fixa, para que acrescentar coluna não faça o teste passar mentindo.
 */

const LINHA_HEADER = LINHAS_CABECALHO_MARCA + 1;

async function ler(escrita: EscritaDeAba) {
  const workbook = montarPlanilhaDeRelatorio([escrita]);
  const buffer = await workbook.xlsx.writeBuffer();
  const lido = new ExcelJS.Workbook();
  await lido.xlsx.load(buffer as ArrayBuffer);
  const planilha = lido.worksheets[0];
  const cabecalhos = (planilha.getRow(LINHA_HEADER).values as unknown[]).slice(
    1,
  ) as string[];
  const celula = (linha: number, cabecalho: string) => {
    const indice = cabecalhos.indexOf(cabecalho);
    expect(indice, `coluna "${cabecalho}" não existe`).toBeGreaterThanOrEqual(0);
    return planilha.getRow(LINHA_HEADER + linha).getCell(indice + 1).value;
  };
  return { planilha, cabecalhos, celula };
}

describe("aba do aging", () => {
  const dados = {
    aPagar: [
      { faixa: "a_vencer" as const, rotulo: "A vencer", valor: 9941603.46 },
      { faixa: "v_1_7" as const, rotulo: "Vencido 1 a 7 dias", valor: 40600 },
    ],
    aReceber: [
      { faixa: "a_vencer" as const, rotulo: "A vencer", valor: 8202830.19 },
      { faixa: "v_1_7" as const, rotulo: "Vencido 1 a 7 dias", valor: 0 },
    ],
    totalAPagar: 9982203.46,
    totalAReceber: 8202830.19,
    vencidoAPagar: 40600,
    vencidoAReceber: 0,
  };

  it("põe a pagar e a receber lado a lado, pareados pela faixa", async () => {
    const { celula } = await ler(abaAging(dados));

    expect(celula(1, "Faixa de vencimento")).toBe("A vencer");
    expect(celula(1, "A pagar")).toBe(9941603.46);
    expect(celula(1, "A receber")).toBe(8202830.19);
    // O pareamento é por índice, e as duas listas vêm sempre com as mesmas
    // faixas na mesma ordem. Se um dia deixarem de vir, esta linha denuncia.
    expect(celula(2, "Faixa de vencimento")).toBe("Vencido 1 a 7 dias");
    expect(celula(2, "A receber")).toBe(0);
  });

  it("o dinheiro vai como número, para a planilha somar", async () => {
    const { planilha, cabecalhos } = await ler(abaAging(dados));
    const coluna = planilha.getColumn(cabecalhos.indexOf("A pagar") + 1);
    expect(coluna.numFmt).toBe("R$ #,##0.00");
  });
});

describe("aba do DRE", () => {
  const bloco = (categoria: string, valor: number) => ({
    receitas: [],
    despesas: [{ categoriaId: null, categoria, valor }],
    totalReceitas: 0,
    totalDespesas: valor,
    resultado: -valor,
  });

  const dados = {
    mes: "2026-08",
    operacional: {
      receitas: [{ categoriaId: null, categoria: "Outras receitas", valor: 7059 }],
      despesas: [{ categoriaId: null, categoria: "Combustível", valor: 691566.94 }],
      totalReceitas: 7059,
      totalDespesas: 691566.94,
      resultado: -684507.94,
    },
    financeiro: bloco("Tarifa Bancária", 1521.75),
    movimentacao: bloco("Pagamento de Empréstimo", 37300),
    resultado: -686029.69,
  };

  it("achata os três blocos em COLUNA, não em seção", async () => {
    // Seção obrigaria a inventar linha de título no meio dos dados e destruiria
    // o filtro do Excel, que é o motivo de exportar.
    const { celula, planilha } = await ler(abaDre(dados, "agosto de 2026"));

    expect(celula(1, "Bloco")).toBe("Operacional");
    expect(celula(1, "Categoria")).toBe("Outras receitas");
    expect(celula(1, "Receita")).toBe(7059);
    // Receita e despesa em colunas separadas: a mesma linha nunca tem as duas.
    expect(celula(1, "Despesa")).toBeNull();

    expect(celula(2, "Categoria")).toBe("Combustível");
    expect(celula(2, "Despesa")).toBe(691566.94);
    expect(celula(2, "Receita")).toBeNull();

    // Os três blocos entram, inclusive a movimentação — ela é dinheiro que
    // passou na conta, e sumir com ela criaria a pergunta "por que o extrato
    // tem movimento que o sistema não tem".
    const blocos = [1, 2, 3, 4].map(
      (i) => planilha.getRow(LINHA_HEADER + i).getCell(1).value,
    );
    expect(blocos).toEqual([
      "Operacional",
      "Operacional",
      "Financeiro",
      "Movimentação",
    ]);
  });

  it("o rótulo do total avisa que a movimentação não é resultado", async () => {
    const { planilha } = await ler(abaDre(dados, "agosto de 2026"));
    const totais = planilha.getRow(LINHA_HEADER + 5);
    expect(String(totais.getCell(1).value)).toContain("NÃO é resultado");
  });

  it("o recorte vai escrito no cabeçalho do arquivo", async () => {
    // Planilha circula por e-mail e é lida semanas depois: sem o filtro dentro
    // do arquivo, número certo lido no recorte errado é pior que faltar número.
    const { planilha } = await ler(abaDre(dados, "Mês de referência ago/2026"));
    const contexto = String(planilha.getCell(3, 1).value);
    expect(contexto).toContain("Mês de referência ago/2026");
  });
});

describe("aba da posição bancária", () => {
  const dados = {
    contas: [
      {
        contaId: "c1",
        nome: "BANCO DO BRASIL 102.124-9",
        banco: "Banco do Brasil",
        saldoInicial: 155484.34,
        saldoInicialData: "2026-08-21",
        entradas: 906000,
        saidas: 932631.66,
        saldoAtual: 128852.68,
      },
    ],
    totalSaldoInicial: 155484.34,
    totalEntradas: 906000,
    totalSaidas: 932631.66,
    totalSaldoAtual: 128852.68,
    contasOcultas: 0,
  };

  it("leva a data do saldo inicial, que é o recorte das outras colunas", async () => {
    // Sem ela, "Entradas" e "Saídas" parecem o histórico inteiro da conta, e
    // são só o movimento posterior a este dia.
    const { celula } = await ler(abaPosicaoBancaria(dados));

    expect(celula(1, "Conta")).toBe("BANCO DO BRASIL 102.124-9");
    expect(celula(1, "Saldo inicial em")).toEqual(
      new Date(Date.UTC(2026, 7, 21)),
    );
    expect(celula(1, "Saldo atual")).toBe(128852.68);
  });

  it("o rótulo do total avisa da transferência entre contas", async () => {
    // As colunas Entradas e Saídas somam a transferência nas DUAS pontas, então
    // o total consolidado não é o que a empresa recebeu nem o que pagou.
    const { planilha } = await ler(abaPosicaoBancaria(dados));
    const totais = planilha.getRow(LINHA_HEADER + 2);
    expect(String(totais.getCell(1).value)).toContain("transferência");
  });
});

describe("aba do custo por centro de custo", () => {
  const dados = {
    centros: [
      { centroCustoId: "a", nome: "009 - BR-364", codigo: "009", valor: 750 },
      { centroCustoId: "b", nome: "Escritório Central", codigo: null, valor: 250 },
    ],
    total: 1000,
  };

  it("a participação é FRAÇÃO, que é o que o formato de % do Excel espera", async () => {
    const { celula, planilha, cabecalhos } = await ler(
      abaCustoCc(dados, "Mês de referência ago/2026"),
    );

    // 0,75 com formato "0.0%" aparece como 75,0%. Gravar 75 mostraria 7500%.
    expect(celula(1, "Participação")).toBe(0.75);
    expect(celula(2, "Participação")).toBe(0.25);
    expect(
      planilha.getColumn(cabecalhos.indexOf("Participação") + 1).numFmt,
    ).toBe("0.0%");
  });

  it("soma o custo e NÃO soma a participação", async () => {
    const { planilha, cabecalhos } = await ler(abaCustoCc(dados, "x"));
    const totais = planilha.getRow(LINHA_HEADER + 3);

    const comFormula: string[] = [];
    totais.eachCell((cell, coluna) => {
      if (typeof cell.value === "object" && cell.value && "formula" in cell.value) {
        comFormula.push(cabecalhos[coluna - 1]);
      }
    });

    // Percentual somado dá 100% num caso e outra coisa depois que alguém filtra.
    expect(comFormula).toEqual(["Custo"]);
  });
});
