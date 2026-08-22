import { describe, expect, it } from "vitest";

import type { ParcelaAReceber } from "@/modules/financeiro/recebimentos/queries";
import {
  contagemRecebimentos,
  somarParaResumoAReceber,
} from "@/modules/financeiro/recebimentos/resumo";

const HOJE = "2026-08-19";

function parcela(troca: Partial<ParcelaAReceber> = {}): ParcelaAReceber {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    lancamentoId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    lancamentoNumero: "LAN-2026-5912",
    numeroParcela: 1,
    descricao: "Medição 7 da BR-364 lote 4",
    categoriaNome: "Receita de obra",
    centroCustoRotulo: "BR-364 Lote 9",
    numeroDocumento: "MED-07/2026",
    clienteId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    clienteNome: "DNIT",
    contaBancariaId: "55555555-5555-4555-8555-555555555555",
    contaBancariaNome: "Conta movimento - Sicredi",
    dataVencimento: "2026-08-30",
    valor: 1_250_000.5,
    status: "pendente",
    ...troca,
  };
}

describe("somarParaResumoAReceber", () => {
  it("separa vencido de a vencer, e os dois fecham com o total", () => {
    const resumo = somarParaResumoAReceber(
      [
        parcela({ id: "a", dataVencimento: "2026-08-10", valor: 100.25 }),
        parcela({ id: "b", dataVencimento: "2026-08-19", valor: 200.5 }),
        parcela({ id: "c", dataVencimento: "2026-09-01", valor: 300.75 }),
      ],
      HOJE,
    );

    expect(resumo.total).toBeCloseTo(601.5, 2);
    expect(resumo.parcelas).toBe(3);
    // Só a de 10/08 passou. A de hoje (19/08) vence hoje, não venceu.
    expect(resumo.vencido).toBeCloseTo(100.25, 2);
    expect(resumo.vencidas).toBe(1);
    expect(resumo.aVencer).toBeCloseTo(501.25, 2);
    expect(resumo.aVencerParcelas).toBe(2);
    // A prova que importa: as duas metades reconstroem o total. Sem ela, os
    // cards podem estar cada um certo e a tela ainda não fechar.
    expect(resumo.vencido + resumo.aVencer).toBeCloseTo(resumo.total, 2);
    expect(resumo.vencidas + resumo.aVencerParcelas).toBe(resumo.parcelas);
  });

  it("vencimento de hoje não conta como vencido", () => {
    const resumo = somarParaResumoAReceber(
      [parcela({ dataVencimento: HOJE, valor: 999.99 })],
      HOJE,
    );

    expect(resumo.vencido).toBe(0);
    expect(resumo.aVencer).toBeCloseTo(999.99, 2);
  });

  it("parcela sem vencimento conta como a vencer, nunca como vencida", () => {
    const resumo = somarParaResumoAReceber(
      [parcela({ dataVencimento: null, valor: 500 })],
      HOJE,
    );

    expect(resumo.vencido).toBe(0);
    expect(resumo.vencidas).toBe(0);
    expect(resumo.aVencer).toBe(500);
    expect(resumo.aVencerParcelas).toBe(1);
  });

  it("lista vazia zera tudo", () => {
    const resumo = somarParaResumoAReceber([], HOJE);

    expect(resumo).toEqual({
      total: 0,
      parcelas: 0,
      aVencer: 0,
      aVencerParcelas: 0,
      vencido: 0,
      vencidas: 0,
    });
  });

  it("LINHA DE CONTROLE: uma parcela vencida NÃO pode cair em a vencer", () => {
    // Se esta passar com aVencer > 0, a separação está invertida e as duas
    // provas de soma acima continuariam passando.
    const resumo = somarParaResumoAReceber(
      [parcela({ dataVencimento: "2020-01-01", valor: 42 })],
      HOJE,
    );

    expect(resumo.aVencer).toBe(0);
    expect(resumo.vencido).toBe(42);
  });
});

describe("contagemRecebimentos", () => {
  it("usa o singular só no um", () => {
    expect(contagemRecebimentos(0)).toBe("0 recebimentos");
    expect(contagemRecebimentos(1)).toBe("1 recebimento");
    expect(contagemRecebimentos(2)).toBe("2 recebimentos");
  });
});
