// @vitest-environment node
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import type { SaidaRelatorio } from "@/modules/combustivel/relatorios/consolidar";
import {
  COLUNAS_BRUTO,
  COLUNAS_MENSAL,
  dataHoraParaCelula,
  escreverAba,
  montarRelatorio,
  nomeArquivoRelatorio,
  type Coluna,
} from "@/modules/combustivel/relatorios/planilhas";

const PERIODO = { de: "2026-09-01", ate: "2026-09-30" };

function saida(parcial: Partial<SaidaRelatorio> = {}): SaidaRelatorio {
  return {
    id: "s1",
    data: "2026-09-10T15:30:00.000Z",
    origem: "tanque",
    tipoConsumidor: "equipamento_proprio",
    tanqueNome: "Tanque 1",
    equipamentoId: "eq-1",
    equipamentoNome: "EQ-1 Escavadeira",
    transportadoraId: null,
    transportadoraNome: null,
    placa: null,
    motorista: null,
    insumoId: "diesel",
    combustivel: "Diesel S10",
    litros: 100,
    precoCombustivel: 6.3947,
    precoProprietario: null,
    taxaLitro: 0,
    precoUnitario: 6.3947,
    precoMedioTanque: 6.3947,
    valorTotal: 639.47,
    pago: false,
    pagoEm: "2026-09-12",
    medicao: 1200,
    tipoMedicao: "horimetro",
    centroCustoNome: "Manutenção",
    canal: "celular",
    observacoes: null,
    criadoEm: "2026-09-10T15:31:00.000Z",
    alocacoes: [{ centroRaizId: "o9", centroRaizNome: "Obra 009", percentual: 100, litros: 100 }],
    ...parcial,
  };
}

/** Acha a linha de cabeçalho e devolve um leitor de célula por nome de coluna. */
function leitor(ws: ExcelJS.Worksheet, cabecalhos: string[]) {
  let linhaCabecalho = 0;
  ws.eachRow((row, numero) => {
    if (linhaCabecalho === 0 && row.getCell(1).value === cabecalhos[0] && row.getCell(2).value === cabecalhos[1]) {
      linhaCabecalho = numero;
    }
  });
  expect(linhaCabecalho).toBeGreaterThan(0);
  const col = (nome: string) => {
    const i = cabecalhos.indexOf(nome);
    expect(i, `coluna ${nome}`).toBeGreaterThanOrEqual(0);
    return i + 1;
  };
  return {
    linhaCabecalho,
    valor: (linha: number, nome: string) => ws.getRow(linha).getCell(col(nome)).value,
    letra: (nome: string) => ws.getColumn(col(nome)).letter,
  };
}

describe("escreverAba", () => {
  interface L {
    nome: string;
    litros: number;
    valor: number;
  }
  const colunas: Coluna<L>[] = [
    { cabecalho: "Nome", largura: 10, tipo: "texto", celula: (l) => l.nome },
    { cabecalho: "Litros", largura: 10, tipo: "litros", celula: (l) => l.litros, somar: true },
    { cabecalho: "Valor", largura: 10, tipo: "dinheiro", celula: (l) => l.valor, somar: true },
    {
      cabecalho: "Média",
      largura: 10,
      tipo: "preco",
      celula: (l) => (l.litros === 0 ? 0 : l.valor / l.litros),
      razao: { numerador: "Valor", denominador: "Litros" },
    },
  ];

  it("números como número, total por SUBTOTAL e média por fórmula na linha e no total", () => {
    const wb = new ExcelJS.Workbook();
    const aba = escreverAba(wb, {
      nome: "Teste",
      titulo: "Teste",
      colunas,
      linhas: [
        { nome: "a", litros: 10, valor: 60 },
        { nome: "b", litros: 0, valor: 0 },
      ],
    });
    const ws = wb.getWorksheet("Teste")!;
    const cab = aba.linhaCabecalho;
    expect(ws.getRow(cab).values).toEqual([undefined, "Nome", "Litros", "Valor", "Média"]);
    expect(ws.getRow(cab + 1).getCell(2).value).toBe(10);
    expect(ws.getRow(cab + 1).getCell(4).value).toEqual({ formula: `IF(B${cab + 1}=0,0,C${cab + 1}/B${cab + 1})`, result: 6 });
    // Denominador zero: a fórmula devolve 0 em vez de #DIV/0!.
    expect(ws.getRow(cab + 2).getCell(4).value).toMatchObject({ formula: `IF(B${cab + 2}=0,0,C${cab + 2}/B${cab + 2})` });

    expect(aba.linhaTotal).toBe(cab + 3);
    const total = ws.getRow(aba.linhaTotal);
    expect(total.getCell(1).value).toBe("Total (2 linhas)");
    expect(total.getCell(2).value).toEqual({ formula: `SUBTOTAL(109,B${cab + 1}:B${cab + 2})` });
    expect(total.getCell(3).value).toEqual({ formula: `SUBTOTAL(109,C${cab + 1}:C${cab + 2})` });
    expect(total.getCell(4).value).toEqual({ formula: `IF(B${aba.linhaTotal}=0,0,C${aba.linhaTotal}/B${aba.linhaTotal})` });
    expect(ws.getColumn(3).numFmt).toBe("R$ #,##0.00");
    expect(ws.getColumn(4).numFmt).toBe("R$ #,##0.0000");
    expect(ws.autoFilter).toEqual({ from: { row: cab, column: 1 }, to: { row: cab + 2, column: 4 } });
  });

  it("aba vazia: sem filtro e sem fórmula de total apontando intervalo invertido", () => {
    const wb = new ExcelJS.Workbook();
    const aba = escreverAba(wb, { nome: "Vazia", titulo: "Vazia", colunas, linhas: [] });
    const ws = wb.getWorksheet("Vazia")!;
    expect(ws.autoFilter).toBeFalsy();
    expect(ws.getRow(aba.linhaTotal).getCell(1).value).toBe("Total (0 linhas)");
    expect(ws.getRow(aba.linhaTotal).getCell(2).value).toBeNull();
  });

  it("razão que aponta coluna inexistente quebra em vez de sair errada", () => {
    const wb = new ExcelJS.Workbook();
    const quebrada: Coluna<L>[] = [
      ...colunas.slice(0, 3),
      { ...colunas[3], razao: { numerador: "Valor", denominador: "Não existe" } },
    ];
    expect(() => escreverAba(wb, { nome: "X", titulo: "X", colunas: quebrada, linhas: [{ nome: "a", litros: 1, valor: 1 }] })).toThrow(
      /Não existe/,
    );
  });
});

describe("dataHoraParaCelula", () => {
  it("a célula guarda o relógio de Rio Branco em campos UTC", () => {
    const celula = dataHoraParaCelula("2026-09-10T15:30:00.000Z")!;
    expect(celula.toISOString()).toBe("2026-09-10T10:30:00.000Z");
    expect(dataHoraParaCelula(null)).toBeNull();
    expect(dataHoraParaCelula("lixo")).toBeNull();
  });
});

describe("montarRelatorio", () => {
  it("mensal: uma linha por grupo e total por fórmula, e o arquivo abre de volta", async () => {
    const wb = montarRelatorio(
      "mensal",
      [saida({ id: "a", litros: 10, valorTotal: 63.947 }), saida({ id: "b", litros: 20, valorTotal: 127.894 })],
      PERIODO,
    );
    const buffer = await wb.xlsx.writeBuffer();
    const relido = new ExcelJS.Workbook();
    await relido.xlsx.load(buffer as ArrayBuffer);
    const ws = relido.getWorksheet("Mensal")!;
    const r = leitor(
      ws,
      COLUNAS_MENSAL.map((c) => c.cabecalho),
    );
    const primeira = r.linhaCabecalho + 1;
    expect(r.valor(primeira, "Mês")).toBe("09/2026");
    expect(r.valor(primeira, "Litros")).toBe(30);
    expect(r.valor(primeira, "Valor")).toBe(191.841);
    const l = r.letra("Litros");
    expect(r.valor(primeira + 1, "Litros")).toEqual({ formula: `SUBTOTAL(109,${l}${primeira}:${l}${primeira})` });
  });

  it("equipamento gera as abas Equipamentos e Carretas; obra usa o custo da alocação", () => {
    const eq = montarRelatorio("equipamento", [saida()], PERIODO);
    expect(eq.worksheets.map((w) => w.name)).toEqual(["Equipamentos", "Carretas"]);
    const obra = montarRelatorio("obra", [saida({ valorTotal: 100 })], PERIODO);
    const ws = obra.getWorksheet("Por obra")!;
    const r = leitor(ws, ["Centro de custo", "Abastecimentos", "Litros", "Custo"]);
    expect(r.valor(r.linhaCabecalho + 1, "Centro de custo")).toBe("Obra 009");
    expect(r.valor(r.linhaCabecalho + 1, "Custo")).toBe(100);
  });

  it("bruto: todas as colunas, data e hora em Rio Branco, datas como data do Excel", () => {
    const wb = montarRelatorio("bruto", [saida()], PERIODO);
    const ws = wb.getWorksheet("Abastecimentos")!;
    const r = leitor(
      ws,
      COLUNAS_BRUTO.map((c) => c.cabecalho),
    );
    const linha = r.linhaCabecalho + 1;
    expect((r.valor(linha, "Data") as Date).toISOString()).toBe("2026-09-10T10:30:00.000Z");
    expect((r.valor(linha, "Pago em") as Date).toISOString()).toBe("2026-09-12T00:00:00.000Z");
    expect(r.valor(linha, "Litros")).toBe(100);
    expect(r.valor(linha, "Valor total")).toBe(639.47);
    expect(r.valor(linha, "Preço do dono do tanque")).toBeNull();
    expect(r.valor(linha, "Canal")).toBe("Celular");
    expect(r.valor(linha, "Origem")).toBe("Tanque");
    expect(r.valor(linha, "Consumidor")).toBe("Equipamento");
    expect(r.valor(linha, "Medidor")).toBe("Horímetro");
    expect(r.valor(linha, "Alocação por obra")).toBe("Obra 009 (100%)");
    expect(r.valor(linha, "Id")).toBe("s1");
    const letra = r.letra("Valor total");
    expect(r.valor(linha + 1, "Valor total")).toEqual({ formula: `SUBTOTAL(109,${letra}${linha}:${letra}${linha})` });
  });

  it("nome do arquivo leva o relatório e o período", () => {
    expect(nomeArquivoRelatorio("obra", PERIODO)).toBe("combustivel-por-obra-2026-09-01-a-2026-09-30.xlsx");
  });
});
