// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  aplicarFiltrosAbastecimentos,
  condicaoExternas,
  inicioDoDia,
  inicioDoDiaSeguinte,
  lerFiltrosAbastecimentos,
  lerSaidaDoLink,
  rotaDoAbastecimento,
  TAMANHO_MAXIMO_ABASTECIMENTOS,
  TAMANHO_PADRAO_ABASTECIMENTOS,
} from "@/modules/combustivel/abastecimentos/filtros";

const ID = "11111111-1111-4111-8111-111111111111";
const OUTRO = "33333333-3333-4333-8333-333333333333";

describe("lerFiltrosAbastecimentos", () => {
  it("sem parâmetro: página 1, 25 por página, modo próprios, todas, nada filtrado", () => {
    expect(lerFiltrosAbastecimentos({})).toEqual({
      pagina: 0,
      tamanho: TAMANHO_PADRAO_ABASTECIMENTOS,
      modo: "proprios",
      tipo: "equipamento_proprio",
      de: undefined,
      ate: undefined,
      obraIds: [],
      equipamentoIds: [],
      tanqueIds: [],
      combustivelIds: [],
      operadores: [],
      transportadoraIds: [],
      placas: [],
      visao: "todas",
      origensExternas: [],
      origem: undefined,
      canal: undefined,
      excluidos: undefined,
      ordem: "data",
      direcao: "desc",
    });
    expect(TAMANHO_PADRAO_ABASTECIMENTOS).toBe(25);
  });

  it("o modo do cabeçalho decide o tipo de consumidor", () => {
    expect(lerFiltrosAbastecimentos({ modo: "carretas" })).toMatchObject({
      modo: "carretas",
      tipo: "carreta_transportadora",
    });
    expect(lerFiltrosAbastecimentos({ modo: "proprios" }).tipo).toBe("equipamento_proprio");
    // Modo desconhecido cai no padrão, nunca mistura os dois.
    expect(lerFiltrosAbastecimentos({ modo: "todos" }).tipo).toBe("equipamento_proprio");
  });

  it("equipamento só em próprios; transportadora e placa só em carretas", () => {
    const params = { equipamento: ID, transportadora: ID, placa: "ABC1D23" };
    expect(lerFiltrosAbastecimentos(params)).toMatchObject({
      equipamentoIds: [ID],
      transportadoraIds: [],
      placas: [],
    });
    expect(lerFiltrosAbastecimentos({ ...params, modo: "carretas" })).toMatchObject({
      equipamentoIds: [],
      transportadoraIds: [ID],
      placas: ["ABC1D23"],
    });
  });

  it("valida cada parâmetro e ignora o inválido; listas do recorte por vírgula", () => {
    const f = lerFiltrosAbastecimentos({
      pagina: "3",
      tamanho: "9999",
      de: "2026-09-01",
      ate: "2026-02-31",
      tanque: `${ID},nao-e-id,${OUTRO}`,
      equipamento: "nao-e-id",
      obra: [ID, OUTRO],
      combustivel: ID,
      origem: "posto",
      canal: "celular",
    });
    expect(f).toMatchObject({
      pagina: 2,
      tamanho: TAMANHO_MAXIMO_ABASTECIMENTOS,
      de: "2026-09-01",
      ate: undefined,
      tanqueIds: [ID, OUTRO],
      equipamentoIds: [],
      obraIds: [ID, OUTRO],
      combustivelIds: [ID],
      origem: undefined,
      canal: "celular",
    });
  });

  it("sub-aba e origens externas; as origens só valem em Externas", () => {
    expect(lerFiltrosAbastecimentos({ visao: "externas", externa: "tanque_externo,dinheiro,lixo" })).toMatchObject({
      visao: "externas",
      origensExternas: ["dinheiro", "tanque_externo"],
    });
    expect(lerFiltrosAbastecimentos({ visao: "internas", externa: "dinheiro" })).toMatchObject({
      visao: "internas",
      origensExternas: [],
    });
    expect(lerFiltrosAbastecimentos({ visao: "outra" }).visao).toBe("todas");
  });

  it("ordem só pelas colunas que o servidor ordena", () => {
    expect(lerFiltrosAbastecimentos({ ordem: "litros", direcao: "asc" })).toMatchObject({ ordem: "litros", direcao: "asc" });
    expect(lerFiltrosAbastecimentos({ ordem: "consumidor", direcao: "x" })).toMatchObject({ ordem: "data", direcao: "desc" });
  });

  it("'Mostrar excluídos' só com ?excluidos=sim (a página ainda confere a permissão)", () => {
    expect(lerFiltrosAbastecimentos({ excluidos: "sim" }).excluidos).toBe(true);
    expect(lerFiltrosAbastecimentos({ excluidos: "1" }).excluidos).toBeUndefined();
    expect(lerFiltrosAbastecimentos({}).excluidos).toBeUndefined();
  });

  it("período invertido é trocado de lado", () => {
    expect(lerFiltrosAbastecimentos({ de: "2026-09-30", ate: "2026-09-01" })).toMatchObject({
      de: "2026-09-01",
      ate: "2026-09-30",
    });
  });

  it("sem período na URL, o padrão (os últimos 30 dias da origem); com período, o da URL", () => {
    const periodoPadrao = { de: "2026-08-25", ate: "2026-09-23" };
    expect(lerFiltrosAbastecimentos({}, { periodoPadrao })).toMatchObject(periodoPadrao);
    expect(lerFiltrosAbastecimentos({ de: "2026-09-10" }, { periodoPadrao })).toMatchObject({
      de: "2026-09-10",
      ate: undefined,
    });
  });
});

describe("dia de Rio Branco em instantes", () => {
  it("início do dia e começo do dia seguinte, virando mês e ano", () => {
    expect(inicioDoDia("2026-09-20")).toBe("2026-09-20T00:00:00-05:00");
    expect(inicioDoDiaSeguinte("2026-09-30")).toBe("2026-10-01T00:00:00-05:00");
    expect(inicioDoDiaSeguinte("2026-12-31")).toBe("2027-01-01T00:00:00-05:00");
  });
});

function consultaEspia() {
  const chamadas: string[] = [];
  const consulta = {
    eq(coluna: string, valor: string) {
      chamadas.push(`eq ${coluna} ${valor}`);
      return consulta;
    },
    gte(coluna: string, valor: string) {
      chamadas.push(`gte ${coluna} ${valor}`);
      return consulta;
    },
    lt(coluna: string, valor: string) {
      chamadas.push(`lt ${coluna} ${valor}`);
      return consulta;
    },
    in(coluna: string, valores: readonly string[]) {
      chamadas.push(`in ${coluna} ${valores.join(",")}`);
      return consulta;
    },
    or(filtros: string) {
      chamadas.push(`or ${filtros}`);
      return consulta;
    },
    filter(coluna: string, operador: string, valor: unknown) {
      chamadas.push(`filter ${coluna} ${operador} ${String(valor)}`);
      return consulta;
    },
  };
  return { consulta, chamadas };
}

const EXTERNO = "22222222-2222-4222-8222-222222222222";

describe("aplicarFiltrosAbastecimentos", () => {
  it("o modo vira tipo_consumidor; cada filtro, a coluna certa; o 'até' é exclusivo", () => {
    const { consulta, chamadas } = consultaEspia();
    const filtros = lerFiltrosAbastecimentos({
      de: "2026-09-01",
      ate: "2026-09-30",
      tanque: ID,
      equipamento: ID,
      obra: OUTRO,
      combustivel: ID,
      operador: "Joao",
      origem: "tanque",
      canal: "computador",
    });
    aplicarFiltrosAbastecimentos(consulta, filtros, { idsTanquesExternos: [] });
    expect(chamadas).toEqual([
      "eq tipo_consumidor equipamento_proprio",
      "gte data 2026-09-01T00:00:00-05:00",
      "lt data 2026-10-01T00:00:00-05:00",
      `in filtro_obra.centro_custo_id ${OUTRO}`,
      "filter filtro_obra not.is null",
      `in equipamento_id ${ID}`,
      `in tanque_id ${ID}`,
      `in insumo_id ${ID}`,
      "in motorista Joao",
      "eq origem tanque",
      "eq canal computador",
    ]);
  });

  it("modo carretas filtra as carretas, com transportadora e placa", () => {
    const { consulta, chamadas } = consultaEspia();
    aplicarFiltrosAbastecimentos(
      consulta,
      lerFiltrosAbastecimentos({ modo: "carretas", transportadora: ID, placa: "ABC1D23" }),
      { idsTanquesExternos: [] },
    );
    expect(chamadas).toEqual([
      "eq tipo_consumidor carreta_transportadora",
      `in transportadora_id ${ID}`,
      "in placa ABC1D23",
    ]);
  });

  it("Internas: do tanque, e o tanque não é de terceiro", () => {
    const { consulta, chamadas } = consultaEspia();
    aplicarFiltrosAbastecimentos(consulta, lerFiltrosAbastecimentos({ visao: "internas" }), {
      idsTanquesExternos: [EXTERNO],
    });
    expect(chamadas).toEqual([
      "eq tipo_consumidor equipamento_proprio",
      "eq origem tanque",
      "filter tanque_id not.is null",
      `filter tanque_id not.in (${EXTERNO})`,
    ]);
  });

  it("a contagem de uma sub-aba reusa o filtro com outra visão", () => {
    const { consulta, chamadas } = consultaEspia();
    aplicarFiltrosAbastecimentos(consulta, lerFiltrosAbastecimentos({ visao: "internas" }), { idsTanquesExternos: [] }, "externas");
    expect(chamadas).toEqual(["eq tipo_consumidor equipamento_proprio", "or origem.in.(dinheiro,requisicao)"]);
  });
});

describe("condicaoExternas", () => {
  it("posto ou tanque de terceiro; vazio = as três origens", () => {
    expect(condicaoExternas([], [EXTERNO])).toBe(
      `origem.in.(dinheiro,requisicao),and(origem.eq.tanque,tanque_id.in.(${EXTERNO}))`,
    );
    expect(condicaoExternas(["requisicao"], [EXTERNO])).toBe("origem.in.(requisicao)");
    expect(condicaoExternas(["tanque_externo"], [EXTERNO])).toBe(`and(origem.eq.tanque,tanque_id.in.(${EXTERNO}))`);
  });

  it("linha de controle: só tanque externo sem tanque de terceiro não casa nada", () => {
    expect(condicaoExternas(["tanque_externo"], [])).toBe("id.is.null");
  });
});

describe("lerSaidaDoLink (link das Anomalias)", () => {
  it("uuid válido abre o detalhe; o resto é ignorado", () => {
    expect(lerSaidaDoLink({ saida: ID })).toBe(ID);
    expect(rotaDoAbastecimento(ID)).toBe(`/combustivel/abastecimentos/${ID}`);
    expect(lerSaidaDoLink({})).toBeNull();
    expect(lerSaidaDoLink({ saida: "nao-e-id" })).toBeNull();
    expect(lerSaidaDoLink({ saida: `${ID}' or 1=1` })).toBeNull();
    expect(lerSaidaDoLink({ saida: [ID, ID] })).toBeNull();
  });

  it("o parâmetro do link não vira filtro da lista", () => {
    expect(lerFiltrosAbastecimentos({ saida: ID })).toEqual(lerFiltrosAbastecimentos({}));
  });
});
