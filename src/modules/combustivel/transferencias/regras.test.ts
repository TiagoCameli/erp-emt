import { describe, expect, it } from "vitest";

import {
  avaliarBloqueios,
  conflitoDeCombustivel,
  ehEdicaoSoDeMetadados,
  enviaValor,
  podeRestaurarMovimento,
  valorAutomatico,
} from "@/modules/combustivel/transferencias/regras";

const DIESEL = "d1";
const GASOLINA = "g1";

describe("valor automático (criação)", () => {
  it("litros x preço médio com 4 casas, como o toFixed(4) da origem", () => {
    expect(valorAutomatico(100, 6.3947)).toBe(639.47);
    // 1234,5678 x 6,39471234 = 7894,6282... -> 4 casas
    expect(valorAutomatico(1234.5678, 6.39471234)).toBe(Number.parseFloat((1234.5678 * 6.39471234).toFixed(4)));
    expect(valorAutomatico(3, 1 / 3)).toBe(1);
  });

  it("litros ou preço zerados não preenchem (o campo fica como está)", () => {
    expect(valorAutomatico(0, 6.3947)).toBeNull();
    expect(valorAutomatico(100, 0)).toBeNull();
    expect(valorAutomatico(Number.NaN, 6.3947)).toBeNull();
  });
});

describe("valor enviado: criação x edição", () => {
  it("na criação o valor do campo vai sempre", () => {
    expect(enviaValor(false, false)).toBe(true);
    expect(enviaValor(false, true)).toBe(true);
  });

  it("na edição só vai se a pessoa mexeu no campo", () => {
    expect(enviaValor(true, false)).toBe(false);
    expect(enviaValor(true, true)).toBe(true);
  });
});

describe("edição só de metadados", () => {
  const inicial = { origemId: "a", destinoId: "b", litros: 100, dataHora: "2026-09-23T14:30" };

  it("criação nunca é só metadados", () => {
    expect(ehEdicaoSoDeMetadados(null, inicial)).toBe(false);
  });

  it("nenhum campo físico mudou: é só metadados", () => {
    expect(ehEdicaoSoDeMetadados(inicial, { ...inicial })).toBe(true);
  });

  it("qualquer campo físico que muda derruba", () => {
    expect(ehEdicaoSoDeMetadados(inicial, { ...inicial, origemId: "c" })).toBe(false);
    expect(ehEdicaoSoDeMetadados(inicial, { ...inicial, destinoId: "c" })).toBe(false);
    expect(ehEdicaoSoDeMetadados(inicial, { ...inicial, litros: 100.0001 })).toBe(false);
    expect(ehEdicaoSoDeMetadados(inicial, { ...inicial, dataHora: "2026-09-23T14:31" })).toBe(false);
  });
});

describe("bloqueios de estoque e espaço na data", () => {
  const destino = { capacidade: 1000, nivel: 0, combustivelId: null };

  it("sem estoque na origem na data bloqueia; igual ao estoque passa", () => {
    expect(avaliarBloqueios(501, true, 500, null, null).semEstoqueOrigem).toBe(true);
    expect(avaliarBloqueios(500, true, 500, null, null).semEstoqueOrigem).toBe(false);
  });

  it("sem espaço no destino na data: capacidade menos o estoque dele nessa data", () => {
    const passa = avaliarBloqueios(400, true, 5000, destino, 600);
    expect(passa).toEqual({ semEstoqueOrigem: false, semEspacoDestino: false, espacoDestino: 400 });
    expect(avaliarBloqueios(400.0001, true, 5000, destino, 600).semEspacoDestino).toBe(true);
  });

  it("estoque ainda desconhecido não acusa (a tela segura o botão enquanto consulta)", () => {
    expect(avaliarBloqueios(999999, true, null, destino, null)).toEqual({
      semEstoqueOrigem: false,
      semEspacoDestino: false,
      espacoDestino: null,
    });
  });

  it("capacidade zero não trava o destino, como a RPC", () => {
    expect(avaliarBloqueios(999999, true, 999999, { ...destino, capacidade: 0 }, 50).semEspacoDestino).toBe(false);
  });
});

describe("conflito de combustível no destino", () => {
  const origem = { capacidade: 1000, nivel: 500, combustivelId: DIESEL };
  const destino = { capacidade: 1000, nivel: 200, combustivelId: GASOLINA };

  it("destino com outro combustível bloqueia", () => {
    expect(conflitoDeCombustivel(origem, destino, false)).toEqual({ origemId: DIESEL, destinoId: GASOLINA });
  });

  it("os casos que a origem deixa passar", () => {
    expect(conflitoDeCombustivel(origem, destino, true)).toBeNull(); // só metadados
    expect(conflitoDeCombustivel(null, destino, false)).toBeNull();
    expect(conflitoDeCombustivel(origem, null, false)).toBeNull();
    expect(conflitoDeCombustivel(origem, { ...destino, nivel: 0 }, false)).toBeNull(); // destino vazio
    expect(conflitoDeCombustivel(origem, { ...destino, combustivelId: null }, false)).toBeNull();
    expect(conflitoDeCombustivel({ ...origem, combustivelId: null }, destino, false)).toBeNull();
    expect(conflitoDeCombustivel(origem, { ...destino, combustivelId: DIESEL }, false)).toBeNull();
  });
});

describe("permissão de restaurar", () => {
  function com(concedidas: string[]) {
    return (recurso: string, acao: string) => concedidas.includes(`${recurso}/${acao}`);
  }

  it("pede a lixeira E a exclusão do recurso, as duas", () => {
    const ambas = com(["administracao.lixeira/editar", "combustivel.transferencias/excluir"]);
    expect(podeRestaurarMovimento(ambas, "combustivel.transferencias")).toBe(true);
    expect(podeRestaurarMovimento(com(["administracao.lixeira/editar"]), "combustivel.transferencias")).toBe(false);
    expect(podeRestaurarMovimento(com(["combustivel.transferencias/excluir"]), "combustivel.transferencias")).toBe(false);
  });

  it("a exclusão é a do recurso da linha, não a de outro", () => {
    const outro = com(["administracao.lixeira/editar", "combustivel.transferencias/excluir"]);
    expect(podeRestaurarMovimento(outro, "combustivel.esvaziamentos")).toBe(false);
  });
});
