import { describe, expect, it } from "vitest";

import {
  reclassificacoesPendentes,
  type GrupoForm,
} from "@/modules/compras/ordens/form-mapeamento";

/**
 * O que o salvamento da OC vai mudar no CADASTRO dos insumos.
 *
 * Esta é a conta que decide se o aviso aparece e o que o diálogo lista. Errar
 * para menos é reclassificar sem avisar; errar para mais é assustar quem não
 * mudou nada e, pior, mandar ao banco uma reclassificação que não é mudança.
 */

const MATERIAL = "11111111-1111-4111-8111-111111111111";
const PECAS = "22222222-2222-4222-8222-222222222222";
const CENTRO_A = "33333333-3333-4333-8333-333333333333";
const CENTRO_B = "44444444-4444-4444-8444-444444444444";
const MUNHAO = "55555555-5555-4555-8555-555555555555";
const BRITA = "66666666-6666-4666-8666-666666666666";

const CATEGORIAS = [
  { id: MATERIAL, nome: "Materiais" },
  { id: PECAS, nome: "Peças e manutenção" },
];

const CATALOGO = [
  {
    id: MUNHAO,
    nome: "MUNHÃO",
    categoriaCustoId: MATERIAL,
    categoriaCustoNome: "Materiais",
  },
  {
    id: BRITA,
    nome: "BRITA 1",
    categoriaCustoId: MATERIAL,
    categoriaCustoNome: "Materiais",
  },
];

function linha(insumoId: string, categoriaCustoId: string) {
  return {
    insumoId,
    quantidade: "1",
    precoUnitario: "100",
    categoriaCustoId,
  };
}

function grupo(
  centroCustoId: string,
  insumos: GrupoForm["insumos"],
): GrupoForm {
  return { centroCustoId, insumos };
}

describe("reclassificacoesPendentes", () => {
  it("linha igual ao cadastro não gera nada", () => {
    const r = reclassificacoesPendentes(
      [grupo(CENTRO_A, [linha(MUNHAO, MATERIAL)])],
      CATALOGO,
      CATEGORIAS,
    );

    expect(r).toEqual([]);
  });

  it("categoria trocada gera uma pendência com o de/para", () => {
    const r = reclassificacoesPendentes(
      [grupo(CENTRO_A, [linha(MUNHAO, PECAS)])],
      CATALOGO,
      CATEGORIAS,
    );

    expect(r).toEqual([
      {
        insumoId: MUNHAO,
        insumoNome: "MUNHÃO",
        categoriaId: PECAS,
        categoriaNome: "Peças e manutenção",
        categoriaAnteriorId: MATERIAL,
        categoriaAnteriorNome: "Materiais",
      },
    ]);
  });

  it("insumo que ainda não tinha categoria mostra o anterior como nulo", () => {
    const r = reclassificacoesPendentes(
      [grupo(CENTRO_A, [linha(MUNHAO, PECAS)])],
      [
        {
          id: MUNHAO,
          nome: "MUNHÃO",
          categoriaCustoId: null,
          categoriaCustoNome: null,
        },
      ],
      CATEGORIAS,
    );

    expect(r[0]?.categoriaAnteriorId).toBeNull();
    expect(r[0]?.categoriaAnteriorNome).toBeNull();
  });

  /**
   * Célula vazia é o insumo sem categoria no cadastro, não uma escolha de limpar.
   * Se gerasse pendência, salvar uma ordem em rascunho com item não classificado
   * apagaria a categoria do insumo no cadastro -- e travaria a aprovação de todas
   * as outras ordens que o compram.
   */
  it("célula vazia nunca reclassifica", () => {
    const r = reclassificacoesPendentes(
      [grupo(CENTRO_A, [linha(MUNHAO, "")])],
      CATALOGO,
      CATEGORIAS,
    );

    expect(r).toEqual([]);
  });

  /**
   * O mesmo insumo em dois centros de custo da mesma ordem é UM cadastro. Duas
   * pendências para o mesmo insumo mandariam duas chamadas ao banco, e a segunda
   * seria recusada por conflito de "categoria anterior" -- causada pela primeira.
   */
  it("mesmo insumo em dois centros gera UMA pendência", () => {
    const r = reclassificacoesPendentes(
      [
        grupo(CENTRO_A, [linha(MUNHAO, PECAS)]),
        grupo(CENTRO_B, [linha(MUNHAO, PECAS)]),
      ],
      CATALOGO,
      CATEGORIAS,
    );

    expect(r).toHaveLength(1);
    expect(r[0]?.insumoId).toBe(MUNHAO);
  });

  it("dois insumos trocados geram duas pendências", () => {
    const r = reclassificacoesPendentes(
      [grupo(CENTRO_A, [linha(MUNHAO, PECAS), linha(BRITA, PECAS)])],
      CATALOGO,
      CATEGORIAS,
    );

    expect(r.map((p) => p.insumoNome)).toEqual(["MUNHÃO", "BRITA 1"]);
  });

  /**
   * Insumo fora do catálogo carregado (inativo, por exemplo): sem a foto do
   * "antes" não há como afirmar que mudou. Reclassificar no escuro é justamente o
   * que o `categoriaAnteriorId` existe para impedir.
   */
  it("insumo que não está no catálogo é ignorado", () => {
    const r = reclassificacoesPendentes(
      [grupo(CENTRO_A, [linha("77777777-7777-4777-8777-777777777777", PECAS)])],
      CATALOGO,
      CATEGORIAS,
    );

    expect(r).toEqual([]);
  });

  it("linha sem insumo escolhido é ignorada", () => {
    const r = reclassificacoesPendentes(
      [
        grupo(CENTRO_A, [
          { insumoId: "", quantidade: "", precoUnitario: "", categoriaCustoId: PECAS },
        ]),
      ],
      CATALOGO,
      CATEGORIAS,
    );

    expect(r).toEqual([]);
  });
});
