// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  aplicarFiltrosAbastecimentos,
  inicioDoDia,
  inicioDoDiaSeguinte,
  lerFiltrosAbastecimentos,
  lerSaidaDoLink,
  rotaDoAbastecimento,
  TAMANHO_MAXIMO_ABASTECIMENTOS,
  TAMANHO_PADRAO_ABASTECIMENTOS,
} from "@/modules/combustivel/abastecimentos/filtros";

const ID = "11111111-1111-4111-8111-111111111111";

describe("lerFiltrosAbastecimentos", () => {
  it("sem parâmetro: página 1, tamanho padrão, nada filtrado", () => {
    expect(lerFiltrosAbastecimentos({})).toEqual({
      pagina: 0,
      tamanho: TAMANHO_PADRAO_ABASTECIMENTOS,
      de: undefined,
      ate: undefined,
      tanqueId: undefined,
      equipamentoId: undefined,
      transportadoraId: undefined,
      tipo: undefined,
      origem: undefined,
      canal: undefined,
    });
  });

  it("valida cada parâmetro e ignora o inválido", () => {
    const f = lerFiltrosAbastecimentos({
      pagina: "3",
      tamanho: "9999",
      de: "2026-09-01",
      ate: "2026-02-31",
      tanque: ID,
      equipamento: "nao-e-id",
      transportadora: ID,
      tipo: "carreta_transportadora",
      origem: "posto",
      canal: "celular",
    });
    expect(f).toMatchObject({
      pagina: 2,
      tamanho: TAMANHO_MAXIMO_ABASTECIMENTOS,
      de: "2026-09-01",
      ate: undefined,
      tanqueId: ID,
      equipamentoId: undefined,
      transportadoraId: ID,
      tipo: "carreta_transportadora",
      origem: undefined,
      canal: "celular",
    });
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
});

describe("dia de Rio Branco em instantes", () => {
  it("início do dia e começo do dia seguinte, virando mês e ano", () => {
    expect(inicioDoDia("2026-09-20")).toBe("2026-09-20T00:00:00-05:00");
    expect(inicioDoDiaSeguinte("2026-09-30")).toBe("2026-10-01T00:00:00-05:00");
    expect(inicioDoDiaSeguinte("2026-12-31")).toBe("2027-01-01T00:00:00-05:00");
  });
});

describe("aplicarFiltrosAbastecimentos", () => {
  it("cada filtro vira a coluna certa; o 'até' é exclusivo no dia seguinte", () => {
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
    };
    aplicarFiltrosAbastecimentos(consulta, {
      de: "2026-09-01",
      ate: "2026-09-30",
      tanqueId: ID,
      equipamentoId: ID,
      transportadoraId: ID,
      tipo: "equipamento_proprio",
      origem: "tanque",
      canal: "computador",
    });
    expect(chamadas).toEqual([
      "gte data 2026-09-01T00:00:00-05:00",
      "lt data 2026-10-01T00:00:00-05:00",
      `eq tanque_id ${ID}`,
      `eq equipamento_id ${ID}`,
      `eq transportadora_id ${ID}`,
      "eq tipo_consumidor equipamento_proprio",
      "eq origem tanque",
      "eq canal computador",
    ]);
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
