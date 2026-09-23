import { describe, expect, it } from "vitest";

import { traduzErroMovimento } from "@/modules/combustivel/transferencias/erros";

const FALLBACK = "Não foi possível salvar. Tente novamente";

describe("traduzErroMovimento", () => {
  it("raise exception nosso (P0001) vai para a tela como está", () => {
    const mensagem = "Saldo insuficiente no tanque nessa data: 120,50 L disponíveis";
    expect(traduzErroMovimento({ code: "P0001", message: mensagem }, FALLBACK)).toBe(mensagem);
  });

  it("a trava de saldo negativo (23514 com texto próprio) também vai", () => {
    const mensagem = "O tanque ficaria com saldo negativo em algum momento: confira as datas e os litros";
    expect(traduzErroMovimento({ code: "23514", message: mensagem }, FALLBACK)).toBe(mensagem);
  });

  it("check constraint do Postgres fica no fallback", () => {
    // Linha de controle: mesmo código 23514, texto técnico. Não pode vazar.
    const tecnico = 'new row for relation "combustivel_transferencias" violates check constraint "comb_transf_tanques_diferentes"';
    expect(traduzErroMovimento({ code: "23514", message: tecnico }, FALLBACK)).toBe(FALLBACK);
  });

  it("permissão, RLS e erro sem mensagem ficam no fallback", () => {
    expect(traduzErroMovimento({ code: "42501", message: "permission denied for function" }, FALLBACK)).toBe(FALLBACK);
    expect(traduzErroMovimento({ code: "P0001" }, FALLBACK)).toBe(FALLBACK);
    expect(traduzErroMovimento(null, FALLBACK)).toBe(FALLBACK);
  });
});
