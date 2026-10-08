import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { aplicarFiltrosOrdens } from "@/modules/compras/ordens/queries";

/** Builder falso: grava cada filtro pedido, na ordem, como o PostgREST receberia. */
function consultaGravada() {
  const chamadas: unknown[][] = [];
  const consulta = new Proxy(
    {},
    {
      get: (_alvo, metodo: string) =>
        (...args: unknown[]) => {
          chamadas.push([metodo, ...args]);
          return consulta;
        },
    },
  ) as Parameters<typeof aplicarFiltrosOrdens>[0];
  return { consulta, chamadas };
}

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("aplicarFiltrosOrdens com mais de uma opção por filtro", () => {
  it("lista vira `in` (status, fornecedor, forma, condição)", () => {
    const { consulta, chamadas } = consultaGravada();
    aplicarFiltrosOrdens(
      consulta,
      {
        status: ["aprovado", "rascunho"],
        fornecedorIds: [A, B],
        formaPagamentoIds: [A],
        condicaoPagamentoIds: [A, B],
      },
      [],
    );
    expect(chamadas).toContainEqual(["in", "status", ["aprovado", "rascunho"]]);
    expect(chamadas).toContainEqual(["in", "fornecedor_id", [A, B]]);
    expect(chamadas).toContainEqual(["in", "forma_pagamento_id", [A]]);
    expect(chamadas).toContainEqual(["in", "condicao_pagamento_id", [A, B]]);
  });

  it("categoria casa a OC que tem QUALQUER uma das escolhidas em algum item", () => {
    const { consulta, chamadas } = consultaGravada();
    aplicarFiltrosOrdens(consulta, { categoriaIds: [A, B] }, []);
    expect(chamadas).toContainEqual(["overlaps", "categoria_ids", [A, B]]);
  });

  it("centro e insumo filtram o item e descartam OC sem item batendo", () => {
    const { consulta, chamadas } = consultaGravada();
    aplicarFiltrosOrdens(
      consulta,
      { centroCustoIds: [A, B], insumoIds: [B] },
      [],
    );
    expect(chamadas).toContainEqual(["in", "oc_itens.centro_custo_id", [A, B]]);
    expect(chamadas).toContainEqual(["in", "oc_itens.insumo_id", [B]]);
    expect(chamadas).toContainEqual(["not", "oc_itens", "is", null]);
  });

  it("lista vazia não filtra nada", () => {
    const { consulta, chamadas } = consultaGravada();
    aplicarFiltrosOrdens(
      consulta,
      { status: [], fornecedorIds: [], nota: [], origem: [], autoria: [] },
      [],
    );
    expect(chamadas).toEqual([]);
  });

  it("nota e origem com as duas opções marcadas é o mesmo que nenhuma", () => {
    const { consulta, chamadas } = consultaGravada();
    aplicarFiltrosOrdens(
      consulta,
      { nota: ["com", "sem"], origem: ["cotacao", "direta"] },
      [],
    );
    expect(chamadas).toEqual([]);
  });

  it("nota e origem com uma opção só recortam como antes", () => {
    const { consulta, chamadas } = consultaGravada();
    aplicarFiltrosOrdens(consulta, { nota: ["sem"], origem: ["cotacao"] }, []);
    expect(chamadas).toContainEqual(["is", "recebimentos", null]);
    expect(chamadas).toContainEqual(["not", "cotacao_id", "is", null]);
  });

  it("autoria 'minhas' filtra por quem está logado", () => {
    const { consulta, chamadas } = consultaGravada();
    aplicarFiltrosOrdens(
      consulta,
      { autoria: ["minhas"], usuarioLogadoId: A },
      [],
    );
    expect(chamadas).toContainEqual(["eq", "created_by", A]);
  });
});
