import { describe, expect, it } from "vitest";

import { formatarBRL } from "@/lib/formatadores";

import {
  abertoPorPrazo,
  diasAteVencer,
  somarAberto,
  type ParcelaParaPrazo,
} from "@/modules/financeiro/_shared/prazo";

const HOJE = "2026-08-14";

function parcela(p: Partial<ParcelaParaPrazo>): ParcelaParaPrazo {
  return { status: "pendente", valor: 100, dataVencimento: "2026-09-30", ...p };
}

describe("diasAteVencer", () => {
  it("conta zero no dia do vencimento", () => {
    expect(diasAteVencer(HOJE, HOJE)).toBe(0);
  });

  it("negativo quando já venceu", () => {
    expect(diasAteVencer("2026-08-13", HOJE)).toBe(-1);
  });

  it("atravessa mês e ano sem tropeçar", () => {
    expect(diasAteVencer("2026-09-14", HOJE)).toBe(31);
    expect(diasAteVencer("2027-08-14", HOJE)).toBe(365);
  });
});

/**
 * O cartão "A pagar" do extrato somava o valor do DOCUMENTO com os pagos dentro:
 * no fornecedor EMAM dava R$ 2,32 mi quando o aberto real era R$ 271 mil, com 12
 * dos 16 lançamentos já pagos. Estes casos travam a regra certa.
 */
describe("abertoPorPrazo", () => {
  it("ignora parcela paga e cancelada", () => {
    const aberto = abertoPorPrazo(
      [
        parcela({ status: "pago", valor: 1000 }),
        parcela({ status: "cancelado", valor: 500 }),
        parcela({ status: "pendente", valor: 200 }),
      ],
      HOJE,
    );

    expect(aberto.total).toBe(200);
  });

  it("parcela em revisão continua em aberto", () => {
    // `em_revisao` é pedido de ajuste, não baixa: o dinheiro continua devido.
    const aberto = abertoPorPrazo(
      [parcela({ status: "em_revisao", valor: 300 })],
      HOJE,
    );
    expect(aberto.total).toBe(300);
  });

  it("separa as quatro faixas pelo prazo", () => {
    const aberto = abertoPorPrazo(
      [
        parcela({ valor: 10, dataVencimento: "2026-08-01" }), // vencido
        parcela({ valor: 20, dataVencimento: HOJE }), // vence hoje: até 7
        parcela({ valor: 30, dataVencimento: "2026-08-21" }), // 7 dias exatos
        parcela({ valor: 40, dataVencimento: "2026-08-22" }), // 8 dias
        parcela({ valor: 50, dataVencimento: "2026-09-13" }), // 30 dias exatos
        parcela({ valor: 60, dataVencimento: "2026-09-14" }), // 31 dias
      ],
      HOJE,
    );

    expect(aberto.vencido).toBe(10);
    expect(aberto.ate7).toBe(50); // 20 + 30
    expect(aberto.de8a30).toBe(90); // 40 + 50
    expect(aberto.mais30).toBe(60);
  });

  it("as quatro faixas somam exatamente o total", () => {
    // A invariante que impede dinheiro de sumir da tela: se uma faixa não cobre
    // um caso, o usuário não tem como perceber a falta.
    const aberto = abertoPorPrazo(
      [
        parcela({ valor: 11.11, dataVencimento: "2026-01-01" }),
        parcela({ valor: 22.22, dataVencimento: "2026-08-16" }),
        parcela({ valor: 33.33, dataVencimento: "2026-09-01" }),
        parcela({ valor: 44.44, dataVencimento: "2027-01-01" }),
        parcela({ valor: 55.55, dataVencimento: null }),
        parcela({ status: "pago", valor: 999, dataVencimento: "2026-08-16" }),
      ],
      HOJE,
    );

    // Comparação em CENTAVOS, que é como este projeto compara dinheiro. Somar os
    // quatro floats em reais dá 166.64999999999998: o resto binário volta na
    // soma, mesmo com cada faixa individualmente exata. Na tela isso não aparece
    // (cada cartão é formatado em 2 casas), mas o teste tem que asserir a
    // invariante de verdade, não a aritmética de float.
    const cent = (valor: number) => Math.round(valor * 100);
    const soma =
      cent(aberto.vencido) +
      cent(aberto.ate7) +
      cent(aberto.de8a30) +
      cent(aberto.mais30);
    expect(soma).toBe(cent(aberto.total));
    expect(aberto.total).toBe(166.65);
    // E o que o usuário lê também tem que fechar.
    expect(formatarBRL(aberto.total)).toBe(formatarBRL(soma / 100));
  });

  it("parcela sem vencimento vai para mais de 30 dias, não desaparece", () => {
    const aberto = abertoPorPrazo(
      [parcela({ valor: 70, dataVencimento: null })],
      HOJE,
    );
    expect(aberto.mais30).toBe(70);
    expect(aberto.total).toBe(70);
  });

  it("sem parcela nenhuma zera tudo", () => {
    const aberto = abertoPorPrazo([], HOJE);
    expect(aberto).toEqual({
      total: 0,
      vencido: 0,
      ate7: 0,
      de8a30: 0,
      mais30: 0,
    });
  });

  it("soma em centavos, sem resto binário", () => {
    const aberto = abertoPorPrazo(
      [
        parcela({ valor: 0.1, dataVencimento: "2026-08-16" }),
        parcela({ valor: 0.2, dataVencimento: "2026-08-16" }),
      ],
      HOJE,
    );
    expect(aberto.ate7).toBe(0.3);
  });
});

describe("somarAberto", () => {
  it("soma faixa por faixa", () => {
    const a = abertoPorPrazo(
      [parcela({ valor: 100, dataVencimento: "2026-08-01" })],
      HOJE,
    );
    const b = abertoPorPrazo(
      [parcela({ valor: 250, dataVencimento: "2026-08-16" })],
      HOJE,
    );

    const soma = somarAberto([a, b]);
    expect(soma.total).toBe(350);
    expect(soma.vencido).toBe(100);
    expect(soma.ate7).toBe(250);
  });

  it("lista vazia devolve tudo zero", () => {
    expect(somarAberto([]).total).toBe(0);
  });

  it("mantém o centavo somando 3.000 linhas quebradas", () => {
    const linhas = Array.from({ length: 3000 }, () =>
      abertoPorPrazo(
        [parcela({ valor: 10.01, dataVencimento: "2026-08-16" })],
        HOJE,
      ),
    );
    expect(somarAberto(linhas).total).toBe(30_030);
  });
});
