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

  it("situação sem case dedicado cai no fallback 'Situação: {label}' via mapa SITUACOES", () => {
    const [e] = eventosDoAuditLog([reg({
      dados_antes: {}, dados_depois: { status: "previsto" },
    })], { entidade: "Lançamento", genero: "m" });
    expect(e.titulo).toBe("Situação: Previsto");
  });

  it("campo visível que vira null mostra '—' na descrição", () => {
    const [e] = eventosDoAuditLog([reg({
      dados_antes: { numero_nf: "12345" }, dados_depois: { numero_nf: null },
    })], { entidade: "Ordem", genero: "f" });
    expect(e.descricao).toBe("Nota fiscal: —");
  });

  it("transição de situação no masculino usa título masculino", () => {
    const [e] = eventosDoAuditLog([reg({
      dados_antes: { status: "pendente_aprovacao" }, dados_depois: { status: "aprovado" },
    })], { entidade: "Lançamento", genero: "m" });
    expect(e.titulo).toBe("Aprovado");
  });

  it("sem opcoes (retrocompat): INSERT vira 'Registro criado' e DELETE vira 'Registro excluído'", () => {
    const [ins] = eventosDoAuditLog([reg({ acao: "INSERT", dados_antes: null, dados_depois: { status: "rascunho" } })]);
    expect(ins.titulo).toBe("Registro criado");
    const [del] = eventosDoAuditLog([reg({ acao: "DELETE", dados_antes: { status: "rascunho" }, dados_depois: null })]);
    expect(del.titulo).toBe("Registro excluído");
  });

  it("resolve FK pelo mapa nomes; oculta FK sem nome", () => {
    const nomes = { "uuid-cond": "À vista" };
    const [ok] = eventosDoAuditLog([reg({ dados_antes: {}, dados_depois: { condicao_pagamento_id: "uuid-cond" } })], { nomes });
    expect(ok.descricao).toBe("Condição de pagamento: À vista");
    const [semNome] = eventosDoAuditLog([reg({ dados_antes: {}, dados_depois: { condicao_pagamento_id: "uuid-desconhecido" } })], {});
    expect(semNome.descricao).toBeUndefined(); // sem nome, o campo é ocultado
  });

  it("mais de 6 campos mudados: mostra 6 e indica 'e mais N campos'", () => {
    const [e] = eventosDoAuditLog([reg({
      dados_antes: {
        observacoes: "a", numero_nf: "1", motivo_rejeicao: "x", quantidade: 1,
        valor: 1, preco_unitario: 1, data_emissao: "2026-01-01", data_vencimento: "2026-01-01",
      },
      dados_depois: {
        observacoes: "b", numero_nf: "2", motivo_rejeicao: "y", quantidade: 2,
        valor: 2, preco_unitario: 2, data_emissao: "2026-02-01", data_vencimento: "2026-02-01",
      },
    })], { entidade: "Ordem", genero: "f" });
    expect(e.descricao).toMatch(/ e mais 2 campos$/);
    expect((e.descricao?.match(/ · /g) ?? []).length).toBe(6);
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
