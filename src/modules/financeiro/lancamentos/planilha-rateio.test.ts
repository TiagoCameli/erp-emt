import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { LINHAS_CABECALHO_MARCA } from "@/lib/planilha-marca";
import { SEM_CENTRO_DE_CUSTO } from "@/modules/financeiro/_shared/formato";
import type {
  LancamentoPlanilha,
  RateioPlanilha,
} from "@/modules/financeiro/lancamentos/queries";
import {
  CABECALHOS_PLANILHA_LANCAMENTOS,
  CABECALHOS_PLANILHA_RATEIOS,
  expandirPorRateio,
  linhaPlanilhaRateio,
  montarPlanilhaLancamentosPorRateio,
  nomeArquivoPlanilhaRateios,
} from "@/modules/financeiro/lancamentos/planilha";

/**
 * A PLANILHA POR RATEIO: uma linha por centro de custo, e a soma que continua
 * certa.
 *
 * O formato tem um defeito clássico, e é dele que estes testes tratam: repetir o
 * lançamento em N linhas e deixar o valor do documento em todas. Quem soma a
 * coluna conta o mesmo dinheiro N vezes, e o arquivo abre sem erro nenhum. Aqui
 * a coluna que soma é a FATIA, e o valor do documento aparece uma vez por
 * lançamento — as duas somas dão números certos, cada uma na sua unidade.
 */

function rateio(campos: Partial<RateioPlanilha> = {}): RateioPlanilha {
  return {
    centroId: "cc-1",
    nome: "009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10",
    codigo: null,
    valor: 100,
    ...campos,
  };
}

function lancamento(campos: Partial<LancamentoPlanilha> = {}): LancamentoPlanilha {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    numero: "LAN-2026-0015",
    numeroDocumento: "NF 98765",
    anexos: 0,
    tipo: "a_pagar",
    origem: "oc",
    descricao: "Combustível julho",
    categoriaNome: "Combustível",
    centroCustoRotulo: "BR-364 Lote 9",
    fornecedorNome: "Posto Rio Branco",
    colaboradorNome: null,
    valor: 300,
    dataVencimento: "2026-08-10",
    status: "aprovado",
    qtdParcelas: 1,
    dataCompra: "2026-07-10",
    mesCompetencia: "2026-07-01",
    criadoEm: "2026-07-11T14:30:00.000Z",
    revisao: "revisado",
    valorPago: 0,
    valorAberto: 300,
    valorVencido: 0,
    descontoObtido: 0,
    valorRecorte: null,
    observacoes: null,
    formaPagamentoNome: null,
    condicaoPagamentoDescricao: null,
    contaBancariaNome: null,
    origemNumero: null,
    rateios: [],
    ...campos,
  };
}

/** Índice de uma coluna pelo cabeçalho, para o teste não contar posição na mão. */
function coluna(cabecalho: string): number {
  const indice = CABECALHOS_PLANILHA_RATEIOS.indexOf(cabecalho);
  expect(indice, `coluna "${cabecalho}" não existe`).toBeGreaterThanOrEqual(0);
  return indice;
}

const LINHA_HEADER = LINHAS_CABECALHO_MARCA + 1;

describe("expandirPorRateio", () => {
  it("abre um lançamento rateado entre três obras em três linhas", () => {
    // O caso real do LAN-2026-6609: 154.700,00 de diesel repartidos entre a
    // BR-364, o Ramal do Gama e a AC 405.
    const linhas = expandirPorRateio([
      lancamento({
        valor: 154700,
        rateios: [
          rateio({ centroId: "br364", nome: "009 - BR-364", valor: 92820 }),
          rateio({ centroId: "gama", nome: "003 - Ramal do Gama", valor: 30940 }),
          rateio({ centroId: "ac405", nome: "007 - AC 405", valor: 30940 }),
        ],
      }),
    ]);

    expect(linhas.map((linha) => linha.centroNome)).toEqual([
      "009 - BR-364",
      "003 - Ramal do Gama",
      "007 - AC 405",
    ]);
    expect(linhas.map((linha) => linha.valorRateio)).toEqual([
      92820, 30940, 30940,
    ]);
    expect(linhas.map((linha) => linha.parte)).toEqual([1, 2, 3]);
    expect(linhas.every((linha) => linha.partes === 3)).toBe(true);
  });

  it("junta as partes que caem no MESMO centro", () => {
    // O LAN-2026-6617: cinco itens da OC, todos na mesma obra, gravados como
    // cinco rateios. Sem juntar, a planilha traria a obra repetida cinco vezes.
    const linhas = expandirPorRateio([
      lancamento({
        valor: 583.33,
        rateios: [
          rateio({ valor: 191.4 }),
          rateio({ valor: 180.96 }),
          rateio({ valor: 172.26 }),
          rateio({ valor: 30.45 }),
          rateio({ valor: 8.26 }),
        ],
      }),
    ]);

    expect(linhas).toHaveLength(1);
    // Em centavos exatos: somar as cinco em float sobra resto, e a célula
    // guardaria um número que a tela mostra arredondado.
    expect(linhas[0].valorRateio).toBe(583.33);
    expect(linhas[0].partes).toBe(1);
  });

  it("lançamento SEM rateio vira uma linha, e não some do arquivo", () => {
    const linhas = expandirPorRateio([lancamento({ valor: 42, rateios: [] })]);

    expect(linhas).toHaveLength(1);
    expect(linhas[0].centroNome).toBe(SEM_CENTRO_DE_CUSTO);
    // O valor inteiro: é o que mantém a soma do arquivo igual à do sistema.
    expect(linhas[0].valorRateio).toBe(42);
  });

  it("não junta dois rateios que perderam o cadastro do centro", () => {
    // Sem id, juntar pelo nome colocaria dois centros diferentes na mesma linha.
    const linhas = expandirPorRateio([
      lancamento({
        valor: 300,
        rateios: [
          rateio({ centroId: null, nome: SEM_CENTRO_DE_CUSTO, valor: 100 }),
          rateio({ centroId: null, nome: SEM_CENTRO_DE_CUSTO, valor: 200 }),
        ],
      }),
    ]);

    expect(linhas).toHaveLength(2);
    expect(linhas.map((linha) => linha.valorRateio)).toEqual([100, 200]);
  });

  it("a soma das fatias é a soma dos lançamentos", () => {
    // A LINHA DE CONTROLE do formato, e a razão de ele poder existir: se estas
    // duas somas divergirem, a planilha está contando dinheiro a mais ou a menos.
    const itens = [
      lancamento({
        id: "a",
        valor: 154700,
        rateios: [
          rateio({ centroId: "br364", valor: 92820 }),
          rateio({ centroId: "gama", valor: 30940 }),
          rateio({ centroId: "ac405", valor: 30940 }),
        ],
      }),
      lancamento({
        id: "b",
        valor: 583.33,
        rateios: [rateio({ valor: 583.33 })],
      }),
      lancamento({ id: "c", valor: 42, rateios: [] }),
    ];

    const somaDasFatias = expandirPorRateio(itens).reduce(
      (total, linha) => total + linha.valorRateio,
      0,
    );
    const somaDosLancamentos = itens.reduce(
      (total, item) => total + item.valor,
      0,
    );

    expect(somaDasFatias).toBeCloseTo(somaDosLancamentos, 2);
  });
});

describe("colunas da planilha por rateio", () => {
  it("herda as colunas da planilha por lançamento, trocando três", () => {
    // Herdar em vez de listar de novo é o que mantém as duas planilhas juntas.
    expect(CABECALHOS_PLANILHA_RATEIOS).toContain("Descrição");
    expect(CABECALHOS_PLANILHA_RATEIOS).toContain("Observações");

    // "Valor" vira duas colunas, "Rateio" vira "Parte".
    expect(CABECALHOS_PLANILHA_RATEIOS).not.toContain("Valor");
    expect(CABECALHOS_PLANILHA_RATEIOS).not.toContain("Rateio");
    expect(CABECALHOS_PLANILHA_RATEIOS).toContain("Valor do rateio");
    expect(CABECALHOS_PLANILHA_RATEIOS).toContain("Valor do lançamento");
    expect(CABECALHOS_PLANILHA_RATEIOS).toContain("Parte");

    // Uma coluna a mais que a outra planilha: "Valor" virou duas.
    expect(CABECALHOS_PLANILHA_RATEIOS).toHaveLength(
      CABECALHOS_PLANILHA_LANCAMENTOS.length + 1,
    );
  });

  it("tem uma célula por cabeçalho", () => {
    // A invariante que impede o pior defeito da planilha: número embaixo do
    // título errado, com o arquivo abrindo sem erro nenhum.
    const [linha] = expandirPorRateio([
      lancamento({ rateios: [rateio({ valor: 300 })] }),
    ]);

    expect(linhaPlanilhaRateio(linha)).toHaveLength(
      CABECALHOS_PLANILHA_RATEIOS.length,
    );
  });

  it("o valor do lançamento só aparece na PRIMEIRA linha dele", () => {
    const linhas = expandirPorRateio([
      lancamento({
        valor: 300,
        rateios: [
          rateio({ centroId: "a", valor: 100 }),
          rateio({ centroId: "b", valor: 200 }),
        ],
      }),
    ]);

    const celulas = linhas.map(linhaPlanilhaRateio);
    const total = coluna("Valor do lançamento");
    const fatia = coluna("Valor do rateio");

    expect(celulas[0][total]).toBe(300);
    // Em branco na segunda: repetido, somar a coluna daria 600.
    expect(celulas[1][total]).toBeNull();
    expect(celulas.map((celula) => celula[fatia])).toEqual([100, 200]);
  });

  it("a coluna Parte fica em branco quando o lançamento tem um centro só", () => {
    const [uma] = expandirPorRateio([
      lancamento({ rateios: [rateio({ valor: 300 })] }),
    ]);
    const duas = expandirPorRateio([
      lancamento({
        rateios: [
          rateio({ centroId: "a", valor: 100 }),
          rateio({ centroId: "b", valor: 200 }),
        ],
      }),
    ]);

    expect(linhaPlanilhaRateio(uma)[coluna("Parte")]).toBeNull();
    expect(linhaPlanilhaRateio(duas[1])[coluna("Parte")]).toBe("2 de 2");
  });

  it("o centro de custo da linha é um só, no nível em que foi gravado", () => {
    // Rateio em etapa traz o nome da ETAPA, não o da obra-raiz: é o grão que o
    // rateio conhece, e é o que a tela do lançamento mostra.
    const [linha] = expandirPorRateio([
      lancamento({
        rateios: [
          rateio({ centroId: "pc200", nome: "Escavadeira PC200 - 05", valor: 555.05 }),
        ],
      }),
    ]);

    expect(linhaPlanilhaRateio(linha)[coluna("Centro de custo")]).toBe(
      "Escavadeira PC200 - 05",
    );
  });
});

describe("nomeArquivoPlanilhaRateios", () => {
  it("se distingue do arquivo por lançamento na pasta de downloads", () => {
    expect(nomeArquivoPlanilhaRateios("2026-08-28")).toBe(
      "lancamentos-por-rateio-2026-08-28.xlsx",
    );
  });
});

describe("montarPlanilhaLancamentosPorRateio", () => {
  const itens = [
    lancamento({
      id: "a",
      numero: "LAN-2026-6609",
      valor: 154700,
      rateios: [
        rateio({ centroId: "br364", nome: "009 - BR-364", valor: 92820 }),
        rateio({ centroId: "gama", nome: "003 - Ramal do Gama", valor: 30940 }),
        rateio({ centroId: "ac405", nome: "007 - AC 405", valor: 30940 }),
      ],
    }),
    lancamento({
      id: "b",
      numero: "LAN-2026-6617",
      valor: 583.33,
      rateios: [rateio({ valor: 400 }), rateio({ valor: 183.33 })],
    }),
  ];

  /** Relê o arquivo gerado, que é a única prova de que ele saiu certo. */
  async function relerPlanilha() {
    const workbook = montarPlanilhaLancamentosPorRateio(itens);
    const buffer = await workbook.xlsx.writeBuffer();
    const lido = new ExcelJS.Workbook();
    await lido.xlsx.load(buffer as ArrayBuffer);
    return lido.worksheets[0];
  }

  it("escreve uma linha por rateio, com o cabeçalho na linha da marca", async () => {
    const worksheet = await relerPlanilha();

    const cabecalhos = worksheet.getRow(LINHA_HEADER).values as unknown[];
    expect(cabecalhos.slice(1)).toEqual(CABECALHOS_PLANILHA_RATEIOS);

    // 3 rateios do primeiro + 1 do segundo (as duas partes caem no mesmo centro).
    const primeira = LINHA_HEADER + 1;
    const numeros = [0, 1, 2, 3].map(
      (i) => worksheet.getRow(primeira + i).getCell(coluna("Número") + 1).value,
    );
    expect(numeros).toEqual([
      "LAN-2026-6609",
      "LAN-2026-6609",
      "LAN-2026-6609",
      "LAN-2026-6617",
    ]);
  });

  it("as duas colunas de dinheiro somam o mesmo total", async () => {
    const worksheet = await relerPlanilha();
    const primeira = LINHA_HEADER + 1;

    let somaFatias = 0;
    let somaLancamentos = 0;
    for (let i = 0; i < 4; i += 1) {
      const linha = worksheet.getRow(primeira + i);
      somaFatias += Number(
        linha.getCell(coluna("Valor do rateio") + 1).value ?? 0,
      );
      somaLancamentos += Number(
        linha.getCell(coluna("Valor do lançamento") + 1).value ?? 0,
      );
    }

    expect(somaFatias).toBeCloseTo(155283.33, 2);
    // A conferência do arquivo: fatias e documentos dão o mesmo número.
    expect(somaLancamentos).toBeCloseTo(somaFatias, 2);
  });

  it("põe SUBTOTAL nas duas colunas de dinheiro, e só nelas", async () => {
    const worksheet = await relerPlanilha();
    const linhaTotais = worksheet.getRow(LINHA_HEADER + 5);

    const comFormula: string[] = [];
    linhaTotais.eachCell((cell, numeroColuna) => {
      if (typeof cell.value === "object" && cell.value && "formula" in cell.value) {
        comFormula.push(CABECALHOS_PLANILHA_RATEIOS[numeroColuna - 1]);
        expect(String(cell.value.formula)).toContain("SUBTOTAL(109");
      }
    });

    expect(comFormula).toEqual(["Valor do rateio", "Valor do lançamento"]);
    expect(linhaTotais.getCell(1).value).toBe("Total (4 rateios de 2 lançamentos)");
  });
});
