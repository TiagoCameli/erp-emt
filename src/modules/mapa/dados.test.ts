import { describe, expect, it } from "vitest";

import {
  extrasPorLocal,
  paraEstadoMapa,
  paraFichaNumeros,
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

  it("lê obras, tanques, depósitos e locais sem ponto (v1.7), e tolera a RPC antiga sem eles", () => {
    const estado = paraEstadoMapa({
      ...bruto,
      obras: [
        {
          id: "o1",
          nome: "003 - Ramal",
          cor: null,
          tipo_obra: "rodovia",
          no_mapa: true,
          lng: "-72.7",
          lat: -7.63,
        },
        {
          id: "o2",
          nome: "Juruá FM",
          cor: "#3E7744",
          tipo_obra: "outra",
          no_mapa: false,
          lng: null,
          lat: null,
        },
      ],
      tanques: [
        {
          id: "t1",
          nome: "Tanque Patio Colorado",
          apelido: null,
          uso: "combustivel",
          eh_externo: false,
          localidade_id: "l1",
          equipamento_id: null,
        },
      ],
      depositos: [
        { id: "d1", nome: "Almoxarifado Central", localidade_id: null },
        {
          id: "d2",
          nome: "Depósito Gregório",
          localidade_id: null,
          largura_m: "4.0",
          comprimento_m: 6.5,
          altura_m: 3,
        },
      ],
      localidades_sem_posicao: [{ id: "l9", nome: "Escola", tipo: "canteiro" }],
    });
    if (!estado) throw new Error("estado nulo");
    expect(estado.obras[0]).toEqual({
      id: "o1",
      nome: "003 - Ramal",
      cor: null,
      tipoObra: "rodovia",
      noMapa: true,
      pos: [-72.7, -7.63],
    });
    expect(estado.obras[1].pos).toBeNull();
    expect(estado.tanques[0].localidadeId).toBe("l1");
    expect(estado.tanques[0].apelido).toBe("");
    expect(estado.depositos[0].localidadeId).toBeNull();
    // Sem a chave (RPC antiga) o tamanho é nulo e a tela usa o padrão; com ela, número.
    expect(estado.depositos[0].larguraM).toBeNull();
    expect(estado.depositos[1]).toMatchObject({
      larguraM: 4,
      comprimentoM: 6.5,
      alturaM: 3,
    });
    expect(estado.localidadesSemPosicao).toEqual([
      { id: "l9", nome: "Escola", tipo: "canteiro", tipos: ["canteiro"] },
    ]);
    const antigo = paraEstadoMapa(bruto);
    expect(antigo?.obras).toEqual([]);
    expect(antigo?.tanques).toEqual([]);
    expect(antigo?.fretesEmRota).toEqual([]);
  });

  it("frete em rota: traçado do Frete vira [lng, lat]; sem traçado, a reta origem → destino", () => {
    const estado = paraEstadoMapa({
      ...bruto,
      fretes_em_rota: [
        {
          id: "f1",
          equipamento_id: "cs3",
          criado_em: "2026-10-16T13:29:29Z",
          material: "BRITA 1",
          peso: "47.0000",
          valor_total: "12346.90",
          valor_material: null,
          horas: "10.7000",
          tracado: [
            [-9.8188, -66.2167],
            [-9.7495, -66.2172],
          ],
        },
        {
          id: "f2",
          origem_lng: -66.2,
          origem_lat: -9.8,
          destino_lng: -72.6,
          destino_lat: -7.6,
          tracado: null,
        },
      ],
    });
    const [f1, f2] = estado?.fretesEmRota ?? [];
    expect(f1.caminho).toEqual([
      [-66.2167, -9.8188],
      [-66.2172, -9.7495],
    ]);
    expect(f1.peso).toBe(47);
    expect(f1.valorTotal).toBe(12346.9);
    // sem permissão de ver Fretes o banco manda null: não vira zero
    expect(f1.valorMaterial).toBeNull();
    expect(f2.caminho).toEqual([
      [-66.2, -9.8],
      [-72.6, -7.6],
    ]);
    expect(f2.equipamentoId).toBeNull();
  });

  it("resume o que está em cada local, sem contar tanque de comboio", () => {
    const t = (
      id: string,
      localidadeId: string | null,
      equipamentoId: string | null = null,
    ) => ({
      id,
      nome: id,
      apelido: "",
      uso: "combustivel",
      ehExterno: false,
      localidadeId,
      equipamentoId,
      pos: null,
      capacidade: null,
      nivel: null,
      unidade: "L",
      insumo: "",
    });
    const extras = extrasPorLocal(
      [
        t("a", "l1"),
        t("b", "l1"),
        t("c", "l2"),
        t("meloza", "l1", "eq1"),
        t("solto", null),
      ],
      [{ id: "d1", nome: "Almox", localidadeId: "l2", pos: null }],
    );
    expect(extras.get("l1")).toBe("2 tanques");
    expect(extras.get("l2")).toBe("1 tanque · 1 depósito");
    expect(extras.size).toBe(2);
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

describe("paraFichaNumeros", () => {
  it("lê os números da RPC (texto vira número) e tolera máquina sem abastecimento nem OS", () => {
    const f = paraFichaNumeros({
      ultimo_abastecimento: {
        data: "2026-07-23T17:03:00+00:00",
        litros: "100.0000",
        valor: 615,
        tanque: "Meloza EMT",
      },
      consumo_30_dias: { litros: 0, valor: 0, abastecimentos: 0 },
      ultima_manutencao: {
        numero: "OS-2026-0077",
        tipo: "corretiva",
        status: "concluida",
        abertura: "2026-08-08",
        conclusao: "2026-08-06",
        descricao: "TROCA DE JUNTA",
        custo: "184.0000",
      },
      gasto_manutencao: {
        total: 61225.17,
        ultimos_12_meses: 21242.29,
        ano: 21160.29,
        mes_passado: 0,
        mes_passado_ref: "2026-09-01",
        ano_ref: 2026,
        tem_centro: true,
        aquisicao: "1574386.50",
      },
      custo_os: {
        total: "10612.9700",
        ultimos_12_meses: "10612.9700",
        ano: "10612.9700",
        mes_passado: 0,
        quantidade: 3,
      },
      aquisicao: { valor: "385000.00", data: "2023-05-12" },
    });
    expect(f?.aquisicao).toEqual({ valor: 385000, data: "2023-05-12" });
    expect(f?.custoOs).toEqual({
      total: 10612.97,
      ultimos12Meses: 10612.97,
      ano: 10612.97,
      mesPassado: 0,
      quantidade: 3,
    });
    expect(f?.ultimoAbastecimento?.litros).toBe(100);
    expect(f?.ultimaManutencao?.custo).toBe(184);
    expect(f?.gastoManutencao.total).toBe(61225.17);
    expect(f?.gastoManutencao.mesPassadoRef).toBe("2026-09-01");
    expect(f?.gastoManutencao.aquisicao).toBe(1574386.5);
    const vazio = paraFichaNumeros({
      ultimo_abastecimento: null,
      consumo_30_dias: { litros: 0, valor: 0, abastecimentos: 0 },
      ultima_manutencao: null,
      gasto_manutencao: {
        total: 0,
        ultimos_12_meses: 0,
        ano: 0,
        mes_passado: 0,
        mes_passado_ref: "2026-09-01",
        ano_ref: 2026,
        tem_centro: false,
      },
    });
    expect(vazio?.ultimoAbastecimento).toBeNull();
    // Sem a chave (RPC antiga) ou com valor nulo (não informado no cadastro): a ficha não mostra.
    expect(vazio?.aquisicao).toEqual({ valor: null, data: null });
    expect(
      paraFichaNumeros({ aquisicao: { valor: null, data: "2023-05-12" } })
        ?.aquisicao.valor,
    ).toBeNull();
    expect(vazio?.ultimaManutencao).toBeNull();
    expect(vazio?.gastoManutencao.temCentro).toBe(false);
    // RPC antiga, sem custo_os: zero OS, não quebra
    expect(vazio?.custoOs.quantidade).toBe(0);
    expect(vazio?.gastoManutencao.aquisicao).toBe(0);
    expect(paraFichaNumeros(null)).toBeNull();
  });
});
