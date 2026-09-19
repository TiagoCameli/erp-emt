import { describe, expect, it } from "vitest";

import {
  lerFiltrosCustoReceita,
  MAX_MESES,
  mesesDaJanela,
} from "@/modules/financeiro/relatorios/filtros-custo-receita";

const CUSTO_A = "11111111-1111-4111-8111-111111111111";
const CUSTO_B = "22222222-2222-4222-8222-222222222222";
const RECEITA_A = "33333333-3333-4333-8333-333333333333";
const ETAPA_A = "44444444-4444-4444-8444-444444444444";
const ETAPA_B = "55555555-5555-4555-8555-555555555555";

/** O que a tela tem para oferecer no seletor de meses. */
const DISPONIVEIS = ["2026-05", "2026-06", "2026-07", "2026-08"];

describe("lerFiltrosCustoReceita", () => {
  it("sem nada na URL, o relatório é de TODOS os meses que existem", () => {
    // O padrão responde "quanto essa obra deu de resultado", que é a pergunta
    // que faz alguém abrir esta tela.
    const { filtros, mesesEfetivos } = lerFiltrosCustoReceita({}, DISPONIVEIS);
    expect(filtros.de).toBe("");
    expect(filtros.ate).toBe("");
    expect(mesesEfetivos).toEqual(DISPONIVEIS);
  });

  it("`mes_ref` do formato antigo vira a janela que cobre os meses marcados", () => {
    const { filtros, mesesEfetivos } = lerFiltrosCustoReceita(
      { mes_ref: "2026-07,2026-05", de: "2026-01", ate: "2026-03" },
      DISPONIVEIS,
    );
    // Manda sobre `de`/`ate`, que era a precedência da tela antiga ("mês marcado
    // manda"), e a janela do menor ao maior traz junto o que está no meio. A
    // régua da barra mostra exatamente esta janela: o relatório não pode
    // recortar por uma lista que nenhum filtro da tela exibe.
    expect(filtros.de).toBe("2026-05");
    expect(filtros.ate).toBe("2026-07");
    expect(mesesEfetivos).toEqual(["2026-05", "2026-06", "2026-07"]);
  });

  it("só período: vira a lista contígua de meses da janela", () => {
    const { mesesEfetivos } = lerFiltrosCustoReceita(
      { de: "2026-06", ate: "2026-08" },
      DISPONIVEIS,
    );
    expect(mesesEfetivos).toEqual(["2026-06", "2026-07", "2026-08"]);
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
    expect(filtros.de).toBe("");
    expect(filtros.ate).toBe("");
    // Nenhum mês válido = cai no padrão, e não numa lista vazia que mostraria
    // "sem dados" para um filtro que a pessoa não conseguiu aplicar.
    expect(mesesEfetivos).toEqual(DISPONIVEIS);
  });

  it("um mês só no `mes_ref` antigo vira janela de um mês", () => {
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

  it("as etapas viajam em parâmetro PRÓPRIO, um por lado", () => {
    // Separadas do centro porque significam coisas diferentes: a raiz é o
    // conjunto e a etapa é o recorte dentro dele. Misturadas num parâmetro só,
    // a tela não teria como abrir cada campo marcado com o que é dele.
    const { filtros } = lerFiltrosCustoReceita(
      {
        centro_custo: CUSTO_A,
        etapa_custo: `${ETAPA_A},${ETAPA_B}`,
        centro_receita: RECEITA_A,
        etapa_receita: ETAPA_A,
      },
      DISPONIVEIS,
    );
    expect(filtros.etapasCusto).toEqual([ETAPA_A, ETAPA_B]);
    expect(filtros.etapasReceita).toEqual([ETAPA_A]);
  });

  it("sem etapa na URL, os dois lados nascem sem recorte", () => {
    const { filtros } = lerFiltrosCustoReceita(
      { centro_custo: CUSTO_A },
      DISPONIVEIS,
    );
    expect(filtros.etapasCusto).toEqual([]);
    expect(filtros.etapasReceita).toEqual([]);
  });

  it("etapa com uuid inválido não vira filtro", () => {
    const { filtros } = lerFiltrosCustoReceita(
      { centro_custo: CUSTO_A, etapa_custo: "escavadeira" },
      DISPONIVEIS,
    );
    expect(filtros.etapasCusto).toEqual([]);
  });

  it("uuid inválido em qualquer um dos lados não vira filtro", () => {
    const { filtros } = lerFiltrosCustoReceita(
      { centro_custo: "abc", centro_receita: "123" },
      DISPONIVEIS,
    );
    expect(filtros.centrosCusto).toEqual([]);
    expect(filtros.centrosReceita).toEqual([]);
  });

  it("janela do `mes_ref` antigo corta no teto", () => {
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

  it("chave repetida na URL vale como lista, e vira a janela que a cobre", () => {
    const { mesesEfetivos } = lerFiltrosCustoReceita(
      { mes_ref: ["2026-05", "2026-08"] },
      DISPONIVEIS,
    );
    expect(mesesEfetivos).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
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
