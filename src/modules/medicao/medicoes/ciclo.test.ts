import { describe, expect, it } from "vitest";

import { passosDaMedicao, revisaoCorrente, type PermissoesCiclo } from "./ciclo";
import type { RevisaoMedicao } from "./tipos";

/**
 * Botões do ciclo por status e permissão (Task 3 da Fase 5). Espelha as regras das RPCs
 * (contexto-comum.md): a tela só oferece o passo que o banco aceitaria; quem confere de novo é a RPC.
 */

const TUDO: PermissoesCiclo = { editar: true, aprovar: true, desaprovar: true };
const NADA: PermissoesCiclo = { editar: false, aprovar: false, desaprovar: false };

function revisao(over: Partial<RevisaoMedicao> = {}): RevisaoMedicao {
  return { id: "r0", numero: 0, fase: "antes_aprovacao", status: "em_aberto", motivo: null, criadoEm: "2026-10-01T10:00:00Z", ...over };
}

describe("revisaoCorrente", () => {
  it("é a de maior número entre em aberto e enviada", () => {
    const revisoes = [
      revisao({ id: "r0", numero: 0, status: "substituida" }),
      revisao({ id: "r1", numero: 1, status: "enviada" }),
    ];
    expect(revisaoCorrente(revisoes)?.id).toBe("r1");
  });

  it("aprovada sem pendente: nenhuma corrente", () => {
    expect(revisaoCorrente([revisao({ status: "aprovada" })])).toBeNull();
  });
});

describe("passosDaMedicao", () => {
  it("aberta: só Fechar, com editar", () => {
    expect(passosDaMedicao("aberta", revisao(), TUDO)).toEqual(["fechar"]);
    expect(passosDaMedicao("aberta", revisao(), NADA)).toEqual([]);
  });

  it("em conferência: Reabrir, Ajuste e Enviar, com editar", () => {
    expect(passosDaMedicao("em_conferencia", revisao(), TUDO)).toEqual(["reabrir", "ajuste", "enviar"]);
    expect(passosDaMedicao("em_conferencia", revisao(), { ...NADA, aprovar: true })).toEqual([]);
  });

  it("enviada: Nova revisão (editar) e Aprovar (aprovar)", () => {
    const enviada = revisao({ status: "enviada" });
    expect(passosDaMedicao("enviada", enviada, TUDO)).toEqual(["nova_revisao", "aprovar"]);
    expect(passosDaMedicao("enviada", enviada, { ...NADA, aprovar: true })).toEqual(["aprovar"]);
    expect(passosDaMedicao("enviada", enviada, { ...NADA, editar: true })).toEqual(["nova_revisao"]);
  });

  it("aprovada sem revisão pendente: Revisar aprovada, só com desaprovar", () => {
    expect(passosDaMedicao("aprovada", null, TUDO)).toEqual(["revisar_aprovada"]);
    expect(passosDaMedicao("aprovada", null, { ...TUDO, desaprovar: false })).toEqual([]);
  });

  it("aprovada com revisão pós em aberto: Ajuste e Enviar", () => {
    const pos = revisao({ numero: 1, fase: "pos_aprovacao" });
    expect(passosDaMedicao("aprovada", pos, TUDO)).toEqual(["ajuste", "enviar"]);
  });

  it("aprovada com revisão pós enviada: Nova revisão e Aprovar", () => {
    const pos = revisao({ numero: 1, fase: "pos_aprovacao", status: "enviada" });
    expect(passosDaMedicao("aprovada", pos, TUDO)).toEqual(["nova_revisao", "aprovar"]);
  });

  it("status desconhecido não oferece nada", () => {
    expect(passosDaMedicao("outro", revisao(), TUDO)).toEqual([]);
  });
});
