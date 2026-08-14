import { describe, expect, it } from "vitest";

import {
  comparacaoPermitida,
  lerFiltrosCustoCc,
  periodoAnterior,
  periodoDoModo,
} from "@/modules/financeiro/relatorios/filtros-custo-cc";

const MES_CORRENTE = "2026-08";
const CENTRO = "fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0";
const CATEGORIA = "11111111-1111-4111-8111-111111111111";
const FORNECEDOR = "22222222-2222-4222-8222-222222222222";

/**
 * Mesmo contrato do de lançamentos: só o que passou na validação chega na tela,
 * porque filtro inválido aparecendo preenchido na barra faz o usuário ler que o
 * relatório está filtrado quando ele não está — e o número na tela é dinheiro.
 */
describe("lerFiltrosCustoCc", () => {
  it("sem parâmetro nenhum, é o mês corrente", () => {
    const { filtros } = lerFiltrosCustoCc({}, MES_CORRENTE);
    expect(filtros.modo).toBe("mes");
    expect(filtros.mes).toBe(MES_CORRENTE);
    expect(filtros.comparar).toBe(false);
    expect(filtros.incluirPrevisto).toBe(false);
    expect(filtros.centroId).toBeUndefined();
  });

  it("modo inválido cai no mês, sem inventar período", () => {
    const { filtros } = lerFiltrosCustoCc({ modo: "sempre" }, MES_CORRENTE);
    expect(filtros.modo).toBe("mes");
  });

  it("mês inválido na URL não vira filtro", () => {
    for (const mes of ["2026-13", "2026-00", "2026-7", "julho", ""]) {
      const { filtros } = lerFiltrosCustoCc({ mes }, MES_CORRENTE);
      expect(filtros.mes).toBe(MES_CORRENTE);
    }
  });

  it("período invertido é trocado de lado", () => {
    // Período invertido traria a tela vazia sem explicação nenhuma.
    const { filtros } = lerFiltrosCustoCc(
      { modo: "periodo", de: "2026-07", ate: "2025-01" },
      MES_CORRENTE,
    );
    expect(filtros.de).toBe("2025-01");
    expect(filtros.ate).toBe("2026-07");
  });

  it("modo vida sem centro devolve o motivo", () => {
    // Vida é por centro: sem centro escolhido o modo não tem de onde tirar o
    // início, e precisa DIZER isso em vez de cair calado em outro período.
    const { filtros, erroDoModo } = lerFiltrosCustoCc(
      { modo: "vida" },
      MES_CORRENTE,
    );
    expect(filtros.modo).toBe("vida");
    expect(erroDoModo).toMatch(/centro de custo/i);
  });

  it("modo vida com centro não tem erro", () => {
    const { erroDoModo } = lerFiltrosCustoCc(
      { modo: "vida", centro: CENTRO },
      MES_CORRENTE,
    );
    expect(erroDoModo).toBeUndefined();
  });

  it("lê os demais filtros", () => {
    const { filtros } = lerFiltrosCustoCc(
      {
        categoria: CATEGORIA,
        fornecedor: FORNECEDOR,
        previsto: "1",
        tipo_centro: "obra",
        comparar: "1",
      },
      MES_CORRENTE,
    );
    expect(filtros.categoriaId).toBe(CATEGORIA);
    expect(filtros.fornecedorId).toBe(FORNECEDOR);
    expect(filtros.incluirPrevisto).toBe(true);
    expect(filtros.tipoCentro).toBe("obra");
    expect(filtros.comparar).toBe(true);
  });

  it("previsto e comparar ligam só no literal 1", () => {
    for (const valor of ["0", "true", "sim", ""]) {
      const { filtros } = lerFiltrosCustoCc(
        { previsto: valor, comparar: valor },
        MES_CORRENTE,
      );
      expect(filtros.incluirPrevisto).toBe(false);
      expect(filtros.comparar).toBe(false);
    }
  });

  it("tipo_centro fora do catálogo não vira filtro", () => {
    const { filtros } = lerFiltrosCustoCc(
      { tipo_centro: "almoxarifado" },
      MES_CORRENTE,
    );
    expect(filtros.tipoCentro).toBeUndefined();
  });

  it("uuid inválido em centro, categoria e fornecedor não vira filtro", () => {
    const { filtros } = lerFiltrosCustoCc(
      { centro: "abc", categoria: "123", fornecedor: "x-y-z" },
      MES_CORRENTE,
    );
    expect(filtros.centroId).toBeUndefined();
    expect(filtros.categoriaId).toBeUndefined();
    expect(filtros.fornecedorId).toBeUndefined();
  });

  it("chave repetida na URL (array) não vira filtro", () => {
    const { filtros } = lerFiltrosCustoCc(
      { modo: ["mes", "total"], mes: ["2026-07", "2026-08"] },
      MES_CORRENTE,
    );
    expect(filtros.modo).toBe("mes");
    expect(filtros.mes).toBe(MES_CORRENTE);
  });
});

describe("periodoDoModo", () => {
  it("mes devolve o mês", () => {
    const { filtros } = lerFiltrosCustoCc({ mes: "2026-07" }, MES_CORRENTE);
    expect(periodoDoModo(filtros)).toEqual({ mes: "2026-07" });
  });

  it("periodo devolve as duas pontas", () => {
    const { filtros } = lerFiltrosCustoCc(
      { modo: "periodo", de: "2025-01", ate: "2026-07" },
      MES_CORRENTE,
    );
    expect(periodoDoModo(filtros)).toEqual({ de: "2025-01", ate: "2026-07" });
  });

  it("total não devolve limite nenhum", () => {
    const { filtros } = lerFiltrosCustoCc({ modo: "total" }, MES_CORRENTE);
    expect(periodoDoModo(filtros)).toEqual({});
  });

  it("vida vai do primeiro mês do centro até o mês corrente", () => {
    const { filtros } = lerFiltrosCustoCc(
      { modo: "vida", centro: CENTRO },
      MES_CORRENTE,
    );
    expect(periodoDoModo(filtros, "2025-01")).toEqual({
      de: "2025-01",
      ate: MES_CORRENTE,
    });
  });

  it("vida sem primeiro mês devolve período vazio", () => {
    // Centro sem lançamento nenhum: período vazio é honesto, um período inventado
    // mostraria zero como se fosse um dado medido.
    const { filtros } = lerFiltrosCustoCc(
      { modo: "vida", centro: CENTRO },
      MES_CORRENTE,
    );
    expect(periodoDoModo(filtros, undefined)).toEqual({});
  });
});

describe("periodoAnterior", () => {
  it("do mês, é o mês anterior", () => {
    expect(periodoAnterior({ mes: "2026-01" })).toEqual({ mes: "2025-12" });
    expect(periodoAnterior({ mes: "2026-08" })).toEqual({ mes: "2026-07" });
  });

  it("do período, é a janela de mesmo tamanho imediatamente antes", () => {
    // 3 meses (jan, fev, mar) -> os 3 anteriores (out, nov, dez)
    expect(periodoAnterior({ de: "2026-01", ate: "2026-03" })).toEqual({
      de: "2025-10",
      ate: "2025-12",
    });
  });

  it("de um mês só em de/ate, é o mês anterior", () => {
    expect(periodoAnterior({ de: "2026-03", ate: "2026-03" })).toEqual({
      de: "2026-02",
      ate: "2026-02",
    });
  });

  it("janela de 12 meses recua 12 meses", () => {
    expect(periodoAnterior({ de: "2026-01", ate: "2026-12" })).toEqual({
      de: "2025-01",
      ate: "2025-12",
    });
  });

  it("não existe anterior a tudo", () => {
    expect(periodoAnterior({})).toBeNull();
  });

  it("período com uma ponta só não tem anterior definido", () => {
    expect(periodoAnterior({ de: "2026-01" })).toBeNull();
    expect(periodoAnterior({ ate: "2026-01" })).toBeNull();
  });
});

describe("comparacaoPermitida", () => {
  it("vale no mês e no período, não no total nem na vida", () => {
    // Em total não existe anterior a "tudo", e em vida o anterior ao primeiro
    // lançamento é vazio: os dois mostrariam variação de 100% contra zero, que se
    // lê como a obra tendo dobrado de custo.
    expect(comparacaoPermitida("mes")).toBe(true);
    expect(comparacaoPermitida("periodo")).toBe(true);
    expect(comparacaoPermitida("total")).toBe(false);
    expect(comparacaoPermitida("vida")).toBe(false);
  });
});
