import { describe, expect, it } from "vitest";

import {
  agruparRelatorio,
  mesAnteriorDe,
  mesDoRelatorio,
  paraCentrosEquipamento,
  ROTULO_MOTIVO_CENTRO,
  rotuloMes,
  rotuloMotivoCentro,
} from "@/modules/mapa/centros";

const RAIZ = "11111111-1111-4111-8111-111111111111";
const SEM = "22222222-2222-4222-8222-222222222222";

describe("paraCentrosEquipamento", () => {
  it("lê o JSON de fn_mapa_centros_equipamento", () => {
    const r = paraCentrosEquipamento({
      varios_centros: true,
      atual: {
        centro_id: SEM,
        centro_nome: "Equipamento Sem Alocação",
        motivo: "varios_centros",
        desde: "2026-10-15",
      },
      mes: [
        { centro_id: SEM, centro_nome: "Equipamento Sem Alocação", dias: 2 },
        { centro_id: RAIZ, centro_nome: "009 - BR-364", dias: "14" },
      ],
      periodos: [
        {
          centro_id: SEM,
          centro_nome: "Equipamento Sem Alocação",
          motivo: "varios_centros",
          de: "2026-10-15",
          ate: "2026-10-16",
          dias: 2,
        },
      ],
    });
    expect(r).toEqual({
      variosCentros: true,
      atual: {
        centroId: SEM,
        centroNome: "Equipamento Sem Alocação",
        motivo: "varios_centros",
        desde: "2026-10-15",
      },
      mes: [
        { centroId: SEM, centroNome: "Equipamento Sem Alocação", dias: 2 },
        { centroId: RAIZ, centroNome: "009 - BR-364", dias: 14 },
      ],
      periodos: [
        {
          centroId: SEM,
          centroNome: "Equipamento Sem Alocação",
          motivo: "varios_centros",
          de: "2026-10-15",
          ate: "2026-10-16",
          dias: 2,
        },
      ],
    });
  });

  it("máquina fora de funcionamento: sem centro atual e listas vazias", () => {
    expect(
      paraCentrosEquipamento({
        varios_centros: false,
        atual: null,
        mes: [],
        periodos: [],
      }),
    ).toEqual({ variosCentros: false, atual: null, mes: [], periodos: [] });
  });

  it("formato errado devolve null", () => {
    expect(paraCentrosEquipamento(null)).toBeNull();
    expect(paraCentrosEquipamento("x")).toBeNull();
    expect(paraCentrosEquipamento([1])).toBeNull();
  });
});

describe("agruparRelatorio", () => {
  const linhas = [
    { equipamentoId: "b", codigo: "EH-002", descricao: "Escavadeira", propriedade: "propria", centroId: SEM, centroNome: "Equipamento Sem Alocação", dias: 10 },
    { equipamentoId: "b", codigo: "EH-002", descricao: "Escavadeira", propriedade: "propria", centroId: RAIZ, centroNome: "009 - BR-364", dias: 6 },
    { equipamentoId: "a", codigo: "CB-001", descricao: "Caçamba", propriedade: "alugada", centroId: RAIZ, centroNome: "009 - BR-364", dias: 16 },
  ];

  it("soma por máquina e por centro", () => {
    const r = agruparRelatorio(linhas);
    expect(r.equipamentos.map((e) => [e.codigo, e.total])).toEqual([
      ["CB-001", 16],
      ["EH-002", 16],
    ]);
    expect(r.centros).toEqual([
      { id: RAIZ, nome: "009 - BR-364", total: 22 },
      { id: SEM, nome: "Equipamento Sem Alocação", total: 10 },
    ]);
    expect(r.equipamentos[1]?.dias).toEqual({ [SEM]: 10, [RAIZ]: 6 });
    expect(r.total).toBe(32);
  });

  it("vazio dá tudo vazio", () => {
    expect(agruparRelatorio([])).toEqual({ equipamentos: [], centros: [], total: 0 });
  });
});

describe("rótulos de motivo", () => {
  it("cobre os 11 motivos da regra", () => {
    expect(Object.keys(ROTULO_MOTIVO_CENTRO).sort()).toEqual(
      [
        "acoplado",
        "carreta_emt",
        "conserto",
        "em_rota",
        "obra",
        "obra_sem_centro",
        "parado",
        "quebrado_obra",
        "sem_obra",
        "sem_posicao",
        "varios_centros",
      ].sort(),
    );
    expect(rotuloMotivoCentro("obra")).toBe("Operando na obra");
    expect(rotuloMotivoCentro("desconhecido")).toBe("desconhecido");
  });
});

describe("mês do relatório", () => {
  it("aceita AAAA-MM válido e cai no mês de hoje fora disso", () => {
    expect(mesDoRelatorio("2026-09", "2026-10")).toBe("2026-09");
    expect(mesDoRelatorio("2026-13", "2026-10")).toBe("2026-10");
    expect(mesDoRelatorio(undefined, "2026-10")).toBe("2026-10");
    expect(mesDoRelatorio("x", "2026-10")).toBe("2026-10");
  });
  it("mês anterior vira o ano", () => {
    expect(mesAnteriorDe("2026-10")).toBe("2026-09");
    expect(mesAnteriorDe("2026-01")).toBe("2025-12");
  });
  it("rótulo por extenso", () => {
    expect(rotuloMes("2026-10")).toBe("outubro de 2026");
    expect(rotuloMes("2027-01")).toBe("janeiro de 2027");
  });
});
