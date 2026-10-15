import { describe, expect, it } from "vitest";

import { formatarBRL, formatarData } from "@/lib/formatadores";
import {
  classeDaConta,
  fraseDaPosicao,
  resumoDaPosicao,
  situacaoDoExtrato,
  type ConferenciaExtrato,
  type ContaNaPosicao,
} from "@/modules/financeiro/relatorios/posicao-bancaria";

/** O extrato de uma conta que bate e não tem nada depois. */
function emDia(saldo: number, data = "2026-10-15"): ConferenciaExtrato {
  return {
    data,
    saldoExtrato: saldo,
    movimentoDepois: 0,
    lancamentosDepois: 0,
    saldoNaData: saldo,
    diferencaNaData: 0,
  };
}

/** As contas de 15/10/2026, medidas no banco como o Tiago. */
const CONTAS: ContaNaPosicao[] = [
  { nome: "CAIXINHA DE DINHEIRO", tipo: "caixa", saldoAtual: 0, extrato: null },
  {
    nome: "BANCO DO BRASIL 102.124-9",
    tipo: "corrente",
    saldoAtual: -44_714.58,
    extrato: emDia(-44_714.58),
  },
  {
    // A transferência de 13/10 entrou no sistema; o OFX de 08/10 ainda diz 0,00.
    nome: "BANCO DO BRASIL 30.893-5",
    tipo: "corrente",
    saldoAtual: -640_000,
    extrato: {
      data: "2026-10-08",
      saldoExtrato: 0,
      movimentoDepois: -640_000,
      lancamentosDepois: 3,
      saldoNaData: 0,
      diferencaNaData: 0,
    },
  },
  {
    nome: "CAIXA ECONOMICA 578367973-5",
    tipo: "corrente",
    saldoAtual: -5_763,
    extrato: emDia(-5_763),
  },
  { nome: "BB 102 · INVESTIMENTOS", tipo: "investimento", saldoAtual: 124_961.98, extrato: null },
  { nome: "BB 30.893 · INVESTIMENTOS", tipo: "investimento", saldoAtual: 4_646_006.53, extrato: null },
  { nome: "CAIXA · INVESTIMENTOS", tipo: "investimento", saldoAtual: 5_812_124.89, extrato: null },
];

describe("classeDaConta", () => {
  it("subconta e poupança são aplicado; corrente e caixa, disponível", () => {
    expect(classeDaConta("investimento")).toBe("aplicado");
    expect(classeDaConta("poupanca")).toBe("aplicado");
    expect(classeDaConta("corrente")).toBe("disponivel");
    expect(classeDaConta("caixa")).toBe("disponivel");
  });
});

describe("situacaoDoExtrato", () => {
  it("movimento depois do extrato é atrasado, mesmo batendo na data", () => {
    expect(situacaoDoExtrato("corrente", CONTAS[2].extrato)).toBe("atrasado");
  });

  it("diferença na data vence o atraso: é lançamento faltando, não extrato", () => {
    expect(
      situacaoDoExtrato("corrente", {
        ...CONTAS[2].extrato!,
        saldoNaData: 10,
        diferencaNaData: 10,
      }),
    ).toBe("divergente");
  });

  it("um centavo de diferença já é divergente", () => {
    expect(
      situacaoDoExtrato("corrente", { ...emDia(100), diferencaNaData: 0.01 }),
    ).toBe("divergente");
  });

  it("movimento depois que soma zero (vai e volta) não é atraso", () => {
    expect(
      situacaoDoExtrato("corrente", { ...emDia(100), lancamentosDepois: 2 }),
    ).toBe("em_dia");
  });

  it("sem extrato: corrente cobra, caixa e subconta não", () => {
    expect(situacaoDoExtrato("corrente", null)).toBe("sem_extrato");
    expect(situacaoDoExtrato("caixa", null)).toBe("nao_se_aplica");
    expect(situacaoDoExtrato("investimento", null)).toBe("nao_se_aplica");
  });
});

describe("resumoDaPosicao", () => {
  const resumo = resumoDaPosicao(CONTAS);

  it("separa o disponível do aplicado, com a mesma conta de 15/10", () => {
    expect(resumo.disponivel).toBe(-690_477.58);
    expect(resumo.aplicado).toBe(10_583_093.4);
    // Linha de controle: o total de antes (9,89 mi) continua sendo a soma.
    expect(resumo.total).toBe(9_892_615.82);
    expect(resumo.contasDisponiveis).toBe(4);
    expect(resumo.contasAplicadas).toBe(3);
  });

  it("só a BB 30.893-5 fica a conferir", () => {
    expect(resumo.aConferir.map((c) => [c.nome, c.situacao])).toEqual([
      ["BANCO DO BRASIL 30.893-5", "atrasado"],
    ]);
  });

  it("a frase diz quanto há, onde está e o que conferir", () => {
    const frase = fraseDaPosicao(resumo, formatarBRL, formatarData);
    expect(frase).toContain(formatarBRL(9_892_615.82));
    expect(frase).toContain(formatarBRL(-690_477.58));
    expect(frase).toContain("pagar exige resgatar");
    expect(frase).toContain(
      `BANCO DO BRASIL 30.893-5 tem ${formatarBRL(-640_000)} lançados depois do extrato de 08/10/2026`,
    );
    expect(frase).toContain("Importar o extrato");
  });

  it("disponível positivo não pede resgate", () => {
    const frase = fraseDaPosicao(
      resumoDaPosicao([{ ...CONTAS[1], saldoAtual: 5_000, extrato: emDia(5_000) }, CONTAS[4]]),
      formatarBRL,
      formatarData,
    );
    expect(frase).not.toContain("pagar exige resgatar");
  });

  it("tudo batendo, a frase diz isso", () => {
    const frase = fraseDaPosicao(
      resumoDaPosicao([CONTAS[1], CONTAS[3], CONTAS[4]]),
      formatarBRL,
      formatarData,
    );
    expect(frase).toContain("Todas as contas com extrato batem com o banco");
    expect(frase).not.toContain("A conferir");
  });
});
