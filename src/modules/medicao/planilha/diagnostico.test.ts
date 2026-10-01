import { describe, expect, it } from "vitest";

import { diagnosticarValores } from "./diagnostico";
import type { LinhaImportada } from "./montagem";

function serv(ordem: number, codigo: string, preco: string, qtd: string, valorPlanilha: string | null): LinhaImportada {
  return { ordem, linhaOrigem: ordem + 4, codigo, paiOrdem: null, descricao: codigo, unidade: "un", tipo: "servico",
           precoUnitario: preco, quantidadePrevista: qtd, valorPlanilha };
}

describe("diagnosticarValores", () => {
  it("classifica cada linha pela forma como a planilha chegou no valor", () => {
    const d = diagnosticarValores([
      serv(1, "01.01", "0.335", "3", "1.01"),        // arredondado a 2 casas
      serv(2, "01.02", "0.335", "3", "1.005"),       // exato (sem arredondar)
      serv(3, "01.03", "100", "1", "100"),           // tanto faz
      serv(4, "01.04", "580.86", "17057.717", "9908218.84"), // não fecha com o preço exibido
    ]);
    expect(d).toMatchObject({ comValor: 4, arredondado: 1, exato: 1, indistinto: 1 });
    expect(d?.diverge).toEqual([{ ordem: 4, codigo: "01.04", classe: "diverge", exato: "9908145.49662", arredondado: "9908145.5", planilha: "9908218.84" }]);
  });

  it("valor da planilha com ruído de double conta como indistinto quando q x p já tem até 2 casas", () => {
    const d = diagnosticarValores([serv(1, "01", "0.1", "3", "0.30000000000000004")]);
    expect(d).toMatchObject({ indistinto: 1, diverge: [] });
  });

  it("valor da planilha com ruído de double conta como exato quando q x p tem mais de 2 casas", () => {
    const d = diagnosticarValores([serv(1, "01", "0.1", "0.11", "0.011000000000000001")]);
    expect(d).toMatchObject({ exato: 1, indistinto: 0, diverge: [] });
  });

  it("classifica como truncado quando a planilha tem TRUNCAR(q x p, 2)", () => {
    const d = diagnosticarValores([
      serv(1, "01", "55.12", "328.06", "18082.66"),  // 18082.6672: trunca 66, arredonda 67
      serv(2, "02", "1", "1.025", "1.02"),           // 1.025: trunca 1.02, arredonda 1.03
    ]);
    expect(d).toMatchObject({ comValor: 2, truncado: 2, arredondado: 0, exato: 0, indistinto: 0, diverge: [] });
  });

  it("arredondado continua arredondado quando difere do truncado", () => {
    const d = diagnosticarValores([serv(1, "01", "55.12", "328.06", "18082.67")]);
    expect(d).toMatchObject({ arredondado: 1, truncado: 0 });
  });

  it("valor que bate com truncado e arredondado ao mesmo tempo é indistinto", () => {
    const d = diagnosticarValores([serv(1, "01", "1", "1.0123", "1.01")]); // trunc = round = 1.01
    expect(d).toMatchObject({ indistinto: 1, truncado: 0, arredondado: 0, diverge: [] });
  });

  it("sem coluna de valor não há diagnóstico", () => {
    expect(diagnosticarValores([serv(1, "01", "1", "1", null)])).toBeNull();
  });
});
