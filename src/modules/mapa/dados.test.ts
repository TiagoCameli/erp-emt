import { describe, expect, it } from "vitest";

import {
  paraEstadoMapa,
  poligonosDaArea,
  pontosDoTracado,
} from "@/modules/mapa/dados";
import {
  itemMovidoSchema,
  iniciarLocacaoSchema,
  marcarEstadoSchema,
  moverEquipamentosSchema,
} from "@/modules/mapa/schemas";

describe("paraEstadoMapa", () => {
  const bruto = {
    gerado_em: "2026-10-15T12:00:00+00:00",
    hoje: "2026-10-15",
    config: {
      snap_tracado_m: "250",
      snap_local_m: null,
      fornecedor_colorado: "f1",
      tipos_fora_do_mapa: ["Moto", 3],
    },
    modelos: [
      {
        chave: "escavadeira",
        nome: "Escavadeira",
        arquivo: "/mapa-modelos/escavadeira.glb",
        escala: "1.0",
        versao: 3,
      },
    ],
    equipamentos: [
      {
        id: "e1",
        codigo: "EH-001",
        descricao: "Escavadeira",
        tipo: "Escavadeira Hidráulica",
        propriedade: "propria",
        modelo_3d: "escavadeira",
        lng: "-72.45",
        lat: "-7.7",
        heading: null,
        fonte_posicao: "manual",
        estado: "operando",
        km: "650.25",
        os_abertas: "2",
        locacao: null,
      },
      {
        id: "e2",
        codigo: null,
        descricao: "Sem posição",
        estado: "sem_posicao",
        lng: null,
        lat: null,
        locacao: {
          id: "l1",
          locador_nome: "Colorado",
          tipo_aluguel: "dia",
          valor_unitario: "1500.00",
        },
      },
    ],
    fora_do_mapa: [
      {
        id: "e3",
        codigo: "CB-010",
        descricao: "Caçamba",
        propriedade: "colorado",
      },
    ],
    pessoas: [
      { id: "p1", nome: "João", funcao: "Operador", lng: null, lat: null },
    ],
    trechos: [
      {
        id: "t1",
        obra_id: "o1",
        obra_nome: "BR-364",
        nome: "Lote 09",
        km_inicial: "682.9",
        km_final: "620.9",
        cor: null,
        ordem: 1,
        tracado: {
          type: "MultiLineString",
          coordinates: [
            [
              [-72.5, -7.7],
              [-72.4, -7.7],
            ],
            [
              [-72.4, -7.7],
              [-72.3, -7.71],
            ],
          ],
        },
      },
      { id: "t2", nome: "sem traçado", tracado: null },
    ],
    areas: [
      {
        id: "a1",
        nome: "Pátio",
        tipo: "patio_obra",
        poligono: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        },
        centro_lng: 0.5,
        centro_lat: 0.3,
      },
    ],
    localidades: [
      { id: "l1", nome: "Colorado", tipo: "patio", lng: -72.69, lat: -7.62 },
      { id: "l2", nome: "Sem posição", tipo: "patio", lng: null, lat: null },
    ],
    frentes_hoje: [],
    fornecedores: [{ id: "f1", nome: "Colorado" }],
  };

  it("estreita o JSON da RPC, tolerando texto em número e campo faltando", () => {
    const estado = paraEstadoMapa(bruto);
    expect(estado).not.toBeNull();
    if (!estado) return;
    expect(estado.config).toEqual({
      snapTracadoM: 250,
      snapLocalM: 300,
      fornecedorColorado: "f1",
      tiposForaDoMapa: ["Moto"],
    });
    const [e1, e2] = estado.equipamentos;
    expect(e1.pos).toEqual([-72.45, -7.7]);
    expect(e1.heading).toBe(0);
    expect(e1.km).toBe(650.25);
    expect(e1.osAbertas).toBe(2);
    expect(e1.locacao).toBeNull();
    expect(e2.pos).toBeNull();
    expect(e2.codigo).toBe("");
    expect(e2.modelo3d).toBe("generico");
    expect(e2.locacao?.valorUnitario).toBe(1500);
    expect(e2.locacao?.tipoAluguel).toBe("dia");
    expect(estado.pessoas[0].pos).toBeNull();
    // trecho sem traçado sai; o MultiLineString vira os pedaços emendados
    expect(estado.trechos).toHaveLength(1);
    expect(estado.trechos[0].pontos).toHaveLength(4);
    expect(estado.trechos[0].kmInicial).toBe(682.9);
    // localidade sem coordenada sai
    expect(estado.localidades.map((l) => l.id)).toEqual(["l1"]);
    expect(estado.areas[0].poligonos[0][0]).toHaveLength(4);
    expect(estado.areas[0].centro).toEqual([0.5, 0.3]);
  });

  it("recusa formato inesperado", () => {
    expect(paraEstadoMapa(null)).toBeNull();
    expect(paraEstadoMapa({ equipamentos: "x" })).toBeNull();
    expect(paraEstadoMapa([])).toBeNull();
  });

  it("ignora ponto malformado e geometria de outro tipo", () => {
    expect(
      pontosDoTracado({
        type: "LineString",
        coordinates: [[1, 2], ["x", 3], [4]],
      }),
    ).toEqual([[1, 2]]);
    expect(pontosDoTracado({ type: "Point", coordinates: [1, 2] })).toEqual([]);
    expect(
      poligonosDaArea({
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
            ],
          ],
          [
            [
              [0, 0],
              [1, 0],
            ],
          ],
        ],
      }),
    ).toHaveLength(1);
  });
});

describe("schemas das actions", () => {
  it("mover exige coordenada válida e aceita estado só nos itens livres", () => {
    expect(
      moverEquipamentosSchema.safeParse({ itens: [], data: "2026-10-15" })
        .success,
    ).toBe(false);
    expect(
      itemMovidoSchema.safeParse({
        id: "c4e0f922-3aec-8c72-7089-225523e04557",
        lng: -72.4,
        lat: -7.7,
      }).success,
    ).toBe(true);
    expect(
      itemMovidoSchema.safeParse({
        id: "c4e0f922-3aec-8c72-7089-225523e04557",
        lng: 200,
        lat: -7.7,
      }).success,
    ).toBe(false);
    expect(
      itemMovidoSchema.safeParse({
        id: "c4e0f922-3aec-8c72-7089-225523e04557",
        lng: -72.4,
        lat: -7.7,
        estado: "voando",
      }).success,
    ).toBe(false);
    const ok = moverEquipamentosSchema.safeParse({
      itens: [
        {
          id: "c4e0f922-3aec-8c72-7089-225523e04557",
          lng: -72.4,
          lat: -7.7,
          estado: "parado",
        },
      ],
      data: "2026-10-15",
      motivo: "pátio",
    });
    expect(ok.success).toBe(true);
    expect(
      moverEquipamentosSchema.safeParse({
        itens: [
          { id: "c4e0f922-3aec-8c72-7089-225523e04557", lng: -72.4, lat: -7.7 },
        ],
        data: "15/10/2026",
      }).success,
    ).toBe(false);
  });

  it("marcar estado recusa estado fora da lista e aceita deslocamento", () => {
    expect(
      marcarEstadoSchema.safeParse({
        id: "c4e0f922-3aec-8c72-7089-225523e04557",
        estado: "sem_posicao",
      }).success,
    ).toBe(false);
    expect(
      marcarEstadoSchema.safeParse({
        id: "c4e0f922-3aec-8c72-7089-225523e04557",
        estado: "em_rota",
        motivo: "prancha",
        deslocamento: {
          origem: "Colorado",
          destino: "km 720",
          transporte: "prancha própria",
          previsao: "",
        },
      }).success,
    ).toBe(true);
  });

  it("locação exige máquina OU máquina nova, fornecedor e valor com duas casas", () => {
    const base = {
      equipamentoId: null,
      fornecedorId: "c4e0f922-3aec-8c72-7089-225523e04557",
      tipoAluguel: "dia",
      valorUnitario: 1500,
    };
    expect(iniciarLocacaoSchema.safeParse(base).success).toBe(false);
    expect(
      iniciarLocacaoSchema.safeParse({
        ...base,
        novo: { descricao: "Escavadeira 20 t", tipo: "Escavadeira Hidráulica" },
      }).success,
    ).toBe(true);
    expect(
      iniciarLocacaoSchema.safeParse({
        ...base,
        equipamentoId: "c4e0f922-3aec-8c72-7089-225523e04557",
        valorUnitario: 10.123,
      }).success,
    ).toBe(false);
    expect(
      iniciarLocacaoSchema.safeParse({
        ...base,
        equipamentoId: "c4e0f922-3aec-8c72-7089-225523e04557",
        inicio: "2026-10-15",
        fimPrevisto: "2026-10-01",
      }).success,
    ).toBe(false);
  });
});
