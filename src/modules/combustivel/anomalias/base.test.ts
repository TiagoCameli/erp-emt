import { describe, expect, it } from "vitest";

import {
  detectarNaBase,
  EQUIPAMENTO_DESCONHECIDO,
  ehEquipamentoSentinela,
  equipamentosParaDeteccao,
  modoDaUrl,
  montarSaidaBase,
  normalizarNome,
  obraDaSaida,
  opcoesDeEquipamento,
  relogioDeParede,
  saidasDoRecorte,
  type BaseCombustivel,
  type EquipamentoBase,
  type LinhaSaidaBanco,
} from "@/modules/combustivel/anomalias/base";

const OUTROS = "11111111-1111-1111-1111-111111111111";
const ESCAVADEIRA = "22222222-2222-2222-2222-222222222222";

function equipamento(parcial: Partial<EquipamentoBase> = {}): EquipamentoBase {
  return {
    id: ESCAVADEIRA,
    codigo: "EQ-01",
    descricao: "Escavadeira 320",
    placa: null,
    tipo: "Escavadeira",
    marca: null,
    modelo: null,
    ativo: true,
    sentinela: false,
    ...parcial,
  };
}

function linha(parcial: Partial<LinhaSaidaBanco> = {}): LinhaSaidaBanco {
  return {
    id: "s1",
    data: "2026-09-02T03:30:00+00:00",
    origem: "tanque",
    tipo_consumidor: "equipamento_proprio",
    tanque_id: "t1",
    equipamento_id: ESCAVADEIRA,
    transportadora_id: null,
    placa: null,
    motorista: "João",
    insumo_id: "diesel",
    litros: "120.5000",
    preco_unitario: "6.3947",
    valor_total: "770.5614",
    pago: false,
    pago_em: null,
    observacoes: null,
    created_by: null,
    abastecimento_alocacoes: [{ centro_custo_id: "etapa-a", percentual: "100" }],
    ...parcial,
  };
}

const CENTROS = new Map([
  ["obra-9", { nome: "Obra 009", paiId: null }],
  ["etapa-a", { nome: "Etapa A", paiId: "obra-9" }],
  ["obra-2", { nome: "Obra 002", paiId: null }],
]);

describe("sentinela", () => {
  it("casa descrição ou código normalizados, e só o nome inteiro", () => {
    expect(ehEquipamentoSentinela({ codigo: null, descricao: "Outros" })).toBe(true);
    expect(ehEquipamentoSentinela({ codigo: null, descricao: "  OUTROS " })).toBe(true);
    expect(ehEquipamentoSentinela({ codigo: "OUTROS", descricao: "Sem nome" })).toBe(true);
    expect(ehEquipamentoSentinela({ codigo: null, descricao: "Equipamento Desconhecido" })).toBe(true);
    expect(ehEquipamentoSentinela({ codigo: null, descricao: "Outros serviços" })).toBe(false);
    expect(normalizarNome("  Equipamento   DESCONHECÍDO ")).toBe("equipamento desconhecido");
  });

  it("o 'Outros' vira o 'desconhecido' da origem na saída e sai da lista de equipamentos do D5", () => {
    const s = montarSaidaBase(linha({ equipamento_id: OUTROS }), new Set([OUTROS]), CENTROS);
    expect(s.equipamentoId).toBe(EQUIPAMENTO_DESCONHECIDO);
    expect(s.equipamentoIdReal).toBe(OUTROS);

    const lista = equipamentosParaDeteccao([equipamento(), equipamento({ id: OUTROS, descricao: "Outros", sentinela: true })]);
    expect(lista).toEqual([{ id: ESCAVADEIRA, nome: "Escavadeira 320", ativo: true }]);
  });
});

describe("montagem da saída no formato da origem", () => {
  it("data no relógio de parede de Rio Branco, números do banco e obra pela raiz da alocação", () => {
    const s = montarSaidaBase(linha(), new Set(), CENTROS);
    // 03:30 UTC do dia 2 é 22:30 do dia 1 em Rio Branco.
    expect(s.data).toBe("2026-09-01T22:30:00");
    expect(s.instante).toBe("2026-09-02T03:30:00+00:00");
    expect(s.litros).toBe(120.5);
    expect(s.valorTotal).toBe(770.5614);
    expect(s.precoUnitario).toBe(6.3947);
    expect(s.obraId).toBe("obra-9");
    expect(s.tipoCombustivel).toBe("diesel");
  });

  it("mais de uma obra: a de maior percentual; sem alocação: sem obra", () => {
    expect(
      obraDaSaida([
        { centroRaizId: "obra-2", percentual: 40 },
        { centroRaizId: "obra-9", percentual: 60 },
      ]),
    ).toBe("obra-9");
    expect(
      obraDaSaida([
        { centroRaizId: "obra-2", percentual: 50 },
        { centroRaizId: "obra-9", percentual: 50 },
      ]),
    ).toBe("obra-2");
    expect(obraDaSaida([])).toBeNull();
    expect(relogioDeParede("2026-01-01T04:59:59Z")).toBe("2025-12-31T23:59:59");
  });
});

describe("recorte da tela", () => {
  it("modo pelo tipo de consumidor e período pelo dia do relógio de parede, as duas pontas inclusivas", () => {
    const base = [
      montarSaidaBase(linha({ id: "a", data: "2026-09-01T05:00:00Z" }), new Set(), CENTROS), // 01/09 00:00
      montarSaidaBase(linha({ id: "b", data: "2026-09-01T04:59:00Z" }), new Set(), CENTROS), // 31/08 23:59
      montarSaidaBase(linha({ id: "c", data: "2026-10-01T04:00:00Z" }), new Set(), CENTROS), // 30/09 23:00
      montarSaidaBase(
        linha({ id: "d", data: "2026-09-10T12:00:00Z", tipo_consumidor: "carreta_transportadora", equipamento_id: null }),
        new Set(),
        CENTROS,
      ),
    ];
    expect(saidasDoRecorte(base, "proprios", "2026-09-01", "2026-09-30").map((s) => s.id)).toEqual(["a", "c"]);
    expect(saidasDoRecorte(base, "carretas", "2026-09-01", "2026-09-30").map((s) => s.id)).toEqual(["d"]);
    expect(modoDaUrl("carretas")).toBe("carretas");
    expect(modoDaUrl("x")).toBe("proprios");
    expect(modoDaUrl(undefined)).toBe("proprios");
  });
});

describe("seletor de equipamento", () => {
  it("só ativos, sem o sentinela, rótulo 'COD · Nome', ordem por código ou nome", () => {
    const opcoes = opcoesDeEquipamento([
      equipamento({ id: "b", codigo: "EQ-02", descricao: "Rolo" }),
      equipamento({ id: "a", codigo: null, tipo: null, descricao: "Caminhão pipa" }),
      equipamento({ id: "c", codigo: "EQ-01", descricao: "Escavadeira" }),
      equipamento({ id: "x", codigo: "EQ-00", descricao: "Parado", ativo: false }),
      equipamento({ id: "o", codigo: null, descricao: "Outros", sentinela: true }),
    ]);
    expect(opcoes).toEqual([
      { valor: "a", rotulo: "Caminhão pipa" },
      { valor: "c", rotulo: "EQ-01 · Escavadeira" },
      { valor: "b", rotulo: "EQ-02 · Rolo" },
    ]);
  });
});

describe("detecção sobre a base", () => {
  it("o 'Outros' dá D1 e não entra no D5; o equipamento real parado entra", () => {
    const saidas = [montarSaidaBase(linha({ id: "s-outros", equipamento_id: OUTROS, data: "2026-09-20T12:00:00Z" }), new Set([OUTROS]), CENTROS)];
    const base: BaseCombustivel = {
      saidas,
      equipamentos: [equipamento(), equipamento({ id: OUTROS, codigo: null, descricao: "Outros", sentinela: true })],
      combustivelNome: new Map([["diesel", "Diesel S10"]]),
      obraNome: new Map([["obra-9", "Obra 009"]]),
      tanques: [],
      transportadoraNome: new Map(),
    };
    const ids = detectarNaBase(base, saidas, new Date("2026-09-23T15:00:00Z")).map((a) => a.id);
    expect(ids).toEqual(["D1-s-outros", `D5-${ESCAVADEIRA}`]);
  });
});
