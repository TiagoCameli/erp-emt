import { describe, expect, it } from "vitest";

import {
  transferenciaFormSchema,
  transferenciaSchema,
} from "@/modules/financeiro/transferencias/schemas";

const CONTA_A = "11111111-1111-4111-8111-111111111111";
const CONTA_B = "22222222-2222-4222-8222-222222222222";

function servidor(troca: Record<string, unknown> = {}) {
  return {
    contaOrigemId: CONTA_A,
    contaDestinoId: CONTA_B,
    dataTransferencia: "2026-08-20",
    valor: 1000,
    tarifa: 0,
    ...troca,
  };
}

function formulario(troca: Record<string, unknown> = {}) {
  return {
    contaOrigemId: CONTA_A,
    contaDestinoId: CONTA_B,
    dataTransferencia: "2026-08-20",
    valor: "1000,00",
    tarifa: "",
    descricao: "",
    observacoes: "",
    ...troca,
  };
}

describe("transferenciaSchema (servidor)", () => {
  it("aceita a transferência completa", () => {
    expect(transferenciaSchema.safeParse(servidor()).success).toBe(true);
  });

  /**
   * A mesma trava existe em três lugares: o CHECK da tabela, a RPC e aqui. Só
   * esta produz uma mensagem no campo certo do formulário — as outras duas
   * chegariam como erro cru do Postgres num toast.
   */
  it("recusa origem igual ao destino", () => {
    const resultado = transferenciaSchema.safeParse(
      servidor({ contaDestinoId: CONTA_A }),
    );

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.message).toBe(
        "A conta de destino precisa ser diferente da de origem",
      );
      expect(resultado.error.issues[0]?.path).toEqual(["contaDestinoId"]);
    }
  });

  it("recusa valor zero e valor negativo", () => {
    expect(transferenciaSchema.safeParse(servidor({ valor: 0 })).success).toBe(
      false,
    );
    expect(
      transferenciaSchema.safeParse(servidor({ valor: -10 })).success,
    ).toBe(false);
  });

  /**
   * Tarifa ZERO é o caso normal (PIX e transferência interna não cobram), então
   * ela precisa passar. Só a tarifa NEGATIVA é recusada — ela viraria dinheiro
   * entrando na origem, que é o contrário do que uma tarifa faz.
   */
  it("aceita tarifa zero e recusa tarifa negativa", () => {
    expect(transferenciaSchema.safeParse(servidor({ tarifa: 0 })).success).toBe(
      true,
    );
    expect(
      transferenciaSchema.safeParse(servidor({ tarifa: -1 })).success,
    ).toBe(false);
  });

  it("recusa data fora do formato do banco", () => {
    expect(
      transferenciaSchema.safeParse(
        servidor({ dataTransferencia: "20/08/2026" }),
      ).success,
    ).toBe(false);
  });

  it("recusa conta que não é um id", () => {
    expect(
      transferenciaSchema.safeParse(servidor({ contaOrigemId: "caixa" }))
        .success,
    ).toBe(false);
  });
});

describe("transferenciaFormSchema (cliente)", () => {
  it("aceita o formulário com tarifa e textos vazios", () => {
    expect(transferenciaFormSchema.safeParse(formulario()).success).toBe(true);
  });

  it("recusa origem igual ao destino, apontando o campo do destino", () => {
    const resultado = transferenciaFormSchema.safeParse(
      formulario({ contaDestinoId: CONTA_A }),
    );

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.path).toEqual(["contaDestinoId"]);
    }
  });

  it("exige o valor preenchido", () => {
    expect(
      transferenciaFormSchema.safeParse(formulario({ valor: "" })).success,
    ).toBe(false);
  });

  /**
   * Campo de texto opcional é declarado obrigatório aceitando vazio, nunca
   * `.optional()`: com `.optional()` o input do zod difere do output e o
   * resolver do react-hook-form reclama de um campo que a pessoa nem viu.
   * O teste trava isso — string vazia TEM que passar.
   */
  it("descrição e observações vazias passam", () => {
    const resultado = transferenciaFormSchema.safeParse(
      formulario({ descricao: "", observacoes: "" }),
    );
    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.descricao).toBe("");
      expect(resultado.data.observacoes).toBe("");
    }
  });
});
