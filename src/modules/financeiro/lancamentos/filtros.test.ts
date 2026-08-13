import { describe, expect, it } from "vitest";

import {
  TAMANHO_PADRAO,
  lerFiltrosLancamentos,
  parametrosDaQueryString,
} from "@/modules/financeiro/lancamentos/filtros";

const FORNECEDOR = "11111111-1111-4111-8111-111111111111";

/**
 * A leitura da URL é o contrato entre a lista da tela e a planilha do Excel: as
 * duas passam por aqui. Se um filtro válido cair no caminho, a planilha sai com
 * mais lançamentos do que a tela mostra; se um filtro inválido passar, sai com
 * menos. Nos dois casos o relatório contradiz o sistema sem avisar ninguém.
 */
describe("lerFiltrosLancamentos", () => {
  it("sem parâmetro nenhum, não filtra nada e usa a primeira página", () => {
    const { filtros, valores, pagina, tamanho } = lerFiltrosLancamentos({});

    expect(filtros.tipo).toBeUndefined();
    expect(filtros.status).toBeUndefined();
    expect(filtros.mesCompetencia).toBeUndefined();
    expect(filtros.busca).toBe("");
    expect(valores.tipo).toBe("");
    expect(pagina).toBe(0);
    expect(tamanho).toBe(TAMANHO_PADRAO);
  });

  it("aceita os filtros válidos e devolve os mesmos valores para a tela", () => {
    const { filtros, valores } = lerFiltrosLancamentos({
      tipo: "a_receber",
      status: "pago",
      revisao: "nao_revisado",
      origem: "oc",
      fornecedor: FORNECEDOR,
      mes: "2026-07",
      busca: "combustível",
    });

    expect(filtros.tipo).toBe("a_receber");
    expect(filtros.status).toBe("pago");
    expect(filtros.revisao).toBe("nao_revisado");
    expect(filtros.origem).toBe("oc");
    expect(filtros.fornecedorId).toBe(FORNECEDOR);
    // O banco guarda a competência normalizada no dia 1; a tela mostra yyyy-MM.
    expect(filtros.mesCompetencia).toBe("2026-07-01");
    expect(valores.mes).toBe("2026-07");
    expect(valores.status).toBe("pago");
    expect(valores.fornecedor).toBe(FORNECEDOR);
  });

  it("descarta valor fora do catálogo em vez de mandar lixo pro banco", () => {
    const { filtros, valores } = lerFiltrosLancamentos({
      tipo: "a_pagar_talvez",
      status: "em_revisao", // status de PARCELA, não de lançamento
      origem: "cotacao", // cotação não gera lançamento
      revisao: "quase",
    });

    expect(filtros.tipo).toBeUndefined();
    expect(filtros.status).toBeUndefined();
    expect(filtros.origem).toBeUndefined();
    expect(filtros.revisao).toBeUndefined();
    // E não pode aparecer preenchido na barra como se estivesse valendo.
    expect(valores.tipo).toBe("");
    expect(valores.status).toBe("");
  });

  it("descarta uuid malformado (senão o PostgREST devolve erro cru)", () => {
    const { filtros } = lerFiltrosLancamentos({
      fornecedor: "123",
      categoria: "'; drop table lancamentos; --",
      centro: FORNECEDOR,
    });

    expect(filtros.fornecedorId).toBeUndefined();
    expect(filtros.categoriaId).toBeUndefined();
    expect(filtros.centroCustoId).toBe(FORNECEDOR);
  });

  it("endireita período invertido em vez de devolver lista vazia", () => {
    const { filtros, valores } = lerFiltrosLancamentos({
      venc_de: "2026-08-31",
      venc_ate: "2026-08-01",
    });

    expect(filtros.vencimentoDe).toBe("2026-08-01");
    expect(filtros.vencimentoAte).toBe("2026-08-31");
    expect(valores.vencDe).toBe("2026-08-01");
  });

  it("endireita faixa de valor invertida e recusa valor negativo", () => {
    const { filtros } = lerFiltrosLancamentos({
      valor_de: "5000",
      valor_ate: "100",
    });
    expect(filtros.valorDe).toBe(100);
    expect(filtros.valorAte).toBe(5000);

    const negativo = lerFiltrosLancamentos({ valor_de: "-1" });
    expect(negativo.filtros.valorDe).toBeUndefined();
  });

  it("página da URL conta de 1, o banco conta de 0", () => {
    expect(lerFiltrosLancamentos({ pagina: "3" }).pagina).toBe(2);
    // Página inválida volta para a primeira, não para NaN.
    expect(lerFiltrosLancamentos({ pagina: "0" }).pagina).toBe(0);
    expect(lerFiltrosLancamentos({ pagina: "abc" }).pagina).toBe(0);
    expect(lerFiltrosLancamentos({ tamanho: "100" }).tamanho).toBe(100);
    expect(lerFiltrosLancamentos({ tamanho: "-5" }).tamanho).toBe(
      TAMANHO_PADRAO,
    );
  });

  it("chave repetida na URL não vale como filtro (é array, não string)", () => {
    const { filtros } = lerFiltrosLancamentos({
      tipo: ["a_pagar", "a_receber"],
    });
    expect(filtros.tipo).toBeUndefined();
  });
});

/**
 * A exportação recebe a query string crua da tela e precisa enxergá-la do MESMO
 * jeito que a página enxerga os searchParams do App Router, chave repetida
 * incluída: senão a planilha aceitaria um filtro que a lista descarta.
 */
describe("parametrosDaQueryString", () => {
  it("lê a query string como a página lê os searchParams", () => {
    const params = parametrosDaQueryString(
      "tipo=a_pagar&mes=2026-07&busca=combust%C3%ADvel",
    );
    expect(params).toEqual({
      tipo: "a_pagar",
      mes: "2026-07",
      busca: "combustível",
    });
  });

  it("chave repetida vira array, igual ao App Router", () => {
    expect(parametrosDaQueryString("tipo=a_pagar&tipo=a_receber")).toEqual({
      tipo: ["a_pagar", "a_receber"],
    });
  });

  it("query vazia não inventa parâmetro", () => {
    expect(parametrosDaQueryString("")).toEqual({});
  });

  it("query da tela e searchParams da página levam ao mesmo filtro", () => {
    const query = `tipo=a_pagar&status=aprovado&fornecedor=${FORNECEDOR}&venc_de=2026-08-01&pagina=2`;
    const daQuery = lerFiltrosLancamentos(parametrosDaQueryString(query));
    const daPagina = lerFiltrosLancamentos({
      tipo: "a_pagar",
      status: "aprovado",
      fornecedor: FORNECEDOR,
      venc_de: "2026-08-01",
      pagina: "2",
    });

    expect(daQuery.filtros).toEqual(daPagina.filtros);
  });
});
