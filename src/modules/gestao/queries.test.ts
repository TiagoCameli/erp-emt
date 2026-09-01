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

const {
  comprasResumo,
  custoPorCentroCusto,
  custoPorGrupo,
  custoPorMes,
  filtrosDoBanco,
  financeiroResumo,
  maioresCustos,
  maioresFornecedores,
  receitaPorMes,
} = await import("@/modules/gestao/queries");

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

/**
 * Os NOMES dos parâmetros das RPCs de custo, travados um a um.
 *
 * Esta é a classe de defeito mais cara do painel, e ela já aconteceu: até
 * 28/08/2026 `custoPorCentroCusto` mandava `p_centro_custo`/`p_categoria` para
 * uma função que tinha passado a se chamar `p_centros`/`p_categorias`. Escolher
 * uma obra bastava para a função não ser encontrada, o cartão virar um travessão
 * e o gráfico ao lado ficar vazio.
 *
 * Nada disso o `tsc` pega: `supabase.rpc` aceita chave que não existe na
 * assinatura sem reclamar, e o `database.types.ts` vive atrasado em relação ao
 * banco. Sem filtro escolhido o erro também não aparece, porque o supabase-js
 * OMITE a chave `undefined` do corpo e o PostgREST resolve pelos defaults — o
 * que faz o defeito nascer invisível e só morder quem usa o filtro.
 */
describe("nomes dos parâmetros das RPCs de custo", () => {
  const JANELA = {
    inicio: "2026-03-01",
    fim: "2026-09-01",
    meses: [
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
    ],
  };
  const OBRA = "11111111-1111-4111-8111-111111111111";
  const OUTRA = "33333333-3333-4333-8333-333333333333";
  const CATEGORIA = "22222222-2222-4222-8222-222222222222";

  const COM_FILTRO = {
    janela: JANELA,
    centros: [OBRA, OUTRA],
    categorias: [CATEGORIA],
  };
  const SEM_FILTRO = { janela: JANELA, centros: [], categorias: [] };

  /** Os argumentos com que a RPC foi chamada. */
  function argumentos(): Record<string, unknown> {
    return rpc.mock.calls[0][1] as Record<string, unknown>;
  }

  const CASOS: {
    nome: string;
    funcao: string;
    chamar: (filtros: typeof COM_FILTRO) => Promise<unknown>;
  }[] = [
    {
      nome: "custoPorMes",
      funcao: "fn_rel_custo_por_mes",
      chamar: (f) => custoPorMes(f),
    },
    {
      nome: "custoPorCentroCusto",
      funcao: "fn_rel_custo_centro_custo",
      chamar: (f) => custoPorCentroCusto(f),
    },
    {
      nome: "custoPorGrupo",
      funcao: "fn_rel_custo_por_grupo",
      chamar: (f) => custoPorGrupo(f),
    },
    {
      nome: "maioresCustos",
      funcao: "fn_rel_gestao_maiores_custos",
      chamar: (f) => maioresCustos(f),
    },
    {
      nome: "maioresFornecedores",
      funcao: "fn_rel_gestao_maiores_fornecedores",
      chamar: (f) => maioresFornecedores(f),
    },
  ];

  for (const caso of CASOS) {
    it(`${caso.nome} manda a LISTA de centros, e nunca o parâmetro escalar antigo`, async () => {
      rpc.mockResolvedValue({ data: [], error: null });

      await caso.chamar(COM_FILTRO);

      expect(rpc).toHaveBeenCalledWith(caso.funcao, expect.anything());
      const args = argumentos();
      expect(args.p_centros).toEqual([OBRA, OUTRA]);
      expect(args.p_categorias).toEqual([CATEGORIA]);
      // O escalar não pode ir junto: com os dois na mesma chamada a função
      // certa deixa de ser única e o PostgREST responde 300.
      expect(args).not.toHaveProperty("p_centro_custo");
      expect(args).not.toHaveProperty("p_categoria");
    });

    it(`${caso.nome} OMITE o parâmetro quando não há filtro, em vez de mandar lista vazia`, async () => {
      rpc.mockResolvedValue({ data: [], error: null });

      await caso.chamar(SEM_FILTRO);

      const args = argumentos();
      // `undefined` é a chave omitida do corpo, e aí vale o DEFAULT da função.
      // Mandar `[]` funcionaria hoje, mas amarraria a tela a um detalhe do
      // corpo das funções (`cardinality = 0` significar "todos").
      expect(args.p_centros).toBeUndefined();
      expect(args.p_categorias).toBeUndefined();
    });

    it(`${caso.nome} manda o período da janela, e não conta meses para trás`, async () => {
      rpc.mockResolvedValue({ data: [], error: null });

      await caso.chamar(COM_FILTRO);

      const args = argumentos();
      expect(args.p_inicio).toBe("2026-03-01");
      expect(args.p_fim).toBe("2026-09-01");
    });
  }

  it("receitaPorMes filtra os DOIS lados pelo mesmo centro", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await receitaPorMes(COM_FILTRO);

    const args = argumentos();
    // Filtrar a obra e comparar a despesa dela com a receita de todas as obras
    // desenharia uma margem inventada.
    expect(args.p_centros_custo).toEqual([OBRA, OUTRA]);
    expect(args.p_centros_receita).toEqual([OBRA, OUTRA]);
    expect(args.p_meses).toEqual(JANELA.meses);
  });

  it("receitaPorMes soma as raízes e descarta a despesa", async () => {
    rpc.mockResolvedValue({
      data: [
        { mes: "2026-03-01", tipo: "a_receber", total: "1000.00" },
        { mes: "2026-03-01", tipo: "a_receber", total: "500.50" },
        // A despesa vem na mesma resposta e NÃO pode entrar: ela é a
        // `custoPorMes`, que é a fonte do cartão "Custo do mês".
        { mes: "2026-03-01", tipo: "a_pagar", total: "9999.99" },
        { mes: "2026-04-01", tipo: "a_receber", total: "250.25" },
      ],
      error: null,
    });

    const receita = await receitaPorMes(COM_FILTRO);

    expect(receita.get("2026-03-01")).toBe(1500.5);
    expect(receita.get("2026-04-01")).toBe(250.25);
    expect(receita.get("2026-05-01")).toBeUndefined();
  });
});

/**
 * A tradução da URL para o banco. Errar aqui é mandar o conjunto errado para
 * TODOS os blocos de uma vez.
 */
describe("filtrosDoBanco", () => {
  const JANELA = { inicio: "2026-03-01", fim: "2026-09-01", meses: [] };
  const OBRA = "11111111-1111-4111-8111-111111111111";
  const ETAPA = "44444444-4444-4444-8444-444444444444";
  const MANUT = "55555555-5555-4555-8555-555555555555";

  const CADASTRO = [
    { id: OBRA, nome: "Obra", codigo: null, paiId: null, tipo: "obra" },
    { id: MANUT, nome: "Manutenção", codigo: null, paiId: null, tipo: "manutencao" },
    { id: ETAPA, nome: "Bobcat", codigo: null, paiId: MANUT, tipo: null },
  ];

  it("a etapa escolhida SUBSTITUI a raiz dela", async () => {
    const { centros } = filtrosDoBanco(
      { janela: JANELA, centroIds: [MANUT], etapaIds: [ETAPA], categoriaIds: [] },
      CADASTRO,
    );
    // Mandar as duas traria as outras 60 máquinas junto do equipamento pedido.
    expect(centros).toEqual([ETAPA]);
  });

  it("etapa órfã (raiz não escolhida) é descartada", async () => {
    const { centros } = filtrosDoBanco(
      { janela: JANELA, centroIds: [OBRA], etapaIds: [ETAPA], categoriaIds: [] },
      CADASTRO,
    );
    expect(centros).toEqual([OBRA]);
  });

  /**
   * Sem o cadastro não dá para saber de que raiz cada etapa é, e
   * `centrosEfetivos` devolveria vazio — que significa "todos". O painel
   * mostraria a empresa inteira com a barra dizendo que está filtrado.
   */
  it("sem o cadastro, ainda honra as raízes cruas da URL", async () => {
    const { centros } = filtrosDoBanco(
      { janela: JANELA, centroIds: [OBRA], etapaIds: [ETAPA], categoriaIds: [] },
      [],
    );
    expect(centros).toEqual([OBRA]);
  });

  it("sem escolha nenhuma, a lista fica vazia (= todos)", async () => {
    const { centros, categorias } = filtrosDoBanco(
      { janela: JANELA, centroIds: [], etapaIds: [], categoriaIds: [] },
      CADASTRO,
    );
    expect(centros).toEqual([]);
    expect(categorias).toEqual([]);
  });
});
