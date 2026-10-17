import { describe, expect, it } from "vitest";

import {
  agruparRelatorioPessoas,
  paraCentrosColaborador,
  rotuloMotivoPessoa,
  type RelDiasPessoaLinha,
} from "@/modules/mapa/centros-pessoa";

const linha = (parcial: Partial<RelDiasPessoaLinha>): RelDiasPessoaLinha => ({
  colaboradorId: "p1",
  nome: "Ana",
  funcao: "Operadora",
  centroId: "c-009",
  centroNome: "009",
  estado: "trabalhando",
  dias: 1,
  ...parcial,
});

describe("agruparRelatorioPessoas", () => {
  it("soma por pessoa e centro e separa trabalhados de parados", () => {
    const rel = agruparRelatorioPessoas([
      linha({ dias: 10 }),
      linha({ centroId: "c-sem", centroNome: "Pessoal Sem Alocação", estado: "parado", dias: 3 }),
      linha({ centroId: "c-sem", centroNome: "Pessoal Sem Alocação", estado: "trabalhando", dias: 2 }),
      linha({ colaboradorId: "p2", nome: "Bruno", dias: 15 }),
    ]);
    const ana = rel.pessoas.find((p) => p.id === "p1");
    expect(ana).toMatchObject({ trabalhados: 12, parados: 3, total: 15 });
    expect(ana?.dias).toEqual({ "c-009": 10, "c-sem": 5 });
    expect(rel.centros.map((c) => [c.id, c.total])).toEqual([
      ["c-009", 25],
      ["c-sem", 5],
    ]);
    expect(rel).toMatchObject({ trabalhados: 27, parados: 3, total: 30 });
  });

  it("ordena as pessoas pelo nome, sem acento atrapalhar", () => {
    const rel = agruparRelatorioPessoas([
      linha({ colaboradorId: "p2", nome: "Érica" }),
      linha({ colaboradorId: "p1", nome: "Davi" }),
      linha({ colaboradorId: "p3", nome: "Fábio" }),
    ]);
    expect(rel.pessoas.map((p) => p.nome)).toEqual(["Davi", "Érica", "Fábio"]);
  });

  it("vazio dá zero", () => {
    expect(agruparRelatorioPessoas([])).toEqual({
      pessoas: [],
      centros: [],
      trabalhados: 0,
      parados: 0,
      total: 0,
    });
  });
});

describe("paraCentrosColaborador", () => {
  it("lê o JSON da ficha", () => {
    expect(
      paraCentrosColaborador({
        estado: "parado",
        trabalhados: 4,
        parados: 2,
        atual: { centro_id: "c", centro_nome: "Sem", motivo: "parado", desde: "2026-10-16" },
        mes: [{ centro_id: "c", centro_nome: "Sem", dias: 2 }],
        periodos: [],
      }),
    ).toEqual({
      estado: "parado",
      trabalhados: 4,
      parados: 2,
      atual: { centroId: "c", centroNome: "Sem", motivo: "parado", desde: "2026-10-16" },
      mes: [{ centroId: "c", centroNome: "Sem", dias: 2 }],
      periodos: [],
      centroAtual: null,
      localAtual: null,
      mudancasCentro: [],
      mudancasLocal: [],
    });
  });

  it("lê o centro e o local de agora com o dia em que começaram, e as mudanças", () => {
    const c = paraCentrosColaborador({
      estado: "trabalhando",
      centro_atual: { centro_id: "c9", centro_nome: "009", desde: "2026-10-20" },
      local_atual: { localidade_id: null, nome: null, desde: "2026-10-21" },
      mudancas_centro: [
        { data: "2026-10-20", centro_nome: "009", antes_nome: "Pessoal Sem Alocação" },
        { data: "2026-10-14", centro_nome: "Pessoal Sem Alocação", antes_nome: null },
      ],
      mudancas_local: [
        { data: "2026-10-21", nome: null, antes_nome: "Silo" },
        { data: "2026-10-16", nome: "Silo", antes_nome: null },
        { data: "2026-10-14", nome: null, antes_nome: null },
      ],
    });
    expect(c?.centroAtual).toEqual({ centroId: "c9", centroNome: "009", desde: "2026-10-20" });
    // Sem local também é um lugar com data: saiu do Silo em 21/10.
    expect(c?.localAtual).toEqual({ localidadeId: null, nome: "", desde: "2026-10-21" });
    expect(c?.mudancasCentro).toEqual([
      { data: "2026-10-20", nome: "009", antes: "Pessoal Sem Alocação" },
      { data: "2026-10-14", nome: "Pessoal Sem Alocação", antes: null },
    ]);
    expect(c?.mudancasLocal.map((m) => [m.data, m.nome, m.antes])).toEqual([
      ["2026-10-21", "", "Silo"],
      ["2026-10-16", "Silo", ""],
      ["2026-10-14", "", null],
    ]);
  });

  it("estado desconhecido vira trabalhando (o padrão do banco)", () => {
    expect(paraCentrosColaborador({ estado: "x" })?.estado).toBe("trabalhando");
  });

  it("formato inesperado dá null", () => {
    expect(paraCentrosColaborador(null)).toBeNull();
    expect(paraCentrosColaborador([1])).toBeNull();
  });
});

describe("rotuloMotivoPessoa", () => {
  it("dá nome aos motivos do banco e devolve o desconhecido como veio", () => {
    expect(rotuloMotivoPessoa("escolhido")).toBe("Centro escolhido na ficha");
    expect(rotuloMotivoPessoa("parado")).toBe("Parado");
    expect(rotuloMotivoPessoa("novo")).toBe("novo");
  });
});
