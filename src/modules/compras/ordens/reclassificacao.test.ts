import { describe, expect, it } from "vitest";

import {
  reclassificacoesPendentes,
  type GrupoForm,
} from "@/modules/compras/ordens/form-mapeamento";

/**
 * O que o salvamento da OC vai mudar no CADASTRO dos insumos.
 *
 * Desde 28/08/2026 a coluna da OC edita a SUBCATEGORIA do insumo, não a categoria
 * de custo: a categoria de custo saiu do insumo e é da subcategoria. Esta conta
 * decide se o aviso aparece e o que o diálogo lista -- e ela tem que mostrar as
 * DUAS pontas, porque quem troca subcategoria pode estar mexendo no DRE sem
 * perceber.
 *
 * Errar para menos é reclassificar sem avisar; errar para mais é assustar quem não
 * mudou nada e mandar ao banco uma reclassificação que não é mudança.
 */

const CENTRO_A = "33333333-3333-4333-8333-333333333333";
const CENTRO_B = "44444444-4444-4444-8444-444444444444";
const MUNHAO = "55555555-5555-4555-8555-555555555555";
const BRITA = "66666666-6666-4666-8666-666666666666";

const PECAS = "11111111-1111-4111-8111-111111111111";
const HIDRAULICA = "22222222-2222-4222-8222-222222222222";
const ELETRICA = "77777777-7777-4777-8777-777777777777";
const SEM_CUSTO = "88888888-8888-4888-8888-888888888888";

/**
 * Hidráulica e Elétrica caem na MESMA categoria de custo: é o caso real (as duas
 * são "Materiais de construção" no banco), e é ele que prova que o aviso não pode
 * inventar um de/para de DRE onde o DRE não muda.
 */
const SUBCATEGORIAS = [
  { id: PECAS, nome: "Peças e componentes", categoriaCustoNome: "Manutenção de equipamentos" },
  { id: HIDRAULICA, nome: "Hidráulica", categoriaCustoNome: "Materiais de construção" },
  { id: ELETRICA, nome: "Elétrica", categoriaCustoNome: "Materiais de construção" },
  { id: SEM_CUSTO, nome: "Betuminoso", categoriaCustoNome: null },
];

const CATALOGO = [
  {
    id: MUNHAO,
    nome: "MUNHÃO",
    subcategoriaId: PECAS,
    subcategoriaNome: "Peças e componentes",
    categoriaCustoNome: "Manutenção de equipamentos",
  },
  {
    id: BRITA,
    nome: "BRITA 1",
    subcategoriaId: HIDRAULICA,
    subcategoriaNome: "Hidráulica",
    categoriaCustoNome: "Materiais de construção",
  },
];

function linha(insumoId: string, subcategoriaId: string) {
  return { insumoId, quantidade: "1", precoUnitario: "100", subcategoriaId };
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
      [grupo(CENTRO_A, [linha(MUNHAO, PECAS)])],
      CATALOGO,
      SUBCATEGORIAS,
    );

    expect(r).toEqual([]);
  });

  it("subcategoria trocada gera o de/para dela E o do custo", () => {
    const r = reclassificacoesPendentes(
      [grupo(CENTRO_A, [linha(MUNHAO, HIDRAULICA)])],
      CATALOGO,
      SUBCATEGORIAS,
    );

    expect(r).toEqual([
      {
        insumoId: MUNHAO,
        insumoNome: "MUNHÃO",
        subcategoriaId: HIDRAULICA,
        subcategoriaNome: "Hidráulica",
        subcategoriaAnteriorId: PECAS,
        subcategoriaAnteriorNome: "Peças e componentes",
        categoriaCustoNome: "Materiais de construção",
        categoriaCustoAnteriorNome: "Manutenção de equipamentos",
      },
    ]);
  });

  /**
   * Duas subcategorias diferentes com a MESMA categoria de custo: a pendência
   * existe (o cadastro do insumo muda), mas o DRE não se move. O aviso usa
   * justamente a igualdade dos dois lados para não desenhar um de/para de
   * dinheiro que não aconteceu.
   */
  it("trocar entre subcategorias do mesmo custo mantém o custo dos dois lados", () => {
    const r = reclassificacoesPendentes(
      [grupo(CENTRO_A, [linha(BRITA, ELETRICA)])],
      CATALOGO,
      SUBCATEGORIAS,
    );

    expect(r).toHaveLength(1);
    expect(r[0]?.subcategoriaNome).toBe("Elétrica");
    expect(r[0]?.categoriaCustoNome).toBe("Materiais de construção");
    expect(r[0]?.categoriaCustoAnteriorNome).toBe("Materiais de construção");
  });

  it("subcategoria sem categoria de custo aparece com o custo nulo", () => {
    const r = reclassificacoesPendentes(
      [grupo(CENTRO_A, [linha(MUNHAO, SEM_CUSTO)])],
      CATALOGO,
      SUBCATEGORIAS,
    );

    expect(r[0]?.categoriaCustoNome).toBeNull();
  });

  /**
   * Célula vazia é a linha que ainda não escolheu insumo. Se gerasse pendência, o
   * salvamento tentaria gravar subcategoria vazia num campo NOT NULL.
   */
  it("célula vazia nunca reclassifica", () => {
    const r = reclassificacoesPendentes(
      [grupo(CENTRO_A, [linha(MUNHAO, "")])],
      CATALOGO,
      SUBCATEGORIAS,
    );

    expect(r).toEqual([]);
  });

  /**
   * O mesmo insumo em dois centros de custo da mesma ordem é UM cadastro. Duas
   * pendências mandariam duas chamadas ao banco, e a segunda seria recusada por
   * conflito de "anterior" -- causado pela primeira.
   */
  it("mesmo insumo em dois centros gera UMA pendência", () => {
    const r = reclassificacoesPendentes(
      [
        grupo(CENTRO_A, [linha(MUNHAO, HIDRAULICA)]),
        grupo(CENTRO_B, [linha(MUNHAO, HIDRAULICA)]),
      ],
      CATALOGO,
      SUBCATEGORIAS,
    );

    expect(r).toHaveLength(1);
    expect(r[0]?.insumoId).toBe(MUNHAO);
  });

  it("dois insumos trocados geram duas pendências", () => {
    const r = reclassificacoesPendentes(
      [grupo(CENTRO_A, [linha(MUNHAO, HIDRAULICA), linha(BRITA, PECAS)])],
      CATALOGO,
      SUBCATEGORIAS,
    );

    expect(r.map((p) => p.insumoNome)).toEqual(["MUNHÃO", "BRITA 1"]);
  });

  /**
   * Insumo fora do catálogo carregado (inativo, por exemplo): sem a foto do
   * "antes" não há como afirmar que mudou. Reclassificar no escuro é o que o
   * parâmetro de anterior existe para impedir.
   */
  it("insumo que não está no catálogo é ignorado", () => {
    const r = reclassificacoesPendentes(
      [grupo(CENTRO_A, [linha("99999999-9999-4999-8999-999999999999", PECAS)])],
      CATALOGO,
      SUBCATEGORIAS,
    );

    expect(r).toEqual([]);
  });

  it("linha sem insumo escolhido é ignorada", () => {
    const r = reclassificacoesPendentes(
      [
        grupo(CENTRO_A, [
          { insumoId: "", quantidade: "", precoUnitario: "", subcategoriaId: PECAS },
        ]),
      ],
      CATALOGO,
      SUBCATEGORIAS,
    );

    expect(r).toEqual([]);
  });
});
