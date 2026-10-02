import { describe, expect, it } from "vitest";

import {
  argsProgramacao,
  programacaoPagamentoSchema,
} from "@/modules/rh/_shared/programacao-pagamento";

// Id da carga (md5::uuid), que o z.uuid() recusaria.
const CONTA = "38673fc5-c55a-c7be-8687-e9b1d3589ef1";

describe("programacaoPagamentoSchema", () => {
  it("aceita conta com data", () => {
    expect(
      programacaoPagamentoSchema.safeParse({ contaId: CONTA, dataProgramada: "2026-10-06" })
        .success,
    ).toBe(true);
  });

  it("aceita conta sem data (paga no vencimento)", () => {
    expect(
      programacaoPagamentoSchema.safeParse({ contaId: CONTA, dataProgramada: null }).success,
    ).toBe(true);
  });

  it("recusa sem conta", () => {
    expect(
      programacaoPagamentoSchema.safeParse({ contaId: "", dataProgramada: null }).success,
    ).toBe(false);
  });

  it("recusa data que não é ISO", () => {
    expect(
      programacaoPagamentoSchema.safeParse({ contaId: CONTA, dataProgramada: "06/10/2026" })
        .success,
    ).toBe(false);
  });
});

describe("argsProgramacao", () => {
  it("não manda a data quando é null, para o default do banco valer", () => {
    expect(argsProgramacao({ contaId: CONTA, dataProgramada: null })).toEqual({
      p_conta_id: CONTA,
    });
  });

  it("manda a data quando escolhida", () => {
    expect(argsProgramacao({ contaId: CONTA, dataProgramada: "2026-10-06" })).toEqual({
      p_conta_id: CONTA,
      p_data_programada: "2026-10-06",
    });
  });
});
