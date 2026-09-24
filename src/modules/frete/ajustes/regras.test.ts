import { describe, expect, it } from "vitest";

import { formatarBRL } from "@/lib/formatadores";
import {
  acoesDoAjuste,
  contaNoSaldo,
  eventosDoAuditLog,
  eventosDoRegistro,
  previaDoAjuste,
  rotuloStatusAjuste,
} from "@/modules/frete/ajustes/regras";

const TUDO = { criar: true, aprovar: true, desaprovar: true };
const NADA = { criar: false, aprovar: false, desaprovar: false };

describe("ações por status e permissão", () => {
  it("pendente: edita com criar; aprova e rejeita com aprovar", () => {
    expect(acoesDoAjuste("pendente_aprovacao", TUDO)).toEqual({ editar: true, aprovar: true, rejeitar: true, desaprovar: false });
    expect(acoesDoAjuste("pendente_aprovacao", { ...NADA, criar: true })).toEqual({
      editar: true,
      aprovar: false,
      rejeitar: false,
      desaprovar: false,
    });
    expect(acoesDoAjuste("pendente_aprovacao", { ...NADA, desaprovar: true })).toEqual({
      editar: false,
      aprovar: false,
      rejeitar: false,
      desaprovar: false,
    });
  });

  it("aprovado: só desaprovar (com a permissão dele); nunca edita", () => {
    expect(acoesDoAjuste("aprovado", TUDO)).toEqual({ editar: false, aprovar: false, rejeitar: false, desaprovar: true });
    expect(acoesDoAjuste("aprovado", { ...TUDO, desaprovar: false }).desaprovar).toBe(false);
  });

  it("rejeitado: nada", () => {
    expect(acoesDoAjuste("rejeitado", TUDO)).toEqual({ editar: false, aprovar: false, rejeitar: false, desaprovar: false });
  });

  it("só o aprovado conta no saldo", () => {
    expect(contaNoSaldo("aprovado")).toBe(true);
    expect(contaNoSaldo("pendente_aprovacao")).toBe(false);
    expect(contaNoSaldo("rejeitado")).toBe(false);
    expect(rotuloStatusAjuste("pendente_aprovacao")).toBe("Pendente de aprovação");
  });
});

describe("prévia (texto da origem, com a ressalva da aprovação)", () => {
  it("crédito e débito", () => {
    expect(previaDoAjuste("credito", 1000, "Areacre")).toBe(`▲ Crédito: ${formatarBRL(1000)} será somado a Areacre depois de aprovado.`);
    expect(previaDoAjuste("debito", 0.08, "LMC")).toBe(`▼ Débito: ${formatarBRL(0.08)} será subtraído de LMC depois de aprovado.`);
  });
});

describe("trilha", () => {
  it("audit_log: lançamento, aprovação, desaprovação com motivo, rejeição", () => {
    const eventos = eventosDoAuditLog([
      { id: "1", acao: "INSERT", usuarioNome: "Ana", dadosAntes: null, dadosDepois: { status: "pendente_aprovacao" }, criadoEm: "2026-09-01T10:00:00Z" },
      { id: "2", acao: "UPDATE", usuarioNome: "Tiago", dadosAntes: { status: "pendente_aprovacao" }, dadosDepois: { status: "aprovado" }, criadoEm: "2026-09-02T10:00:00Z" },
      {
        id: "3",
        acao: "UPDATE",
        usuarioNome: "Tiago",
        dadosAntes: { status: "aprovado" },
        dadosDepois: { status: "pendente_aprovacao", motivo_status: "Valor errado" },
        criadoEm: "2026-09-03T10:00:00Z",
      },
      { id: "4", acao: "UPDATE", usuarioNome: "Ana", dadosAntes: { status: "pendente_aprovacao" }, dadosDepois: { status: "pendente_aprovacao" }, criadoEm: "2026-09-04T10:00:00Z" },
      {
        id: "5",
        acao: "UPDATE",
        usuarioNome: "Tiago",
        dadosAntes: { status: "pendente_aprovacao" },
        dadosDepois: { status: "rejeitado", motivo_status: "Duplicado" },
        criadoEm: "2026-09-05T10:00:00Z",
      },
    ]);
    expect(eventos.map((e) => [e.titulo, e.tipo])).toEqual([
      ["Ajuste lançado", "criacao"],
      ["Ajuste aprovado", "aprovacao"],
      ["Ajuste desaprovado", "desaprovacao"],
      ["Ajuste editado", "edicao"],
      ["Ajuste rejeitado", "rejeicao"],
    ]);
    expect(eventos[2]!.descricao).toBe("Saiu do saldo. Motivo: Valor errado");
    expect(eventos[4]!.descricao).toBe("Não entra no saldo. Motivo: Duplicado");
  });

  it("sem auditoria, sai do registro", () => {
    const base = {
      id: "a",
      createdAt: "2026-09-01T10:00:00Z",
      criadoPorNome: "Ana",
      aprovadoEm: "2026-09-02T10:00:00Z",
      aprovadoPorNome: "Tiago",
      updatedAt: "2026-09-02T10:00:00Z",
      atualizadoPorNome: "Tiago",
      motivoStatus: null,
    };
    expect(eventosDoRegistro({ ...base, status: "aprovado" }).map((e) => e.tipo)).toEqual(["criacao", "aprovacao"]);
    expect(eventosDoRegistro({ ...base, status: "rejeitado", motivoStatus: "x" }).map((e) => e.tipo)).toEqual([
      "criacao",
      "rejeicao",
    ]);
    expect(eventosDoRegistro({ ...base, status: "pendente_aprovacao", motivoStatus: "x" }).map((e) => e.tipo)).toEqual([
      "criacao",
      "desaprovacao",
    ]);
    expect(eventosDoRegistro({ ...base, status: "pendente_aprovacao" }).map((e) => e.tipo)).toEqual(["criacao"]);
  });
});
