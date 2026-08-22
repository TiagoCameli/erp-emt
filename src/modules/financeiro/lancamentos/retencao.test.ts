import { describe, expect, it } from "vitest";

import {
  CAMPOS_RETENCAO,
  lancamentoSchema,
  liquidoDeRetencao,
  TOLERANCIA_RETENCAO,
  totalRetencoes,
} from "@/modules/financeiro/lancamentos/schemas";

/** Lançamento a receber válido, para os casos mexerem num campo por vez. */
function aReceber(troca: Record<string, unknown> = {}) {
  return {
    tipo: "a_receber" as const,
    clienteId: "11111111-1111-4111-8111-111111111111",
    contaBancariaId: "22222222-2222-4222-8222-222222222222",
    categoriaId: "33333333-3333-4333-8333-333333333333",
    descricao: "Medição",
    valor: 2935427.53,
    dataCompra: "2026-01-16",
    mesCompetencia: "2025-11-01",
    dataVencimento: "2026-01-30",
    numeroDocumento: "345",
    parcelas: [{ valor: 2935427.53, dataVencimento: "2026-01-30" }],
    rateios: [
      {
        centroCustoId: "44444444-4444-4444-8444-444444444444",
        valor: 2935427.53,
      },
    ],
    formas: [],
    ...troca,
  };
}

/** As retenções da nota 345 do DNIT, como estão impressas nela. */
const NOTA_345 = {
  valorBruto: 3243566.33,
  retencaoIss: 64871.33,
  retencaoPis: 21083.18,
  retencaoCofins: 97306.99,
  retencaoCsll: 32435.66,
  retencaoIr: 38922.79,
  retencaoInss: 53518.84,
};

describe("liquidoDeRetencao", () => {
  it("reproduz o líquido impresso na nota 345", () => {
    // A nota imprime "Valor líquido = R$ 2.935.427,54". Se a conta daqui não der
    // exatamente isso, é o cálculo que está errado, não a nota.
    expect(liquidoDeRetencao(NOTA_345.valorBruto, NOTA_345)).toBe(2935427.54);
  });

  it("sem retenção nenhuma, o líquido é o próprio bruto", () => {
    expect(liquidoDeRetencao(1000, {})).toBe(1000);
  });

  it("arredonda para dois centavos em vez de acumular float", () => {
    // 0,1 + 0,2 em float dá 0,30000000000000004. Sem o arredondamento, o líquido
    // de um documento de centavos quebrados não fecharia com a parcela, e o
    // banco recusaria a soma.
    expect(liquidoDeRetencao(1, { retencaoIss: 0.1, retencaoPis: 0.2 })).toBe(
      0.7,
    );
  });

  it("cobre todas as sete retenções, não só as cinco federais", () => {
    const uma = Object.fromEntries(CAMPOS_RETENCAO.map((c) => [c, 1]));
    expect(liquidoDeRetencao(100, uma)).toBe(93);
    expect(totalRetencoes(uma)).toBe(7);
  });
});

describe("lancamentoSchema: as regras da retenção", () => {
  it("aceita a nota 345 com o crédito real do banco (um centavo abaixo)", () => {
    // O banco creditou R$ 2.935.427,53 e a nota calcula R$ 2.935.427,54. O
    // ERP tem de aceitar o número do EXTRATO, porque é ele que move o saldo.
    const r = lancamentoSchema.safeParse(aReceber({ ...NOTA_345 }));
    expect(r.success).toBe(true);
  });

  it("recusa o erro de R$ 40 mil que existe hoje na base", () => {
    // Caso real: LAN-2026-6286 está R$ 40.021,27 acima do que o banco creditou.
    // É este o erro que a tolerância de um real precisa pegar; se ela passar a
    // ser generosa, este teste cai.
    const r = lancamentoSchema.safeParse(
      aReceber({
        valor: 2403762.75,
        valorBruto: 2576284.98,
        retencaoIss: 19322.14,
        retencaoPis: 16745.85,
        retencaoCofins: 77288.55,
        retencaoCsll: 25762.85,
        retencaoIr: 30915.42,
        retencaoInss: 42809.7,
        parcelas: [{ valor: 2403762.75, dataVencimento: "2026-04-07" }],
        rateios: [
          {
            centroCustoId: "44444444-4444-4444-8444-444444444444",
            valor: 2403762.75,
          },
        ],
      }),
    );
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("não fecha");
  });

  it("aceita diferença de exatamente um real, e recusa um centavo além", () => {
    // A fronteira, nos dois lados: sem este par a tolerância poderia virar 10
    // reais numa refatoração e nenhum teste reclamaria.
    const noLimite = lancamentoSchema.safeParse(
      aReceber({
        valor: 1000,
        valorBruto: 1101,
        retencaoIss: 100,
        parcelas: [{ valor: 1000, dataVencimento: "2026-01-30" }],
        rateios: [
          {
            centroCustoId: "44444444-4444-4444-8444-444444444444",
            valor: 1000,
          },
        ],
      }),
    );
    expect(noLimite.success).toBe(true);

    const passouDoLimite = lancamentoSchema.safeParse(
      aReceber({
        valor: 1000,
        valorBruto: 1101.01,
        retencaoIss: 100,
        parcelas: [{ valor: 1000, dataVencimento: "2026-01-30" }],
        rateios: [
          {
            centroCustoId: "44444444-4444-4444-8444-444444444444",
            valor: 1000,
          },
        ],
      }),
    );
    expect(passouDoLimite.success).toBe(false);
    expect(TOLERANCIA_RETENCAO).toBe(1);
  });

  it("recusa retenção sem valor bruto", () => {
    const r = lancamentoSchema.safeParse(aReceber({ retencaoIss: 100 }));
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("valor bruto");
  });

  it("recusa líquido maior que o bruto", () => {
    const r = lancamentoSchema.safeParse(
      aReceber({ valorBruto: 1000 }),
    );
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("não pode ser maior");
  });

  it("documento sem retenção continua válido, como sempre foi", () => {
    // A esmagadora maioria dos 6.467 lançamentos não tem retenção. Se este caso
    // quebrar, a mudança parou o sistema inteiro para consertar nove notas.
    const r = lancamentoSchema.safeParse(aReceber());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.valorBruto).toBeUndefined();
    }
  });
});
