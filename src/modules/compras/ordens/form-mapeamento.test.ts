import { describe, expect, it } from "vitest";

import { totalEmCentavos } from "@/modules/compras/ordens/calculo";
import {
  achatarGruposEmItens,
  agruparItensPorCentroCusto,
  formasDoFormulario,
  type ItemPlano,
} from "@/modules/compras/ordens/form-mapeamento";
import {
  ajustesDoForm,
  ordemCompraSchema,
} from "@/modules/compras/ordens/schemas";

const INS_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INS_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const INS_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CC_1 = "11111111-1111-4111-8111-111111111111";
const CC_2 = "22222222-2222-4222-8222-222222222222";

describe("agruparItensPorCentroCusto", () => {
  it("agrupa vários insumos no mesmo centro de custo", () => {
    const grupos = agruparItensPorCentroCusto([
      { insumoId: INS_A, quantidade: 10, precoUnitario: 32, centroCustoId: CC_1 },
      { insumoId: INS_B, quantidade: 5, precoUnitario: 80, centroCustoId: CC_1 },
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].centroCustoId).toBe(CC_1);
    expect(grupos[0].insumos.map((i) => i.insumoId)).toEqual([INS_A, INS_B]);
  });

  it("cria um grupo por centro de custo, na ordem de aparição", () => {
    const grupos = agruparItensPorCentroCusto([
      { insumoId: INS_A, quantidade: 1, precoUnitario: 1, centroCustoId: CC_2 },
      { insumoId: INS_B, quantidade: 1, precoUnitario: 1, centroCustoId: CC_1 },
    ]);
    expect(grupos.map((g) => g.centroCustoId)).toEqual([CC_2, CC_1]);
  });

  it("converte quantidade/preço para string com vírgula", () => {
    const grupos = agruparItensPorCentroCusto([
      {
        insumoId: INS_A,
        quantidade: 1.5,
        precoUnitario: 1234.5,
        centroCustoId: CC_1,
      },
    ]);
    expect(grupos[0].insumos[0].quantidade).toBe("1,5");
    expect(grupos[0].insumos[0].precoUnitario).toBe("1234,5");
  });

  it("lista vazia vira nenhum grupo", () => {
    expect(agruparItensPorCentroCusto([])).toEqual([]);
  });
});

describe("achatarGruposEmItens", () => {
  it("achata herdando o centro de custo e coerindo os números", () => {
    const itens = achatarGruposEmItens([
      {
        centroCustoId: CC_1,
        insumos: [
          { insumoId: INS_A, quantidade: "10", precoUnitario: "32,50" },
          { insumoId: INS_B, quantidade: "5", precoUnitario: "80" },
        ],
      },
      {
        centroCustoId: CC_2,
        insumos: [
          { insumoId: INS_C, quantidade: "2,5", precoUnitario: "1.234,00" },
        ],
      },
    ]);
    expect(itens).toEqual([
      { insumoId: INS_A, quantidade: 10, precoUnitario: 32.5, centroCustoId: CC_1 },
      { insumoId: INS_B, quantidade: 5, precoUnitario: 80, centroCustoId: CC_1 },
      { insumoId: INS_C, quantidade: 2.5, precoUnitario: 1234, centroCustoId: CC_2 },
    ]);
  });
});

describe("round-trip achatar(agrupar(itens))", () => {
  it("preserva cada tupla insumo/centro/quantidade/preço", () => {
    const itens: ItemPlano[] = [
      { insumoId: INS_A, quantidade: 10, precoUnitario: 32.5, centroCustoId: CC_1 },
      { insumoId: INS_B, quantidade: 5, precoUnitario: 80, centroCustoId: CC_1 },
      { insumoId: INS_C, quantidade: 2, precoUnitario: 3.5, centroCustoId: CC_2 },
    ];
    expect(achatarGruposEmItens(agruparItensPorCentroCusto(itens))).toEqual(itens);
  });
});

describe("formasDoFormulario", () => {
  /** Um formulario minimo: 100 unidades a R$ 50,00 = R$ 5.000,00 num centro. */
  function formulario(
    ajustes: {
      frete?: string;
      outrasDespesas?: string;
      impostos?: string;
      desconto?: string;
    },
    formas: { formaPagamentoId: string; valor: string }[],
  ) {
    return {
      formas,
      centrosCusto: [
        {
          centroCustoId: CC_1,
          insumos: [
            { insumoId: INS_A, quantidade: "100", precoUnitario: "50,00" },
          ],
        },
      ],
      ...ajustes,
    };
  }

  const FORMA = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const FORMA_2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

  it("com UMA forma, ela leva o total da ordem COM os ajustes", () => {
    // Era este o defeito: a forma unica levava a soma dos itens (R$ 5.000,00) e o
    // servidor conferia contra o total da ordem, entao toda ordem com desconto ou
    // outras despesas paga por uma forma so era recusada no salvamento.
    const formas = formasDoFormulario(
      formulario({ outrasDespesas: "1.000,00", desconto: "174,94" }, [
        { formaPagamentoId: FORMA, valor: "" },
      ]),
    );
    expect(formas).toEqual([{ formaPagamentoId: FORMA, valor: 5825.06 }]);
  });

  it("CONTROLE: sem ajuste nenhum, a forma unica leva a soma dos itens", () => {
    // Se este caso mudasse, a correcao teria quebrado a ordem simples, que e a
    // maioria delas.
    const formas = formasDoFormulario(
      formulario({}, [{ formaPagamentoId: FORMA, valor: "" }]),
    );
    expect(formas).toEqual([{ formaPagamentoId: FORMA, valor: 5000 }]);
  });

  it("a soma das formas fecha com a MESMA conta que o servidor confere", () => {
    // A amarra que torna o defeito impossivel de voltar: o servidor recusa quando
    // `soma das formas !== totalEmCentavos(itens, ajustes)`. A assercao e contra
    // essa expressao, nao contra um numero escrito a mao.
    const form = formulario(
      {
        frete: "300,00",
        outrasDespesas: "1.000,00",
        impostos: "50,00",
        desconto: "174,94",
      },
      [{ formaPagamentoId: FORMA, valor: "" }],
    );
    const somaFormas = formasDoFormulario(form).reduce(
      (soma, forma) => soma + Math.round(forma.valor * 100),
      0,
    );
    const itens = achatarGruposEmItens(form.centrosCusto);
    const totalDoServidor = totalEmCentavos(itens, ajustesDoForm(form));
    expect(somaFormas).toBe(totalDoServidor);

    // LINHA DE CONTROLE: o total so dos itens TEM que ser diferente do total da
    // ordem neste caso. Sem ela, a assercao acima passaria mesmo com o defeito.
    const totalSoDosItens = totalEmCentavos(itens, {
      frete: 0,
      outrasDespesas: 0,
      impostos: 0,
      desconto: 0,
    });
    expect(totalSoDosItens).not.toBe(totalDoServidor);
  });

  it("com DUAS formas, cada uma leva o valor digitado", () => {
    const formas = formasDoFormulario(
      formulario({ desconto: "100,00" }, [
        { formaPagamentoId: FORMA, valor: "2.000,00" },
        { formaPagamentoId: FORMA_2, valor: "2.900,00" },
      ]),
    );
    expect(formas).toEqual([
      { formaPagamentoId: FORMA, valor: 2000 },
      { formaPagamentoId: FORMA_2, valor: 2900 },
    ]);
  });

  it("desconto maior que a ordem devolve valor negativo, sem mascarar", () => {
    // Quem recusa e o schema, com a mensagem que fala do desconto. Se esta funcao
    // fizesse `Math.max(0, ...)`, a soma passaria a fechar com um total que nao
    // existe e o erro apareceria longe da causa.
    const formas = formasDoFormulario(
      formulario({ desconto: "6.000,00" }, [
        { formaPagamentoId: FORMA, valor: "" },
      ]),
    );
    expect(formas[0]!.valor).toBeLessThan(0);
  });
});

describe("o payload da tela passa pelo schema do SERVIDOR", () => {
  const FORMA = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const OUTRO_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  /**
   * Monta o payload como `aoEnviar` monta, para o caso que estava quebrado:
   * ordem com desconto e outras despesas, paga por UMA forma.
   *
   * Este teste existe porque o defeito nao aparecia em nenhuma camada isolada. O
   * formulario validava certo (o refine do client sempre contou os ajustes), a
   * conta do rodape estava certa, e o schema do servidor estava certo -- o que
   * estava errado era a PONTE entre eles. Testar as pontas separadas deixou o
   * furo passar; o que pega e submeter o payload inteiro ao juiz que recusou.
   */
  function payload(formasDoForm: { formaPagamentoId: string; valor: string }[]) {
    const form = {
      formas: formasDoForm,
      centrosCusto: [
        {
          centroCustoId: CC_1,
          insumos: [
            { insumoId: INS_A, quantidade: "100", precoUnitario: "50,00" },
          ],
        },
      ],
      frete: "",
      outrasDespesas: "1.000,00",
      impostos: "",
      desconto: "174,94",
    };
    return {
      fornecedorId: OUTRO_ID,
      condicaoPagamentoId: OUTRO_ID,
      formaPagamentoId: formasDoForm[0]!.formaPagamentoId,
      dataCompra: "2026-08-25",
      mesCompetencia: "2026-08-01",
      descricao: "Ordem com desconto paga por uma forma so",
      categoriaId: OUTRO_ID,
      numeroDocumento: "",
      observacoes: "",
      ...ajustesDoForm(form),
      itens: achatarGruposEmItens(form.centrosCusto),
      parcelas: [],
      formas: formasDoFormulario(form),
    };
  }

  it("aceita a ordem com desconto paga por uma forma so", () => {
    const resultado = ordemCompraSchema.safeParse(
      payload([{ formaPagamentoId: FORMA, valor: "" }]),
    );
    expect(resultado.success).toBe(true);
  });

  it("CONTROLE: com a forma levando so o total dos itens, o servidor RECUSA", () => {
    // Reproduz o defeito de proposito. Sem esta linha, o teste acima passaria
    // tambem numa versao em que o servidor tivesse parado de conferir a soma --
    // e ai o teste nao estaria provando nada.
    const errado = payload([{ formaPagamentoId: FORMA, valor: "" }]);
    errado.formas = [{ formaPagamentoId: FORMA, valor: 5000 }];
    const resultado = ordemCompraSchema.safeParse(errado);
    expect(resultado.success).toBe(false);
    const mensagens = resultado.success
      ? []
      : resultado.error.issues.map((problema) => problema.message);
    expect(mensagens).toContain(
      "A soma das formas precisa fechar com o total da ordem",
    );
  });
});
