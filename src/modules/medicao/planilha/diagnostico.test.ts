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

  it("valor da planilha com ruído de double conta como exato", () => {
    const d = diagnosticarValores([serv(1, "01", "0.1", "3", "0.30000000000000004")]);
    expect(d).toMatchObject({ indistinto: 1, diverge: [] });
  });

  it("sem coluna de valor não há diagnóstico", () => {
    expect(diagnosticarValores([serv(1, "01", "1", "1", null)])).toBeNull();
  });
});
