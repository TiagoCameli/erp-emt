import { describe, expect, it } from "vitest";

import {
  conferenciaDoLote,
  resumoPorCentroCusto,
} from "@/modules/rh/decimo-terceiro/calculo";
import type { ItemDoLote, LoteDetalhe } from "@/modules/rh/decimo-terceiro/queries";

function item(over: Partial<ItemDoLote> = {}): ItemDoLote {
  return {
    id: "i1",
    colaboradorId: "c1",
    colaboradorNome: "Zé",
    centroCustoId: "cc1",
    centroCustoNome: "Obra A",
    centroCustoCodigo: "001",
    vinculo: "clt",
    dataAdmissao: "2026-01-10",
    salarioBase: 3000,
    valorBruto: 1500,
    valorInss: 0,
    valorIrrf: 0,
    valorLiquido: 1500,
    editadoManualmente: false,
    lancamentoId: null,
    ...over,
  };
}

function lote(itens: ItemDoLote[], over: Partial<LoteDetalhe> = {}): LoteDetalhe {
  return {
    id: "l1",
    ano: 2026,
    parcela: 1,
    status: "rascunho",
    dataVencimento: null,
    valorBruto: 0,
    valorDescontos: 0,
    valorLiquido: 0,
    quantidadePessoas: itens.length,
    motivoRejeicao: null,
    itens,
    ...over,
  };
}

describe("resumoPorCentroCusto", () => {
  it("soma o líquido por centro e ordena do maior para o menor", () => {
    const resumo = resumoPorCentroCusto(
      lote([
        item({ id: "a", centroCustoId: "cc1", centroCustoNome: "Obra A", valorLiquido: 100 }),
        item({ id: "b", centroCustoId: "cc2", centroCustoNome: "Obra B", valorLiquido: 300 }),
        item({ id: "c", centroCustoId: "cc1", centroCustoNome: "Obra A", valorLiquido: 50 }),
      ]),
    );

    expect(resumo).toEqual([
      { centroCustoId: "cc2", centroCustoNome: "Obra B", valorLiquido: 300 },
      { centroCustoId: "cc1", centroCustoNome: "Obra A", valorLiquido: 150 },
    ]);
  });

  it("agrupa quem não tem centro num grupo próprio", () => {
    const resumo = resumoPorCentroCusto(
      lote([item({ centroCustoId: null, centroCustoNome: null, valorLiquido: 80 })]),
    );

    expect(resumo).toEqual([
      { centroCustoId: null, centroCustoNome: "Sem centro de custo", valorLiquido: 80 },
    ]);
  });

  it("não mistura dois centros que só têm o nome parecido", () => {
    const resumo = resumoPorCentroCusto(
      lote([
        item({ id: "a", centroCustoId: "cc1", centroCustoNome: "Obra A", valorLiquido: 10 }),
        item({ id: "b", centroCustoId: "cc2", centroCustoNome: "Obra A", valorLiquido: 20 }),
      ]),
    );

    // Agrupa por id, não por nome: dois centros podem se chamar igual.
    expect(resumo).toHaveLength(2);
  });

  it("devolve lista vazia para lote sem item", () => {
    expect(resumoPorCentroCusto(lote([]))).toEqual([]);
  });
});

describe("conferenciaDoLote", () => {
  it("fecha quando a soma dos itens bate com o total gravado", () => {
    const l = lote([item({ valorLiquido: 1500 }), item({ id: "i2", valorLiquido: 400 })], {
      valorLiquido: 1900,
    });

    expect(conferenciaDoLote(l)).toEqual({
      somaDosItens: 1900,
      totalGravado: 1900,
      diferenca: 0,
      fecha: true,
      editadosAMao: 0,
    });
  });

  it("acusa quando o total gravado diverge da soma dos itens", () => {
    const l = lote([item({ valorLiquido: 1500 })], { valorLiquido: 1400 });
    const c = conferenciaDoLote(l);

    expect(c.fecha).toBe(false);
    expect(c.diferenca).toBe(100);
  });

  it("não acusa diferença que é só ruído de ponto flutuante", () => {
    // 0,1 + 0,2 dá 0,30000000000000004 em binário. Comparar float direto
    // acusaria divergência num lote que fecha.
    const l = lote(
      [item({ id: "a", valorLiquido: 0.1 }), item({ id: "b", valorLiquido: 0.2 })],
      { valorLiquido: 0.3 },
    );

    expect(conferenciaDoLote(l).fecha).toBe(true);
  });

  it("conta quantos itens foram editados à mão", () => {
    const l = lote([
      item({ id: "a", editadoManualmente: true }),
      item({ id: "b" }),
      item({ id: "c", editadoManualmente: true }),
    ]);

    expect(conferenciaDoLote(l).editadosAMao).toBe(2);
  });
});
