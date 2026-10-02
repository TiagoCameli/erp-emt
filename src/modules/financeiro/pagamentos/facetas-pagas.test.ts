import { describe, expect, it } from "vitest";

import { facetasNoServidor } from "@/modules/_shared/filtros-facetados";

import {
  facetasDasPagas,
  filtrosPagasSemFaceta,
  type FacetaPagas,
  type LinhaFacetaPagas,
} from "./filtros-pagas";
import type { FiltrosParcelasPagas } from "./queries";

function parcela(
  conta: string,
  fornecedor: string,
  centro: string,
): LinhaFacetaPagas {
  return {
    conta_bancaria_id: conta,
    lancamento_formas: null,
    lancamentos: {
      fornecedor_id: fornecedor,
      categoria_id: null,
      origem: "manual",
      lancamento_rateios: [{ centro_custo_id: centro }],
    },
  };
}

describe("facetas da aba Pagas", () => {
  it("escolher conta restringe fornecedores e centros aos pagos por ela", async () => {
    const linhas = [
      parcela("itau", "f1", "obra"),
      parcela("itau", "f2", "obra"),
      parcela("bb", "f3", "escritorio"),
    ];
    const filtros: FiltrosParcelasPagas = { contaBancariaIds: ["itau"] };
    // Dublê da consulta: só a conta está escolhida.
    const consultar = async (exceto: FacetaPagas | null) => {
      const recorte =
        exceto === null ? filtros : filtrosPagasSemFaceta(filtros, exceto, []);
      return linhas.filter(
        (l) =>
          !recorte.contaBancariaIds?.length ||
          recorte.contaBancariaIds.includes(l.conta_bancaria_id ?? ""),
      );
    };

    const facetas = await facetasNoServidor(
      facetasDasPagas(filtros, false),
      consultar,
    );

    expect(facetas.fornecedor.sort()).toEqual(["f1", "f2"]);
    expect(facetas.centro).toEqual(["obra"]);
    // A própria conta continua oferecendo as outras.
    expect(facetas.conta.sort()).toEqual(["bb", "itau"]);
  });

  it("etapa solta só as etapas e mantém a raiz escolhida", () => {
    const filtros: FiltrosParcelasPagas = { centroCustoIds: ["etapa-1"] };
    expect(
      filtrosPagasSemFaceta(filtros, "etapa", ["raiz"]).centroCustoIds,
    ).toEqual(["raiz"]);
    expect(
      filtrosPagasSemFaceta(filtros, "centro", ["raiz"]).centroCustoIds,
    ).toBeUndefined();
  });
});
