import { describe, expect, it } from "vitest";

import { STATUS_OS } from "@/modules/manutencao/_shared/rotulos";
import { acoesDaOs, osExigeCentroCusto } from "@/modules/manutencao/servicos/regras";

const TUDO = { editar: true, excluir: true };
const NADA = { editar: false, excluir: false };

describe("acoesDaOs", () => {
  it("aberta: edita, inicia, conclui, cancela e exclui; não reabre", () => {
    expect(acoesDaOs("aberta", TUDO)).toEqual({
      editarCabecalho: true,
      adicionarLinha: true,
      removerLinha: true,
      iniciar: true,
      concluir: true,
      reabrir: false,
      cancelar: true,
      excluir: true,
      anexar: true,
    });
  });

  it("em execução: edita, conclui e cancela; não inicia de novo nem exclui", () => {
    expect(acoesDaOs("em_execucao", TUDO)).toEqual({
      editarCabecalho: true,
      adicionarLinha: true,
      removerLinha: true,
      iniciar: false,
      concluir: true,
      reabrir: false,
      cancelar: true,
      excluir: false,
      anexar: true,
    });
  });

  it("concluída: reabre e anexa foto do serviço; linha e cabeçalho travados", () => {
    expect(acoesDaOs("concluida", TUDO)).toEqual({
      editarCabecalho: false,
      adicionarLinha: false,
      removerLinha: false,
      iniciar: false,
      concluir: false,
      reabrir: true,
      cancelar: false,
      excluir: false,
      anexar: true,
    });
  });

  it("cancelada: só exclui; não recebe anexo", () => {
    expect(acoesDaOs("cancelada", TUDO)).toEqual({
      editarCabecalho: false,
      adicionarLinha: false,
      removerLinha: false,
      iniciar: false,
      concluir: false,
      reabrir: false,
      cancelar: false,
      excluir: true,
      anexar: false,
    });
  });

  it("sem permissão nenhuma, nenhum botão em status nenhum", () => {
    for (const status of STATUS_OS) {
      expect(Object.values(acoesDaOs(status, NADA)).some(Boolean)).toBe(false);
    }
  });

  it("excluir depende só da permissão de excluir; o resto, de editar", () => {
    expect(acoesDaOs("aberta", { editar: false, excluir: true })).toMatchObject({
      excluir: true,
      iniciar: false,
      concluir: false,
      adicionarLinha: false,
    });
    expect(acoesDaOs("aberta", { editar: true, excluir: false }).excluir).toBe(false);
  });
});

describe("osExigeCentroCusto", () => {
  it("pede a obra só para equipamento sem etapa (alugado)", () => {
    expect(osExigeCentroCusto({ temEtapa: false })).toBe(true);
    expect(osExigeCentroCusto({ temEtapa: true })).toBe(false);
  });

  it("sem equipamento escolhido não pede nada", () => {
    expect(osExigeCentroCusto(null)).toBe(false);
  });
});
