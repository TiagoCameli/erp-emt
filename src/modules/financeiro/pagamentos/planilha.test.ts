import { describe, expect, it } from "vitest";

import { SEM_CENTRO_DE_CUSTO } from "@/modules/financeiro/_shared/formato";
import {
  cabecalhosPagamentos,
  colunasPagamentos,
  expandirPagamentos,
  linhaPlanilhaPagamento,
  montarPlanilhaPagamentos,
  nomeArquivoPlanilhaPagamentos,
  valorBaseDoPagamento,
  type PagamentoPlanilha,
  type RateioDoPagamento,
} from "@/modules/financeiro/pagamentos/planilha";

const CARRETA = "c-carretas";
const ETAPA_A = "e-sqs7e01";
const ETAPA_B = "e-squ9c94";
const ESCRITORIO = "c-escritorio";

function rateio(sobrescrever: Partial<RateioDoPagamento> = {}): RateioDoPagamento {
  return {
    centroId: CARRETA,
    raizId: CARRETA,
    raizNome: "001 - Carretas EMT",
    etapaNome: null,
    valor: 100,
    ...sobrescrever,
  };
}

function pagamento(
  sobrescrever: Partial<PagamentoPlanilha> = {},
): PagamentoPlanilha {
  return {
    id: "p1",
    lancamentoNumero: "LAN-2026-2195",
    numeroDocumento: "NF 4471",
    numeroParcela: 1,
    totalParcelas: 10,
    descricao: "REFERENTE SEGURO DOS CAMINHÕES/CARRETAS",
    categoriaNome: "Manutenção de equipamentos",
    fornecedorNome: "BANCO BRADESCO S/A",
    origem: "manual",
    mesCompetencia: "2026-03-01",
    dataCompra: "2026-03-25",
    dataVencimento: "2026-04-02",
    dataProgramada: "2026-04-02",
    dataPagamento: null,
    contaNome: "Caixa 578367973-5",
    formaPagamentoNome: "Boleto",
    status: "aprovado",
    valor: 11_848.99,
    desconto: 0,
    juros: 0,
    outrasDespesas: 0,
    valorLiquido: 11_848.99,
    rateios: [rateio({ valor: 11_848.99 })],
    ...sobrescrever,
  };
}

/** Índice da coluna pelo cabeçalho, para o teste não depender da ordem. */
function coluna(
  aba: "a-pagar" | "pagas",
  formato: "pagamento" | "centro" | "rateio",
  cabecalho: string,
): number {
  const indice = cabecalhosPagamentos(aba, formato).indexOf(cabecalho);
  expect(indice, `coluna "${cabecalho}" não existe`).toBeGreaterThanOrEqual(0);
  return indice;
}

/** Soma em CENTAVOS inteiros: somar reais em float acumula resto binário. */
function somaEmCentavos(valores: readonly number[]): number {
  return valores.reduce((soma, valor) => soma + Math.round(valor * 100), 0);
}

describe("valorBaseDoPagamento", () => {
  it("na fila a pagar é o valor devido da parcela", () => {
    const aberta = pagamento({ valor: 100, valorLiquido: 100 });
    expect(valorBaseDoPagamento(aberta, "a-pagar")).toBe(100);
  });

  it("nas pagas é o LÍQUIDO: o que saiu da conta", () => {
    // Desconto, juros e outras despesas mudam o que a conta pagou. Ratear o
    // bruto poria na obra um dinheiro que nunca saiu.
    const paga = pagamento({
      valor: 100,
      desconto: 10,
      juros: 2,
      outrasDespesas: 3,
      valorLiquido: 95,
    });
    expect(valorBaseDoPagamento(paga, "pagas")).toBe(95);
  });
});

describe("expandirPagamentos", () => {
  it("no formato por pagamento é uma linha por parcela, com o valor cheio", () => {
    const itens = [pagamento({ id: "a" }), pagamento({ id: "b" })];
    const linhas = expandirPagamentos(itens, "pagamento", "a-pagar");
    expect(linhas).toHaveLength(2);
    expect(linhas[0].valorFatia).toBe(11_848.99);
    expect(linhas[0].partes).toBe(1);
  });

  it("abre uma parcela rateada entre três centros em três linhas", () => {
    const dividida = pagamento({
      valor: 100_000,
      valorLiquido: 100_000,
      rateios: [
        rateio({ centroId: ETAPA_A, raizId: CARRETA, etapaNome: "SQS7E01 - 02", valor: 40_000 }),
        rateio({ centroId: ETAPA_B, raizId: CARRETA, etapaNome: "SQU9C94 - 03", valor: 40_000 }),
        rateio({ centroId: ESCRITORIO, raizId: ESCRITORIO, raizNome: "010 - Escritório", valor: 20_000 }),
      ],
    });
    const linhas = expandirPagamentos([dividida], "rateio", "a-pagar");
    expect(linhas).toHaveLength(3);
    expect(linhas.map((l) => l.parte)).toEqual([1, 2, 3]);
    expect(linhas.every((l) => l.partes === 3)).toBe(true);
    expect(linhas.map((l) => l.valorFatia)).toEqual([40_000, 40_000, 20_000]);
  });

  it("reparte por MAIOR RESTO: as fatias somam exatamente o pagamento", () => {
    // R$ 100.000,00 entre três dá 33.333,3333. Arredondando cada fatia sozinha
    // as três somam 99.999,99, e o centavo que falta vira "as partes não
    // fecham" -- a queixa que originou o `ratearEmCentavos`.
    const emTres = pagamento({
      valor: 100_000,
      valorLiquido: 100_000,
      rateios: [
        rateio({ centroId: "x", raizId: "x", valor: 1 }),
        rateio({ centroId: "y", raizId: "y", valor: 1 }),
        rateio({ centroId: "z", raizId: "z", valor: 1 }),
      ],
    });
    const fatias = expandirPagamentos([emTres], "rateio", "a-pagar").map(
      (l) => l.valorFatia,
    );
    expect(fatias).toEqual([33_333.34, 33_333.33, 33_333.33]);
    expect(somaEmCentavos(fatias)).toBe(10_000_000);
  });

  it("por CENTRO DE CUSTO junta as duas etapas do mesmo centro numa linha", () => {
    const dividida = pagamento({
      valor: 100_000,
      valorLiquido: 100_000,
      rateios: [
        rateio({ centroId: ETAPA_A, raizId: CARRETA, etapaNome: "SQS7E01 - 02", valor: 40_000 }),
        rateio({ centroId: ETAPA_B, raizId: CARRETA, etapaNome: "SQU9C94 - 03", valor: 40_000 }),
        rateio({ centroId: ESCRITORIO, raizId: ESCRITORIO, raizNome: "010 - Escritório", valor: 20_000 }),
      ],
    });

    const porCentro = expandirPagamentos([dividida], "centro", "a-pagar");
    expect(porCentro).toHaveLength(2);
    expect(porCentro.map((l) => l.centroNome)).toEqual([
      "001 - Carretas EMT",
      "010 - Escritório",
    ]);
    expect(porCentro.map((l) => l.valorFatia)).toEqual([80_000, 20_000]);
    // A linha É o centro: pôr o nome de UMA das duas etapas ali seria mentira.
    expect(porCentro.every((l) => l.etapaNome === null)).toBe(true);

    // E o formato por rateio NÃO junta: continuam três linhas.
    expect(expandirPagamentos([dividida], "rateio", "a-pagar")).toHaveLength(3);
  });

  it("junta as partes do MESMO destino, e junta por id, não por nome", () => {
    // Uma OC de N itens na mesma obra grava N rateios apontando o mesmo centro.
    // Sem juntar, a obra apareceria repetida com valores que só fazem sentido
    // para quem tem a OC na mão. Dois centros homônimos NÃO podem virar um.
    const daOc = pagamento({
      valor: 300,
      valorLiquido: 300,
      rateios: [
        rateio({ centroId: ETAPA_A, raizId: CARRETA, etapaNome: "SQS7E01 - 02", valor: 100 }),
        rateio({ centroId: ETAPA_A, raizId: CARRETA, etapaNome: "SQS7E01 - 02", valor: 100 }),
        rateio({ centroId: "outro-id", raizId: "outro-id", raizNome: "001 - Carretas EMT", valor: 100 }),
      ],
    });
    const linhas = expandirPagamentos([daOc], "rateio", "a-pagar");
    expect(linhas).toHaveLength(2);
    expect(linhas[0].valorFatia).toBe(200);
    // Mesmo NOME de raiz, ids diferentes: continuam duas linhas no formato por
    // centro também. Juntar pelo nome moveria dinheiro de obra sem erro nenhum.
    expect(expandirPagamentos([daOc], "centro", "a-pagar")).toHaveLength(2);
  });

  it("parcela SEM rateio vira uma linha, e não some do arquivo", () => {
    const semRateio = pagamento({ valor: 500, valorLiquido: 500, rateios: [] });
    const linhas = expandirPagamentos([semRateio], "rateio", "a-pagar");
    expect(linhas).toHaveLength(1);
    expect(linhas[0].centroNome).toBe(SEM_CENTRO_DE_CUSTO);
    expect(linhas[0].valorFatia).toBe(500);
  });

  it("não junta dois rateios que perderam o cadastro do centro", () => {
    const orfaos = pagamento({
      valor: 200,
      valorLiquido: 200,
      rateios: [
        rateio({ centroId: null, raizId: null, valor: 100 }),
        rateio({ centroId: null, raizId: null, valor: 100 }),
      ],
    });
    expect(expandirPagamentos([orfaos], "rateio", "a-pagar")).toHaveLength(2);
    expect(expandirPagamentos([orfaos], "centro", "a-pagar")).toHaveLength(2);
  });

  it("a soma das fatias é a soma dos pagamentos, nos três formatos", () => {
    const itens = [
      pagamento({
        id: "a",
        valor: 1_234.57,
        valorLiquido: 1_234.57,
        rateios: [
          rateio({ centroId: ETAPA_A, raizId: CARRETA, valor: 1 }),
          rateio({ centroId: ETAPA_B, raizId: CARRETA, valor: 1 }),
          rateio({ centroId: ESCRITORIO, raizId: ESCRITORIO, valor: 1 }),
        ],
      }),
      pagamento({ id: "b", valor: 0.01, valorLiquido: 0.01 }),
      pagamento({ id: "c", valor: 99_999.99, valorLiquido: 99_999.99 }),
    ];
    const esperado = somaEmCentavos(itens.map((p) => p.valor));

    for (const formato of ["pagamento", "centro", "rateio"] as const) {
      const fatias = expandirPagamentos(itens, formato, "a-pagar").map(
        (l) => l.valorFatia,
      );
      expect(somaEmCentavos(fatias), `formato ${formato}`).toBe(esperado);
    }
  });

  it("nas pagas reparte o LÍQUIDO, não o bruto", () => {
    const paga = pagamento({
      valor: 1_000,
      desconto: 100,
      juros: 0,
      outrasDespesas: 0,
      valorLiquido: 900,
      rateios: [
        rateio({ centroId: "x", raizId: "x", valor: 1 }),
        rateio({ centroId: "y", raizId: "y", valor: 1 }),
      ],
    });
    const fatias = expandirPagamentos([paga], "rateio", "pagas").map(
      (l) => l.valorFatia,
    );
    expect(fatias).toEqual([450, 450]);
  });
});

describe("colunas da planilha", () => {
  it("tem uma célula por cabeçalho, nas seis combinações", () => {
    const linha = expandirPagamentos([pagamento()], "rateio", "a-pagar")[0];
    for (const aba of ["a-pagar", "pagas"] as const) {
      for (const formato of ["pagamento", "centro", "rateio"] as const) {
        expect(
          linhaPlanilhaPagamento(linha, aba, formato),
          `${aba}/${formato}`,
        ).toHaveLength(cabecalhosPagamentos(aba, formato).length);
      }
    }
  });

  it("a coluna Etapa existe só no formato por rateio", () => {
    expect(cabecalhosPagamentos("a-pagar", "rateio")).toContain("Etapa");
    expect(cabecalhosPagamentos("a-pagar", "centro")).not.toContain("Etapa");
    expect(cabecalhosPagamentos("a-pagar", "pagamento")).not.toContain("Etapa");
  });

  it("Centro de custo traz a RAIZ, e a etapa vai na coluna ao lado", () => {
    const daEtapa = pagamento({
      rateios: [
        rateio({
          centroId: ETAPA_A,
          raizId: CARRETA,
          raizNome: "001 - Carretas EMT",
          etapaNome: "Caminhão Cavalo XF 530 FTT SQU9C94 - 03",
          valor: 11_848.99,
        }),
      ],
    });
    const linha = expandirPagamentos([daEtapa], "rateio", "a-pagar")[0];
    const celulas = linhaPlanilhaPagamento(linha, "a-pagar", "rateio");
    expect(celulas[coluna("a-pagar", "rateio", "Centro de custo")]).toBe(
      "001 - Carretas EMT",
    );
    expect(celulas[coluna("a-pagar", "rateio", "Etapa")]).toBe(
      "Caminhão Cavalo XF 530 FTT SQU9C94 - 03",
    );
  });

  it("a Etapa fica em branco no rateio que foi direto para a raiz", () => {
    const linha = expandirPagamentos([pagamento()], "rateio", "a-pagar")[0];
    const celulas = linhaPlanilhaPagamento(linha, "a-pagar", "rateio");
    expect(celulas[coluna("a-pagar", "rateio", "Etapa")]).toBeNull();
  });

  it("o valor do pagamento só aparece na PRIMEIRA linha dele", () => {
    // A armadilha clássica do formato por rateio: repetido em todas as linhas,
    // ele infla a soma e o arquivo abre sem erro nenhum.
    const dividida = pagamento({
      valor: 300,
      valorLiquido: 300,
      rateios: [
        rateio({ centroId: "x", raizId: "x", valor: 1 }),
        rateio({ centroId: "y", raizId: "y", valor: 1 }),
      ],
    });
    const linhas = expandirPagamentos([dividida], "rateio", "a-pagar");
    const indice = coluna("a-pagar", "rateio", "Valor do pagamento");
    expect(linhaPlanilhaPagamento(linhas[0], "a-pagar", "rateio")[indice]).toBe(300);
    expect(linhaPlanilhaPagamento(linhas[1], "a-pagar", "rateio")[indice]).toBeNull();
  });

  it("a aba Pagas traz a composição do que saiu da conta", () => {
    const paga = pagamento({
      valor: 1_000,
      desconto: 100,
      juros: 20,
      outrasDespesas: 5,
      valorLiquido: 925,
      dataPagamento: "2026-03-25",
      status: "pago",
    });
    const linha = expandirPagamentos([paga], "pagamento", "pagas")[0];
    const celulas = linhaPlanilhaPagamento(linha, "pagas", "pagamento");
    expect(celulas[coluna("pagas", "pagamento", "Valor da parcela")]).toBe(1_000);
    expect(celulas[coluna("pagas", "pagamento", "Desconto")]).toBe(100);
    expect(celulas[coluna("pagas", "pagamento", "Juros e multa")]).toBe(20);
    expect(celulas[coluna("pagas", "pagamento", "Outras despesas")]).toBe(5);
    expect(celulas[coluna("pagas", "pagamento", "Valor líquido")]).toBe(925);
    expect(
      celulas[coluna("pagas", "pagamento", "Data do pagamento")],
    ).toBeInstanceOf(Date);
  });

  it("a aba A pagar NÃO tem coluna de data de pagamento nem de líquido", () => {
    // Parcela em aberto tem `valor_liquido` preenchido no banco (é coluna
    // calculada). Trazer isso como "o que saiu da conta" afirmaria um pagamento
    // que não houve.
    const cabecalhos = cabecalhosPagamentos("a-pagar", "pagamento");
    expect(cabecalhos).not.toContain("Data do pagamento");
    expect(cabecalhos).not.toContain("Valor líquido");
    expect(cabecalhos).toContain("Data autorizada");
    expect(cabecalhos).toContain("Situação");
  });

  it("a parcela sai como 1/10, e como 1 quando o total é desconhecido", () => {
    const indice = coluna("a-pagar", "pagamento", "Parcela");
    const dez = expandirPagamentos([pagamento()], "pagamento", "a-pagar")[0];
    expect(linhaPlanilhaPagamento(dez, "a-pagar", "pagamento")[indice]).toBe("1/10");

    const solta = expandirPagamentos(
      [pagamento({ totalParcelas: null })],
      "pagamento",
      "a-pagar",
    )[0];
    expect(linhaPlanilhaPagamento(solta, "a-pagar", "pagamento")[indice]).toBe("1");
  });

  it("no formato por pagamento o rateio vai resumido", () => {
    const dividida = pagamento({
      rateios: [
        rateio({ centroId: "x", raizId: "x", raizNome: "001 - Carretas EMT", valor: 1 }),
        rateio({ centroId: "y", raizId: "y", raizNome: "010 - Escritório", valor: 1 }),
      ],
    });
    const linha = expandirPagamentos([dividida], "pagamento", "a-pagar")[0];
    const celulas = linhaPlanilhaPagamento(linha, "a-pagar", "pagamento");
    expect(celulas[coluna("a-pagar", "pagamento", "Centro de custo")]).toBe(
      "2 centros de custo",
    );
    expect(celulas[coluna("a-pagar", "pagamento", "Centros do rateio")]).toBe(
      "001 - Carretas EMT, 010 - Escritório",
    );
  });

  it("toda coluna de dinheiro é do tipo dinheiro, em todas as combinações", () => {
    // Coluna de valor saindo como texto não soma no Excel, e o arquivo abre sem
    // erro: quem confere só descobre ao selecionar e não ver total nenhum.
    for (const aba of ["a-pagar", "pagas"] as const) {
      for (const formato of ["pagamento", "centro", "rateio"] as const) {
        const dinheiro = colunasPagamentos(aba, formato).filter((c) =>
          /valor|desconto|juros|despesas/i.test(c.cabecalho),
        );
        expect(dinheiro.length, `${aba}/${formato}`).toBeGreaterThan(0);
        expect(
          dinheiro.every((c) => c.tipo === "dinheiro"),
          `${aba}/${formato}`,
        ).toBe(true);
      }
    }
  });
});

describe("montarPlanilhaPagamentos", () => {
  it("escreve as DUAS abas, mesmo com um dos lados vazio", async () => {
    const workbook = montarPlanilhaPagamentos({
      aPagar: [pagamento({ id: "a" })],
      pagas: [],
      formato: "rateio",
    });
    expect(workbook.worksheets.map((aba) => aba.name)).toEqual([
      "A pagar",
      "Pagas",
    ]);
    // Aba vazia continua existindo com cabeçalho: sumir com ela faria parecer
    // que a planilha saiu errada, em vez de "não há nada neste recorte".
    const pagas = workbook.getWorksheet("Pagas");
    expect(pagas?.rowCount).toBeGreaterThan(0);
  });

  it("as duas colunas de dinheiro do formato por rateio somam o mesmo total", async () => {
    const dividida = pagamento({
      valor: 300,
      valorLiquido: 300,
      rateios: [
        rateio({ centroId: "x", raizId: "x", valor: 1 }),
        rateio({ centroId: "y", raizId: "y", valor: 1 }),
        rateio({ centroId: "z", raizId: "z", valor: 1 }),
      ],
    });
    const linhas = expandirPagamentos([dividida], "rateio", "a-pagar");
    const fatias = somaEmCentavos(linhas.map((l) => l.valorFatia));
    expect(fatias).toBe(30_000);
    // O total do documento aparece uma vez só, então a outra coluna soma o
    // mesmo número por um caminho diferente. Divergência ali é rateio incompleto.
    const indice = coluna("a-pagar", "rateio", "Valor do pagamento");
    const totais = linhas
      .map((l) => linhaPlanilhaPagamento(l, "a-pagar", "rateio")[indice])
      .filter((celula): celula is number => typeof celula === "number");
    expect(somaEmCentavos(totais)).toBe(30_000);
  });

  it("o arquivo se distingue pelo formato na pasta de downloads", () => {
    expect(nomeArquivoPlanilhaPagamentos("2026-09-01", "pagamento")).toBe(
      "pagamentos-2026-09-01.xlsx",
    );
    expect(nomeArquivoPlanilhaPagamentos("2026-09-01", "centro")).toBe(
      "pagamentos-por-centro-de-custo-2026-09-01.xlsx",
    );
    expect(nomeArquivoPlanilhaPagamentos("2026-09-01", "rateio")).toBe(
      "pagamentos-por-rateio-2026-09-01.xlsx",
    );
  });
});
