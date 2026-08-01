import { beforeEach, describe, expect, it, vi } from "vitest";

import { dataHojeISO } from "@/lib/formatadores";

/**
 * Os KPIs de Compras e Financeiro do painel somavam LINHA no Node. O PostgREST
 * corta em 1000 linhas sem erro nenhum, então a partir da milésima parcela os
 * cartões passariam a mostrar menos dinheiro do que a empresa tem a pagar, em
 * silêncio, na primeira tela depois do login.
 *
 * Estes testes travam as duas metades da correção: a soma tem que vir pronta do
 * banco (nenhum `.from()` nas tabelas de volume) e o NUMERIC que chega como
 * string tem que virar o real certo.
 */

const { rpc, from } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc, from }),
}));

const { comprasResumo, financeiroResumo } = await import(
  "@/modules/gestao/queries"
);

/** Uma linha, como a RPC devolve; NUMERIC chega como string do PostgREST. */
function resposta(linha: Record<string, unknown>) {
  return { data: [linha], error: null };
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  from.mockImplementation((tabela: string) => {
    throw new Error(`baixou linha crua de ${tabela} em vez de agregar no banco`);
  });
});

describe("comprasResumo", () => {
  it("agrega no banco e não varre ordens_compra linha a linha", async () => {
    rpc.mockResolvedValue(
      resposta({
        ocs_aprovar_contagem: 1200,
        ocs_aprovar_valor: "9876543.21",
        ocs_abertas_contagem: 3,
        ocs_abertas_valor: "1500.50",
        cotacoes_abertas: 7,
      }),
    );

    const resumo = await comprasResumo();

    expect(rpc).toHaveBeenCalledWith("fn_rel_gestao_compras_resumo");
    expect(from).not.toHaveBeenCalled();
    // 1200 > 1000: é exatamente o número que o caminho antigo perdia.
    expect(resumo.ocsAprovar).toEqual({ contagem: 1200, valor: 9876543.21 });
    expect(resumo.ocsAbertas).toEqual({ contagem: 3, valor: 1500.5 });
    expect(resumo.cotacoesAbertas).toBe(7);
  });

  it("sem linha (RLS barrou) mostra zero, não NaN", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const resumo = await comprasResumo();

    expect(resumo.ocsAprovar).toEqual({ contagem: 0, valor: 0 });
    expect(resumo.ocsAbertas).toEqual({ contagem: 0, valor: 0 });
    expect(resumo.cotacoesAbertas).toBe(0);
  });

  it("erro do banco não vira painel zerado", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "caiu" } });

    await expect(comprasResumo()).rejects.toThrow(
      "Não foi possível carregar o resumo de Compras",
    );
  });
});

describe("financeiroResumo", () => {
  it("agrega no banco e manda o hoje do painel, não o do servidor", async () => {
    rpc.mockResolvedValue(
      resposta({
        a_pagar_contagem: 2500,
        a_pagar_vencidas: 340,
        a_pagar_valor: "4200000.00",
        a_aprovar_contagem: 1801,
        a_aprovar_valor: "355000.99",
        pago_mes_contagem: 1050,
        pago_mes_valor: "988877.66",
      }),
    );

    const resumo = await financeiroResumo();

    expect(rpc).toHaveBeenCalledWith("fn_rel_gestao_financeiro_resumo", {
      p_hoje: dataHojeISO(),
    });
    expect(from).not.toHaveBeenCalled();
    // Os três cortes passam de 1000 parcelas: no caminho antigo, todos mentiam.
    expect(resumo.aPagar).toEqual({
      contagem: 2500,
      vencidas: 340,
      valor: 4200000,
    });
    expect(resumo.aAprovar).toEqual({ contagem: 1801, valor: 355000.99 });
    expect(resumo.pagoNoMes).toEqual({ contagem: 1050, valor: 988877.66 });
  });

  it("sem linha (RLS barrou) mostra zero, não NaN", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const resumo = await financeiroResumo();

    expect(resumo.aPagar).toEqual({ contagem: 0, vencidas: 0, valor: 0 });
    expect(resumo.aAprovar).toEqual({ contagem: 0, valor: 0 });
    expect(resumo.pagoNoMes).toEqual({ contagem: 0, valor: 0 });
  });

  it("erro do banco não vira painel zerado", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "caiu" } });

    await expect(financeiroResumo()).rejects.toThrow(
      "Não foi possível carregar o resumo do Financeiro",
    );
  });
});
