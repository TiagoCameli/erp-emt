import { describe, expect, it } from "vitest";

import {
  facetasNoServidor,
  restringirOpcoes,
} from "@/modules/_shared/filtros-facetados";
import { valorSemEtapa } from "@/modules/_shared/centro-custo/filtro";
import type { FiltrosLancamentos } from "@/modules/financeiro/lancamentos/filtros";

import {
  facetasDaListagem,
  filtrosSemFaceta,
  raizesPresentes,
  revisoesDaLinha,
  SEM_CATEGORIA,
  type LinhaFacetaLancamentos,
} from "./facetas";

const HOJE = "2026-10-02";

function linha(
  parcial: Partial<LinhaFacetaLancamentos>,
): LinhaFacetaLancamentos {
  return {
    tipo: "a_pagar",
    status: "aprovado",
    origem: "manual",
    fornecedor_id: null,
    categoria_id: null,
    forma_pagamento_id: null,
    lancamento_parcelas: [],
    lancamento_rateios: [],
    ...parcial,
  };
}

const BASE: FiltrosLancamentos = { tipo: "a_pagar" };

describe("facetas da listagem de lançamentos", () => {
  it("escolher fornecedor restringe as categorias às dele", async () => {
    const linhas = [
      linha({ fornecedor_id: "f1", categoria_id: "c1" }),
      linha({ fornecedor_id: "f1", categoria_id: "c2" }),
      linha({ fornecedor_id: "f2", categoria_id: "c3" }),
    ];
    const filtros: FiltrosLancamentos = { ...BASE, fornecedorIds: ["f1"] };
    // Dublê da consulta: aplica só o fornecedor, que é o que está escolhido.
    const consultar = async (exceto: string | null) => {
      const recorte =
        exceto === null
          ? filtros
          : filtrosSemFaceta(filtros, exceto as "fornecedor", []);
      return linhas.filter(
        (l) =>
          !recorte.fornecedorIds?.length ||
          recorte.fornecedorIds.includes(l.fornecedor_id ?? ""),
      );
    };

    const facetas = await facetasNoServidor(
      facetasDaListagem(filtros, false, HOJE),
      consultar,
    );

    expect(facetas.categoria.sort()).toEqual(["c1", "c2"]);
    // O próprio filtro de fornecedor continua oferecendo os outros.
    expect(facetas.fornecedor.sort()).toEqual(["f1", "f2"]);
    const opcoes = restringirOpcoes(
      [
        { valor: "c1", rotulo: "Peças" },
        { valor: "c2", rotulo: "Serviço" },
        { valor: "c3", rotulo: "Diesel" },
      ],
      new Set(facetas.categoria),
    );
    expect(opcoes.map((o) => o.valor)).toEqual(["c1", "c2"]);
  });

  it("lançamento sem categoria oferece a opção \"(sem categoria)\"", () => {
    const { categoria } = facetasDaListagem(BASE, false, HOJE);
    expect(categoria.chave(linha({ categoria_id: null }))).toBe(SEM_CATEGORIA);
    expect(categoria.chave(linha({ categoria_id: "c1" }))).toBe("c1");
  });

  it("\"sem categoria\" ativa a faceta e sai junto ao soltá-la", () => {
    const filtros: FiltrosLancamentos = { ...BASE, semCategoria: true };
    expect(facetasDaListagem(filtros, false, HOJE).categoria.ativo).toBe(true);
    const solto = filtrosSemFaceta(filtros, "categoria", []);
    expect(solto.semCategoria).toBeUndefined();
    expect(solto.categoriaIds).toBeUndefined();
  });

  it("status 'A pagar' é a situação do dinheiro, não o status literal", () => {
    const { status } = facetasDaListagem(BASE, false, HOJE);
    expect(
      status.chave(
        linha({
          status: "aprovado",
          lancamento_parcelas: [
            {
              status: "pendente",
              conta_bancaria_id: null,
              data_vencimento: null,
            },
          ],
        }),
      ),
    ).toEqual(["aprovado", "a_pagar"]);
    // Status literal a_pagar sem parcela aberta não casa "A pagar".
    expect(status.chave(linha({ status: "a_pagar" }))).toEqual([null, null]);
  });

  it("atraso sai das parcelas em aberto", () => {
    const { atraso } = facetasDaListagem(BASE, false, HOJE);
    const parcela = (status: string, data: string) => ({
      status,
      conta_bancaria_id: null,
      data_vencimento: data,
    });
    expect(
      atraso.chave(
        linha({ lancamento_parcelas: [parcela("pendente", "2026-09-01")] }),
      ),
    ).toBe("vencido");
    expect(
      atraso.chave(
        linha({ lancamento_parcelas: [parcela("pendente", "2026-12-01")] }),
      ),
    ).toBe("a_vencer");
    expect(
      atraso.chave(
        linha({ lancamento_parcelas: [parcela("pago", "2026-09-01")] }),
      ),
    ).toBeNull();
  });

  it("revisão segue as duas sondas do embed", () => {
    const p = (status: string, conta: string | null) => ({
      status,
      conta_bancaria_id: conta,
      data_vencimento: null,
    });
    expect(
      revisoesDaLinha(linha({ lancamento_parcelas: [p("pago", null)] })),
    ).toEqual(["revisado"]);
    expect(
      revisoesDaLinha(linha({ lancamento_parcelas: [p("pendente", null)] })),
    ).toEqual(["nao_revisado", "sem_conta"]);
    expect(
      revisoesDaLinha(
        linha({
          lancamento_parcelas: [p("pendente", null), p("pendente", "c")],
        }),
      ),
    ).toEqual(["nao_revisado", "parcial"]);
    // A receber só conhece "em revisão".
    expect(
      revisoesDaLinha(
        linha({
          tipo: "a_receber",
          lancamento_parcelas: [p("em_revisao", null)],
        }),
      ),
    ).toEqual(["em_revisao"]);
  });

  it("etapa solta só o segundo campo e oferece o 'sem etapa' da raiz", () => {
    const filtros: FiltrosLancamentos = {
      ...BASE,
      centroCustoIds: ["etapa-1"],
    };
    expect(filtrosSemFaceta(filtros, "etapa", ["raiz"]).centroCustoIds).toEqual(
      ["raiz"],
    );
    const { etapa } = facetasDaListagem(filtros, true, HOJE);
    expect(
      etapa.chave(linha({ lancamento_rateios: [{ centro_custo_id: "raiz" }] })),
    ).toContain(valorSemEtapa("raiz"));
  });

  it("sobe o centro do rateio até a raiz", () => {
    const centros = [
      { id: "raiz", paiId: null },
      { id: "etapa-1", paiId: "raiz" },
      { id: "outra", paiId: null },
    ];
    expect([...raizesPresentes(centros, ["etapa-1", "outra"])].sort()).toEqual([
      "outra",
      "raiz",
    ]);
  });
});
