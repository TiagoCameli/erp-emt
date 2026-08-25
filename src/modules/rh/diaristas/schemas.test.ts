import { describe, expect, it } from "vitest";

import { fecharSchema } from "@/modules/rh/diaristas/schemas";

/**
 * O fechamento das diárias gera UM lançamento a pagar, e é ele que apareceu na
 * tela do dono sem vencimento, sem forma, sem nada. O vencimento era opcional no
 * schema, e a action só mandava o parâmetro quando a tela tinha valor -- então
 * "opcional" virou "vazio" na prática.
 *
 * Estes testes guardam a exigência no ponto mais barato de todos. O banco também
 * recusa (`fn_fechar_diarias` levanta exceção), mas descobrir no banco custa uma
 * viagem e uma mensagem genérica.
 */
describe("fecharSchema", () => {
  const base = {
    colaboradorId: "11111111-1111-1111-1111-111111111111",
    competencia: "2026-08-01",
    dataVencimento: "2026-09-05",
    formaPagamentoId: "22222222-2222-2222-2222-222222222222",
  };

  it("aceita o fechamento completo", () => {
    expect(fecharSchema.safeParse(base).success).toBe(true);
  });

  it("RECUSA sem vencimento: era isso que deixava o lançamento sem data", () => {
    const { dataVencimento: _, ...semVenc } = base;
    const r = fecharSchema.safeParse(semVenc);
    expect(r.success).toBe(false);
  });

  it("recusa vencimento vazio, e não só ausente", () => {
    // O input `type="date"` vazio manda "", não `undefined`. Um schema que só
    // checasse a ausência aceitaria a string vazia e o banco receberia lixo.
    const r = fecharSchema.safeParse({ ...base, dataVencimento: "" });
    expect(r.success).toBe(false);
  });

  it("RECUSA sem forma de pagamento", () => {
    const { formaPagamentoId: _, ...semForma } = base;
    expect(fecharSchema.safeParse(semForma).success).toBe(false);
  });

  it("recusa forma que não é id", () => {
    const r = fecharSchema.safeParse({ ...base, formaPagamentoId: "PIX" });
    expect(r.success).toBe(false);
  });

  it("a mensagem do vencimento fala do campo da tela", () => {
    // "Data de vencimento inválida" não ajuda quem simplesmente não preencheu.
    const r = fecharSchema.safeParse({ ...base, dataVencimento: "" });
    const mensagem = r.success ? "" : r.error.issues[0]?.message;
    expect(mensagem).toContain("vencimento");
  });
});
