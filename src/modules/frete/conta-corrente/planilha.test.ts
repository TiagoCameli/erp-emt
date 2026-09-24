// @vitest-environment node
import { describe, expect, it } from "vitest";
import type ExcelJS from "exceljs";

import { LINHAS_CABECALHO_MARCA } from "@/lib/planilha-marca";
import type { MovimentoExtrato, TipoMovimento } from "@/modules/frete/conta-corrente/extrato";
import { montarExtratoWorkbook } from "@/modules/frete/conta-corrente/planilha";

let seq = 0;
function mov(tipo: TipoMovimento, valor: number, data: string, troca: Partial<MovimentoExtrato> = {}): MovimentoExtrato {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    data,
    createdAt: data,
    tipo,
    valor,
    descricao: `mov ${seq}`,
    mesReferencia: `${data.slice(0, 7)}-01`,
    origemTabela: null,
    origemId: null,
    obraNome: null,
    fretePeso: null,
    freteKm: null,
    freteTkm: null,
    freteOrigem: null,
    freteDestino: null,
    freteInsumoNome: null,
    freteNotaFiscal: null,
    freteNotaFiscal2: null,
    fretePlaca: null,
    freteMotorista: null,
    saidaLitros: null,
    saidaPrecoCombustivel: null,
    saidaPrecoProprietario: null,
    saidaTaxaLitro: null,
    saidaPrecoMedioTanque: null,
    saidaCombustivelNome: null,
    saidaPlaca: null,
    saidaMotorista: null,
    saidaObservacoes: null,
    pagamentoMetodo: null,
    pagamentoNotaFiscal: null,
    pagamentoResponsavel: null,
    pagamentoPagoPor: null,
    pagamentoObservacoes: null,
    pagamentoLitros: null,
    ajusteCriadoPor: null,
    ...troca,
  };
}

const PRIMEIRA = LINHAS_CABECALHO_MARCA + 2;

function formula(cell: ExcelJS.Cell): string | undefined {
  const v = cell.value as { formula?: string } | null;
  return v && typeof v === "object" && "formula" in v ? v.formula : undefined;
}
function resultado(cell: ExcelJS.Cell): unknown {
  const v = cell.value as { result?: unknown } | null;
  return v && typeof v === "object" && "result" in v ? v.result : v;
}

const MOVIMENTOS = [
  mov("credito_frete", 1443, "2026-06-01T17:00:00Z", { fretePeso: 32.5, freteKm: 120, freteTkm: 0.37 }),
  mov("debito_abastecimento_emt", 690, "2026-06-02T17:00:00Z", { saidaLitros: 100, saidaPrecoCombustivel: 6.8, saidaTaxaLitro: 0.1 }),
  mov("debito_pagamento_frete", 500, "2026-06-03T17:00:00Z", { pagamentoMetodo: "pix" }),
  mov("ajuste_manual_debito", 3, "2026-07-03T17:00:00Z"),
];

describe("planilha do extrato (montarExtratoWorkbook da origem)", () => {
  it("tem as 7 abas da origem, na ordem", () => {
    const wb = montarExtratoWorkbook("Areacre", MOVIMENTOS, [], new Date("2026-09-24T12:00:00Z"));
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Resumo",
      "Todos",
      "Fretes",
      "Abastecimentos",
      "Abast. Tanque",
      "Pagamentos",
      "Ajustes",
    ]);
  });

  it("Todos: saldo encadeado por fórmula, última linha parte do zero", () => {
    const wb = montarExtratoWorkbook("Areacre", MOVIMENTOS, [], new Date());
    const ws = wb.getWorksheet("Todos")!;
    const ultima = PRIMEIRA + MOVIMENTOS.length - 1;
    expect(ws.getCell(PRIMEIRA - 1, 7).value).toBe("Saldo");
    expect(formula(ws.getCell(PRIMEIRA, 7))).toBe(`G${PRIMEIRA + 1}+SUM(E${PRIMEIRA})-SUM(F${PRIMEIRA})`);
    expect(formula(ws.getCell(ultima, 7))).toBe(`SUM(E${ultima})-SUM(F${ultima})`);
    // A 1ª linha é a mais nova, e o saldo dela é o final: 1443 - 690 - 500 - 3.
    expect(resultado(ws.getCell(PRIMEIRA, 7))).toBe(250);
    expect(formula(ws.getCell(ultima + 1, 5))).toBe(`SUM(E${PRIMEIRA}:E${ultima})`);
  });

  it("Fretes e Abastecimentos: o valor da linha é a conta da linha", () => {
    const wb = montarExtratoWorkbook("Areacre", MOVIMENTOS, [], new Date());
    expect(formula(wb.getWorksheet("Fretes")!.getCell(PRIMEIRA, 13))).toBe(`F${PRIMEIRA}*G${PRIMEIRA}*H${PRIMEIRA}`);
    const ab = wb.getWorksheet("Abastecimentos")!;
    expect(formula(ab.getCell(PRIMEIRA, 10))).toBe(`D${PRIMEIRA}*(E${PRIMEIRA}+F${PRIMEIRA})`);
    // Rodapé do preço: médio ponderado (total ÷ litros).
    expect(formula(ab.getCell(PRIMEIRA + 1, 5))).toBe(`IFERROR(J${PRIMEIRA + 1}/D${PRIMEIRA + 1},0)`);
    expect(resultado(ab.getCell(PRIMEIRA + 1, 5))).toBe(6.9);
  });

  it("filtro de mês vale para todas as abas; aba vazia não gera fórmula de intervalo inválido", () => {
    const wb = montarExtratoWorkbook("Areacre", MOVIMENTOS, ["2026-07-01"], new Date());
    expect(wb.getWorksheet("Todos")!.getCell(PRIMEIRA, 2).value).toBe("Débito · Ajuste manual");
    const fretes = wb.getWorksheet("Fretes")!;
    expect(fretes.getCell(PRIMEIRA, 1).value).toBe("TOTAL (0 registros)");
    expect(formula(fretes.getCell(PRIMEIRA, 13))).toBeUndefined();
  });

  it("Resumo aponta para as abas por fórmula e a equação do saldo fecha", () => {
    const wb = montarExtratoWorkbook("Areacre", MOVIMENTOS, [], new Date());
    const ws = wb.getWorksheet("Resumo")!;
    const formulas: string[] = [];
    ws.eachRow((row) =>
      row.eachCell((cell) => {
        const f = formula(cell);
        if (f) formulas.push(f);
      }),
    );
    const ultima = PRIMEIRA + MOVIMENTOS.length - 1;
    expect(formulas).toContain(`SUM(Todos!E${PRIMEIRA}:E${ultima})-SUM(Todos!F${PRIMEIRA}:F${ultima})`);
    expect(formulas).toContain(`SUM(Fretes!M${PRIMEIRA}:M${PRIMEIRA})`);
    // Créditos − Débitos (a origem fazia Créditos − Pagamentos e não fechava).
    expect(formulas).toContain(`SUM(Todos!F${PRIMEIRA}:F${ultima})`);
    expect(formulas.some((f) => /^A\d+-C\d+$/.test(f))).toBe(true);
  });
});
