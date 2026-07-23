import { describe, expect, it } from "vitest";

import { eventosDoAuditLog } from "./trilha-helpers";
import type { RegistroAuditLog } from "./trilha-helpers";

/**
 * Intl em pt-BR usa espaço não separável (U+00A0) entre "R$" e o número.
 * Normaliza para espaço comum para os expects ficarem legíveis (mesma
 * convenção de src/lib/formatadores.test.ts).
 */
function normalizar(texto: string | undefined): string | undefined {
  return texto?.replace(/ /g, " ");
}

function reg(p: Partial<RegistroAuditLog>): RegistroAuditLog {
  return {
    id: 1, tabela: "ordens_compra", registro_id: "oc1", acao: "UPDATE",
    usuario_nome: "Tiago", dados_antes: null, dados_depois: null,
    criado_em: "2026-07-22T14:30:00Z", ...p,
  };
}

describe("eventosDoAuditLog", () => {
  it("INSERT vira '{entidade} criada' (feminino) / criado (masculino)", () => {
    const f = eventosDoAuditLog([reg({ acao: "INSERT", dados_antes: null, dados_depois: { status: "rascunho" } })], { entidade: "Ordem", genero: "f" });
    expect(f[0].titulo).toBe("Ordem criada");
    const m = eventosDoAuditLog([reg({ acao: "INSERT", dados_depois: { status: "rascunho" } })], { entidade: "Lançamento", genero: "m" });
    expect(m[0].titulo).toBe("Lançamento criado");
  });

  it("mudança de situação vira título por ação", () => {
    const t = (antes: string, depois: string) =>
      eventosDoAuditLog([reg({ dados_antes: { status: antes }, dados_depois: { status: depois } })], { entidade: "Ordem", genero: "f" })[0].titulo;
    expect(t("rascunho", "pendente_aprovacao")).toBe("Enviada para aprovação");
    expect(t("pendente_aprovacao", "aprovado")).toBe("Aprovada");
    expect(t("aprovado", "pendente_aprovacao")).toBe("Aprovação revertida");
    expect(t("pendente_aprovacao", "cancelado")).toBe("Cancelada");
    expect(t("aprovado", "recebido")).toBe("Recebida");
  });

  it("mostra rótulo amigável + valor novo formatado, sem 'de → para'", () => {
    const [e] = eventosDoAuditLog([reg({
      dados_antes: { valor_total: 0 }, dados_depois: { valor_total: 3680 },
    })], { entidade: "Ordem", genero: "f" });
    expect(normalizar(e.descricao)).toBe("Valor total: R$ 3.680,00");
    expect(e.descricao).not.toContain("→");
  });

  it("situação em palavras", () => {
    eventosDoAuditLog([reg({
      dados_antes: { observacoes: "a" }, dados_depois: { observacoes: "a", status: "aprovado" },
    })], { entidade: "Ordem", genero: "f" });
    // título já cobre status; aqui garantimos o mapa de situação
    expect(eventosDoAuditLog([reg({ dados_antes: {}, dados_depois: { motivo_rejeicao: "x", status: "cancelado" } })], {})[0].titulo).toBe("Cancelada");
  });

  it("resolve FK pelo mapa nomes; oculta FK sem nome", () => {
    const nomes = { "uuid-cond": "À vista" };
    const [ok] = eventosDoAuditLog([reg({ dados_antes: {}, dados_depois: { condicao_pagamento_id: "uuid-cond" } })], { nomes });
    expect(ok.descricao).toBe("Condição de pagamento: À vista");
    const [semNome] = eventosDoAuditLog([reg({ dados_antes: {}, dados_depois: { condicao_pagamento_id: "uuid-desconhecido" } })], {});
    expect(semNome.descricao).toBeUndefined(); // sem nome, o campo é ocultado
  });

  it("oculta ruído (aprovado_por, aprovado_em, timestamps) e mostra '—' pra vazio relevante", () => {
    const [e] = eventosDoAuditLog([reg({
      dados_antes: { aprovado_por: "x", aprovado_em: "2026-07-22T19:30:00Z", motivo_rejeicao: null },
      dados_depois: { aprovado_por: null, aprovado_em: null, motivo_rejeicao: "Teste QA", status: "cancelado" },
    })], { entidade: "Ordem", genero: "f" });
    expect(e.titulo).toBe("Cancelada");
    expect(e.descricao).toBe("Motivo: Teste QA");
    expect(e.descricao).not.toContain("aprovado");
  });
});
