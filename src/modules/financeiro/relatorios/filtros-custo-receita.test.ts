import { describe, expect, it } from "vitest";

import {
  lerFiltrosCustoReceita,
  MAX_MESES,
  mesesDaJanela,
} from "@/modules/financeiro/relatorios/filtros-custo-receita";

const CUSTO_A = "11111111-1111-4111-8111-111111111111";
const CUSTO_B = "22222222-2222-4222-8222-222222222222";
const RECEITA_A = "33333333-3333-4333-8333-333333333333";

/** O que a tela tem para oferecer no seletor de meses. */
const DISPONIVEIS = ["2026-05", "2026-06", "2026-07", "2026-08"];

describe("lerFiltrosCustoReceita", () => {
  it("sem nada na URL, o relatório é de TODOS os meses que existem", () => {
    // O padrão responde "quanto essa obra deu de resultado", que é a pergunta
    // que faz alguém abrir esta tela.
    const { filtros, mesesEfetivos, periodoDesabilitado } =
      lerFiltrosCustoReceita({}, DISPONIVEIS);
    expect(filtros.meses).toEqual([]);
    expect(mesesEfetivos).toEqual(DISPONIVEIS);
    expect(periodoDesabilitado).toBe(false);
  });

  it("mês marcado MANDA, e desabilita o período", () => {
    const { mesesEfetivos, periodoDesabilitado } = lerFiltrosCustoReceita(
      { mes_ref: "2026-07,2026-05", de: "2026-01", ate: "2026-03" },
      DISPONIVEIS,
    );
    // Em ordem crescente, não na ordem de clique: o eixo do gráfico é o tempo.
    expect(mesesEfetivos).toEqual(["2026-05", "2026-07"]);
    expect(periodoDesabilitado).toBe(true);
  });

  it("só período: vira a lista contígua de meses da janela", () => {
    const { mesesEfetivos, periodoDesabilitado } = lerFiltrosCustoReceita(
      { de: "2026-06", ate: "2026-08" },
      DISPONIVEIS,
    );
    expect(mesesEfetivos).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(periodoDesabilitado).toBe(false);
  });

  it("janela invertida é trocada de lado, em vez de vir vazia", () => {
    const { filtros, mesesEfetivos } = lerFiltrosCustoReceita(
      { de: "2026-08", ate: "2026-06" },
      DISPONIVEIS,
    );
    expect(filtros.de).toBe("2026-06");
    expect(filtros.ate).toBe("2026-08");
    expect(mesesEfetivos).toEqual(["2026-06", "2026-07", "2026-08"]);
  });

  it("uma ponta só da janela vale a partir dela, dentro do que existe", () => {
    const doDe = lerFiltrosCustoReceita({ de: "2026-07" }, DISPONIVEIS);
    expect(doDe.mesesEfetivos).toEqual(["2026-07", "2026-08"]);

    const doAte = lerFiltrosCustoReceita({ ate: "2026-06" }, DISPONIVEIS);
    expect(doAte.mesesEfetivos).toEqual(["2026-05", "2026-06"]);
  });

  it("mês fora do formato não vira filtro", () => {
    const { filtros, mesesEfetivos } = lerFiltrosCustoReceita(
      { mes_ref: "2026-13,julho,2026-7" },
      DISPONIVEIS,
    );
    expect(filtros.meses).toEqual([]);
    // Nenhum mês válido = cai no padrão, e não numa lista vazia que mostraria
    // "sem dados" para um filtro que a pessoa não conseguiu aplicar.
    expect(mesesEfetivos).toEqual(DISPONIVEIS);
  });

  it("mês repetido conta uma vez", () => {
    const { mesesEfetivos } = lerFiltrosCustoReceita(
      { mes_ref: "2026-07,2026-07" },
      DISPONIVEIS,
    );
    expect(mesesEfetivos).toEqual(["2026-07"]);
  });

  it("os dois lados de centro são listas INDEPENDENTES", () => {
    // É o pedido: custo de um conjunto de centros contra receita de outro.
    const { filtros } = lerFiltrosCustoReceita(
      {
        centro_custo: `${CUSTO_A},${CUSTO_B}`,
        centro_receita: RECEITA_A,
      },
      DISPONIVEIS,
    );
    expect(filtros.centrosCusto).toEqual([CUSTO_A, CUSTO_B]);
    expect(filtros.centrosReceita).toEqual([RECEITA_A]);
  });

  it("uuid inválido em qualquer um dos lados não vira filtro", () => {
    const { filtros } = lerFiltrosCustoReceita(
      { centro_custo: "abc", centro_receita: "123" },
      DISPONIVEIS,
    );
    expect(filtros.centrosCusto).toEqual([]);
    expect(filtros.centrosReceita).toEqual([]);
  });

  it("lista de meses corta no teto", () => {
    const muitos = Array.from({ length: MAX_MESES + 12 }, (_, i) => {
      const ano = 2020 + Math.floor(i / 12);
      const mes = String((i % 12) + 1).padStart(2, "0");
      return `${ano}-${mes}`;
    });
    const { mesesEfetivos } = lerFiltrosCustoReceita(
      { mes_ref: muitos.join(",") },
      DISPONIVEIS,
    );
    expect(mesesEfetivos).toHaveLength(MAX_MESES);
  });

  it("janela larga também corta no teto", () => {
    const { mesesEfetivos } = lerFiltrosCustoReceita(
      { de: "2000-01", ate: "2030-12" },
      DISPONIVEIS,
    );
    expect(mesesEfetivos).toHaveLength(MAX_MESES);
  });

  it("sem mês disponível nenhum, o padrão é lista vazia e não estoura", () => {
    // Base nova, sem lançamento: a tela mostra vazio com explicação, não erro.
    const { mesesEfetivos } = lerFiltrosCustoReceita({}, []);
    expect(mesesEfetivos).toEqual([]);
  });

  it("chave repetida na URL vale como lista", () => {
    const { mesesEfetivos } = lerFiltrosCustoReceita(
      { mes_ref: ["2026-05", "2026-08"] },
      DISPONIVEIS,
    );
    expect(mesesEfetivos).toEqual(["2026-05", "2026-08"]);
  });
});

describe("mesesDaJanela", () => {
  it("conta as duas pontas", () => {
    expect(mesesDaJanela("2026-01", "2026-03")).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });

  it("mesmo mês nas duas pontas é um mês", () => {
    expect(mesesDaJanela("2026-02", "2026-02")).toEqual(["2026-02"]);
  });

  it("atravessa o ano sem inventar mês 13", () => {
    expect(mesesDaJanela("2025-11", "2026-02")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });
});
