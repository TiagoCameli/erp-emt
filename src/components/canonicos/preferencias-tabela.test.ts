import { describe, expect, it } from "vitest";

import {
  chavePreferenciasTabela,
  escreverPreferenciasTabela,
  LARGURA_MAXIMA,
  LARGURA_MINIMA,
  lerPreferenciasTabela,
  ordemEfetiva,
  preferenciasVazias,
  VERSAO_PREFERENCIAS,
} from "./preferencias-tabela";

const IDS = ["numero", "fornecedor", "valorTotal", "status"];

describe("chavePreferenciasTabela", () => {
  it("separa por tabela e por usuário", () => {
    expect(chavePreferenciasTabela("compras.ordens", "u1")).not.toBe(
      chavePreferenciasTabela("compras.ordens", "u2"),
    );
    expect(chavePreferenciasTabela("compras.ordens", "u1")).not.toBe(
      chavePreferenciasTabela("compras.cotacoes", "u1"),
    );
  });

  it("cai em anonimo sem usuário e carrega a versão", () => {
    const chave = chavePreferenciasTabela("compras.ordens");
    expect(chave).toContain("anonimo");
    expect(chave).toContain(`v${VERSAO_PREFERENCIAS}`);
  });
});

describe("lerPreferenciasTabela", () => {
  it("devolve null para ausente, vazio e JSON inválido", () => {
    expect(lerPreferenciasTabela(null, IDS)).toBeNull();
    expect(lerPreferenciasTabela(undefined, IDS)).toBeNull();
    expect(lerPreferenciasTabela("", IDS)).toBeNull();
    expect(lerPreferenciasTabela("{isso não é json", IDS)).toBeNull();
    expect(lerPreferenciasTabela("[1,2,3]", IDS)).toBeNull();
    expect(lerPreferenciasTabela("null", IDS)).toBeNull();
  });

  it("descarta versão diferente da atual", () => {
    const antigo = JSON.stringify({ versao: 0, visiveis: { numero: false } });
    expect(lerPreferenciasTabela(antigo, IDS)).toBeNull();
  });

  it("lê visíveis, ordem e larguras válidas", () => {
    const salvo = escreverPreferenciasTabela({
      versao: VERSAO_PREFERENCIAS,
      visiveis: { status: false },
      ordem: ["status", "numero"],
      larguras: { numero: 120 },
    });

    expect(lerPreferenciasTabela(salvo, IDS)).toEqual({
      versao: VERSAO_PREFERENCIAS,
      visiveis: { status: false },
      ordem: ["status", "numero"],
      larguras: { numero: 120 },
    });
  });

  it("joga fora coluna que não existe mais na tela", () => {
    const salvo = escreverPreferenciasTabela({
      versao: VERSAO_PREFERENCIAS,
      visiveis: { colunaMorta: false, status: false },
      ordem: ["colunaMorta", "status"],
      larguras: { colunaMorta: 300, status: 100 },
    });

    const lido = lerPreferenciasTabela(salvo, IDS);

    expect(lido?.visiveis).toEqual({ status: false });
    expect(lido?.ordem).toEqual(["status"]);
    expect(lido?.larguras).toEqual({ status: 100 });
  });

  it("ignora tipos errados em vez de quebrar a tela", () => {
    const salvo = JSON.stringify({
      versao: VERSAO_PREFERENCIAS,
      visiveis: { numero: "sim", status: false },
      ordem: "numero",
      larguras: { numero: "grande", status: Number.NaN },
    });

    expect(lerPreferenciasTabela(salvo, IDS)).toEqual({
      versao: VERSAO_PREFERENCIAS,
      visiveis: { status: false },
      ordem: [],
      larguras: {},
    });
  });

  it("trava largura no mínimo e no máximo, e arredonda", () => {
    const salvo = JSON.stringify({
      versao: VERSAO_PREFERENCIAS,
      larguras: { numero: 1, fornecedor: 99999, status: 120.6 },
    });

    expect(lerPreferenciasTabela(salvo, IDS)?.larguras).toEqual({
      numero: LARGURA_MINIMA,
      fornecedor: LARGURA_MAXIMA,
      status: 121,
    });
  });

  it("não repete id na ordem", () => {
    const salvo = JSON.stringify({
      versao: VERSAO_PREFERENCIAS,
      ordem: ["numero", "numero", "status"],
    });

    expect(lerPreferenciasTabela(salvo, IDS)?.ordem).toEqual(["numero", "status"]);
  });
});

describe("preferenciasVazias", () => {
  it("é neutra e sobrevive à ida e volta", () => {
    const vazias = preferenciasVazias();
    expect(vazias.visiveis).toEqual({});
    expect(vazias.ordem).toEqual([]);
    expect(vazias.larguras).toEqual({});
    expect(lerPreferenciasTabela(escreverPreferenciasTabela(vazias), IDS)).toEqual(
      vazias,
    );
  });
});

describe("ordemEfetiva", () => {
  it("respeita a ordem salva e joga coluna nova pro fim", () => {
    expect(ordemEfetiva(["status", "numero"], IDS)).toEqual([
      "status",
      "numero",
      "fornecedor",
      "valorTotal",
    ]);
  });

  it("sem ordem salva devolve a ordem natural", () => {
    expect(ordemEfetiva([], IDS)).toEqual(IDS);
  });

  it("ignora id salvo que não existe mais", () => {
    expect(ordemEfetiva(["morta", "status"], IDS)).toEqual([
      "status",
      "numero",
      "fornecedor",
      "valorTotal",
    ]);
  });
});
