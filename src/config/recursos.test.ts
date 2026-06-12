import { describe, expect, it } from "vitest";

import {
  ACOES,
  MODULOS,
  RECURSOS,
  recursoPorId,
  recursosDoModulo,
  type Acao,
  type RecursoId,
} from "@/config/recursos";

const idsDeModulos = new Set<string>(MODULOS.map((m) => m.id));
const acoesValidas = new Set<Acao>(ACOES);

describe("RECURSOS", () => {
  it("todo recurso tem id no formato modulo.aba", () => {
    for (const recurso of RECURSOS) {
      const partes = recurso.id.split(".");
      expect(partes, `id mal formado: ${recurso.id}`).toHaveLength(2);
      expect(partes[0].length, `modulo vazio em: ${recurso.id}`).toBeGreaterThan(0);
      expect(partes[1].length, `aba vazia em: ${recurso.id}`).toBeGreaterThan(0);
    }
  });

  it("o prefixo do id bate com o campo modulo do recurso", () => {
    for (const recurso of RECURSOS) {
      expect(recurso.id.split(".")[0], `id ${recurso.id} não bate com modulo ${recurso.modulo}`).toBe(
        recurso.modulo,
      );
    }
  });

  it("o modulo de todo recurso existe em MODULOS", () => {
    for (const recurso of RECURSOS) {
      expect(
        idsDeModulos.has(recurso.modulo),
        `modulo ${recurso.modulo} do recurso ${recurso.id} não existe em MODULOS`,
      ).toBe(true);
    }
  });

  it("ids são únicos", () => {
    const ids = RECURSOS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rotas são únicas", () => {
    const rotas = RECURSOS.map((r) => r.rota);
    expect(new Set(rotas).size).toBe(rotas.length);
  });

  it("acoes só contém ações do catálogo ACOES e nunca é vazia", () => {
    for (const recurso of RECURSOS) {
      expect(recurso.acoes.length, `recurso ${recurso.id} sem ações`).toBeGreaterThan(0);
      for (const acao of recurso.acoes) {
        expect(
          acoesValidas.has(acao),
          `ação ${acao} do recurso ${recurso.id} não existe em ACOES`,
        ).toBe(true);
      }
    }
  });

  it("todo recurso de ver tem a ação ver (pré-requisito das demais)", () => {
    for (const recurso of RECURSOS) {
      expect(recurso.acoes, `recurso ${recurso.id} sem ação ver`).toContain("ver");
    }
  });
});

describe("recursoPorId", () => {
  it("retorna o recurso para um id conhecido", () => {
    const recurso = recursoPorId("administracao.usuarios");
    expect(recurso.nome).toBe("Usuários e permissões");
    expect(recurso.rota).toBe("/administracao/usuarios");
  });

  it("lança para id desconhecido", () => {
    expect(() => recursoPorId("modulo.inexistente" as RecursoId)).toThrowError(
      /Recurso desconhecido/,
    );
  });
});

describe("recursosDoModulo", () => {
  it("retorna os 5 recursos de administracao", () => {
    const recursos = recursosDoModulo("administracao");
    expect(recursos).toHaveLength(5);
    expect(recursos.map((r) => r.id).sort()).toEqual([
      "administracao.auditoria",
      "administracao.configuracoes",
      "administracao.lixeira",
      "administracao.perfis",
      "administracao.usuarios",
    ]);
  });
});
