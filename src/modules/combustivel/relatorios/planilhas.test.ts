// @vitest-environment node
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { EQUIPAMENTO_DESCONHECIDO, type SaidaBase, type TanqueBase } from "@/modules/combustivel/anomalias/base";
import type { Anomalia } from "@/modules/combustivel/anomalias/detect";
import {
  consolidarMensal,
  consolidarPorEquipamento,
  consolidarPorObra,
  type CadastrosRelatorio,
} from "@/modules/combustivel/relatorios/consolidar";
import {
  formatarMesRef,
  montarBruto,
  montarMensal,
  montarPorEquipamento,
  montarPorObra,
  nomeArquivoBruto,
  nomeArquivoMensal,
  nomeArquivoPorEquipamento,
  nomeArquivoPorObra,
  rotuloDoIntervalo,
} from "@/modules/combustivel/relatorios/planilhas";

let n = 0;
function saida(parcial: Partial<SaidaBase> = {}): SaidaBase {
  n += 1;
  return {
    id: `s${n}`,
    data: "2026-09-10T08:00:00",
    instante: "2026-09-10T13:00:00Z",
    tipoConsumidor: "equipamento_proprio",
    equipamentoId: "eq-1",
    equipamentoIdReal: "eq-1",
    placa: null,
    obraId: "obra-1",
    tipoCombustivel: "diesel",
    litros: 100,
    valorTotal: 639.47,
    origem: "requisicao",
    tanqueId: "t1",
    transportadoraId: null,
    motorista: "João",
    precoUnitario: 6.3947,
    pago: true,
    pagoEm: "2026-09-12",
    observacoes: null,
    createdBy: "u1",
    ...parcial,
  };
}

const CADASTROS: CadastrosRelatorio = {
  equipamentos: new Map([["eq-1", { descricao: "Escavadeira 320", codigo: "EQ-01", tipo: "Escavadeira" }]]),
  transportadoraNome: new Map([["tr-1", "Transterra"]]),
  obraNome: new Map([["obra-1", "Obra 009"]]),
};
const COMBUSTIVEL = new Map([["diesel", "Diesel S10"]]);

const ANOMALIAS: Anomalia[] = [
  {
    id: "D5-eq-1",
    severity: "info",
    detector: "D5",
    title: "Escavadeira sem saída há 70 dia(s)",
    description: "Última saída em 01/07/2026",
    affectedSaidaIds: [],
    data: "2026-07-01",
  },
  {
    id: "D4-a-b",
    severity: "critical",
    detector: "D4",
    title: "2 saídas idênticas em janela de 5 minutos",
    description: "provável duplicata",
    affectedSaidaIds: ["a", "b"],
    data: "2026-09-02",
    acaoSugerida: "Verificar e excluir registros duplicados",
  },
];

async function reabrir(wb: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  const buffer = await wb.xlsx.writeBuffer();
  const lido = new ExcelJS.Workbook();
  await lido.xlsx.load(buffer);
  return lido;
}

/** Linha (1-based) cujo primeiro texto é `texto`. */
function linhaCom(ws: ExcelJS.Worksheet, texto: string): number {
  let achada = -1;
  ws.eachRow((row, numero) => {
    if (achada < 0 && row.getCell(1).value === texto) achada = numero;
  });
  return achada;
}

describe("Mensal consolidado", () => {
  it("as abas da origem, na ordem, com o total por fórmula e a aba Anomalias ordenada", async () => {
    const saidas = [saida(), saida({ litros: 50.25, valorTotal: 321.34 }), saida({ equipamentoId: EQUIPAMENTO_DESCONHECIDO })];
    const wb = await reabrir(
      montarMensal("2026-09", consolidarMensal(saidas, [], CADASTROS), {
        cadastros: CADASTROS,
        combustivelNome: COMBUSTIVEL,
        anomalias: ANOMALIAS,
      }),
    );
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumo", "Equipamentos", "Carretas", "Obras", "Fornecedores", "Anomalias"]);

    const equipamentos = wb.getWorksheet("Equipamentos")!;
    const cabecalho = linhaCom(equipamentos, "#");
    expect((equipamentos.getRow(cabecalho).values as unknown[]).slice(1)).toEqual([
      "#",
      "Equipamento",
      "Código",
      "Saídas",
      "Litros",
      "Custo",
      "R$/L",
    ]);
    const linha = equipamentos.getRow(cabecalho + 1);
    expect(linha.getCell(2).value).toBe("Escavadeira 320");
    expect(linha.getCell(4).value).toBe(2);
    expect(linha.getCell(5).value).toBe(150.25);
    expect(linha.getCell(6).value).toBe(960.81);
    const total = equipamentos.getRow(cabecalho + 2);
    expect(total.getCell(1).value).toBe("TOTAL (1 registros)");
    expect(total.getCell(6).value).toMatchObject({ formula: `SUBTOTAL(109,F${cabecalho + 1}:F${cabecalho + 1})`, result: 960.81 });

    const resumo = wb.getWorksheet("Resumo")!;
    const aviso = linhaCom(resumo, "Atenção: 1 saída(s) sem equipamento identificado");
    expect(aviso).toBeGreaterThan(0);
    const volume = linhaCom(resumo, "Volume Total");
    expect(resumo.getRow(volume).getCell(2).value).toBe(250.25);

    const anomalias = wb.getWorksheet("Anomalias")!;
    const cabAnomalias = linhaCom(anomalias, "Severidade");
    expect(anomalias.getRow(cabAnomalias + 1).getCell(1).value).toBe("CRÍTICA");
    expect(anomalias.getRow(cabAnomalias + 1).getCell(6).value).toBe("Verificar e excluir registros duplicados");
    expect(anomalias.getRow(cabAnomalias + 2).getCell(1).value).toBe("INFO");
  });

  it("sem anomalia, a aba sai com a mensagem positiva", async () => {
    const wb = await reabrir(
      montarMensal("2026-09", consolidarMensal([saida()], [], CADASTROS), {
        cadastros: CADASTROS,
        combustivelNome: COMBUSTIVEL,
        anomalias: [],
      }),
    );
    expect(linhaCom(wb.getWorksheet("Anomalias")!, "Nenhuma anomalia detectada no período.")).toBeGreaterThan(0);
  });
});

describe("Por obra e Por equipamento", () => {
  it("Por obra: Resumo · Saídas · Equipamentos · Fornecedores · Anomalias, saídas com a coluna R$/L", async () => {
    const wb = await reabrir(
      montarPorObra("Obra 009", "2026-09", consolidarPorObra([saida()], [], CADASTROS), {
        cadastros: CADASTROS,
        combustivelNome: COMBUSTIVEL,
        anomalias: [],
      }),
    );
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumo", "Saídas", "Equipamentos", "Fornecedores", "Anomalias"]);
    const ws = wb.getWorksheet("Saídas")!;
    const cab = linhaCom(ws, "Data");
    expect((ws.getRow(cab).values as unknown[]).slice(1)).toEqual(["Data", "Consumidor", "Tipo", "Combustível", "Litros", "R$/L", "Custo"]);
    expect(ws.getRow(cab + 1).getCell(2).value).toBe("EQ-01 · Escavadeira 320");
    expect(ws.getRow(cab + 1).getCell(6).value).toBeCloseTo(6.3947, 10);
  });

  it("Por equipamento: Resumo · Saídas · Obras · Fornecedores · Anomalias", async () => {
    const wb = await reabrir(
      montarPorEquipamento(
        { rotulo: "EQ-01 · Escavadeira 320", tipo: "Escavadeira", marca: "CAT" },
        { de: "2026-06-26", ate: "2026-09-23" },
        consolidarPorEquipamento([saida()], [], CADASTROS),
        { cadastros: CADASTROS, combustivelNome: COMBUSTIVEL, anomalias: [] },
      ),
    );
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumo", "Saídas", "Obras", "Fornecedores", "Anomalias"]);
    const resumo = wb.getWorksheet("Resumo")!;
    expect(resumo.getRow(linhaCom(resumo, "Tipo / marca")).getCell(2).value).toBe("Escavadeira · CAT");
  });
});

describe("Raw export", () => {
  it("cinco abas, sem Anomalias; 'Pago' só na requisição e 'Criado por' pelo nome", async () => {
    const tanque: TanqueBase = {
      id: "t1",
      nome: "Tanque 1",
      apelido: "Base",
      nomeExibicao: "Base",
      capacidadeLitros: 15000,
      ehExterno: false,
      proprietarioId: null,
      ativo: true,
    };
    const wb = await reabrir(
      montarBruto(
        "2026-09",
        {
          saidas: [saida(), saida({ origem: "tanque" })],
          entradas: [],
          transferencias: [],
          tanques: [tanque],
          usuarioNome: new Map([["u1", "Maria"]]),
          equipamentosAtivos: [{ descricao: "Escavadeira 320", codigo: "EQ-01", tipo: "Escavadeira", marca: "CAT", modelo: "320" }],
          transportadoras: ["Transterra"],
          combustiveis: [{ nome: "Diesel S10", unidade: "L" }],
        },
        { cadastros: CADASTROS, combustivelNome: COMBUSTIVEL },
      ),
    );
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumo", "Saídas", "Entradas", "Transferências", "Cadastros"]);
    const ws = wb.getWorksheet("Saídas")!;
    const cab = linhaCom(ws, "Data");
    const cabecalhos = (ws.getRow(cab).values as unknown[]).slice(1);
    expect(cabecalhos).toEqual([
      "Data",
      "Tipo Consumidor",
      "Consumidor",
      "Origem",
      "Tanque",
      "Obra",
      "Combustível",
      "Litros",
      "Preço/L",
      "R$/L Total",
      "Valor Total",
      "Motorista",
      "Pago",
      "Pago em",
      "Observações",
      "Criado por",
    ]);
    const pago = cabecalhos.indexOf("Pago") + 1;
    const valores = [ws.getRow(cab + 1).getCell(pago).value, ws.getRow(cab + 2).getCell(pago).value].sort();
    expect(valores).toEqual(["-", "Sim"]);
    expect(ws.getRow(cab + 1).getCell(cabecalhos.indexOf("Criado por") + 1).value).toBe("Maria");
    expect(ws.getRow(cab + 1).getCell(cabecalhos.indexOf("Tanque") + 1).value).toBe("Base");
  });
});

describe("nomes de arquivo da origem", () => {
  it("mês curto, obra saneada e o rótulo do intervalo", () => {
    expect(formatarMesRef("2026-04")).toBe("Abr/2026");
    expect(nomeArquivoMensal("2026-04")).toBe("EMT - Mensal Consolidado - Abr-2026.xlsx");
    expect(nomeArquivoPorObra("BR-364 / Lote 9", "2026-08")).toBe("EMT - Por Obra - BR-364 - Lote 9 - Ago-2026.xlsx");
    expect(nomeArquivoBruto("2026-01")).toBe("EMT - Raw Export - Jan-2026.xlsx");
    expect(rotuloDoIntervalo("2026-02-01", "2026-05-31")).toBe("Fev-Mai-2026");
    expect(rotuloDoIntervalo("2025-10-01", "2026-01-31")).toBe("Out-2025-Jan-2026");
    expect(rotuloDoIntervalo("2026-05-01", "2026-05-31")).toBe("Mai-2026");
    expect(nomeArquivoPorEquipamento("EQ-01", "2026-06-26", "2026-09-23")).toBe("EMT - Por Equipamento - EQ-01 - Jun-Set-2026.xlsx");
  });
});
