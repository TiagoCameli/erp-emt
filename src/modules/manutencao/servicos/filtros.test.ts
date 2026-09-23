import { describe, expect, it } from "vitest";

import {
  aplicarFiltrosServicos,
  lerFiltrosServicos,
  padraoBuscaOs,
  TAMANHO_MAXIMO_SERVICOS,
  TAMANHO_PADRAO_SERVICOS,
  type ConsultaFiltravelOs,
} from "@/modules/manutencao/servicos/filtros";

const EQUIP = "11111111-1111-4111-8111-111111111111";

describe("lerFiltrosServicos", () => {
  it("sem parâmetro: primeira página, tamanho padrão, sem filtro", () => {
    expect(lerFiltrosServicos({})).toEqual({
      pagina: 0,
      tamanho: TAMANHO_PADRAO_SERVICOS,
      status: [],
      equipamentoId: undefined,
      tipo: undefined,
      conclusaoDe: undefined,
      conclusaoAte: undefined,
      busca: undefined,
    });
  });

  it("status múltiplo sai na ordem do catálogo e descarta o inválido", () => {
    expect(lerFiltrosServicos({ status: "concluida,xyz,aberta,aberta" }).status).toEqual(["aberta", "concluida"]);
  });

  it("página base 1 na URL vira base 0; tamanho tem teto", () => {
    const filtros = lerFiltrosServicos({ pagina: "3", tamanho: "10000" });
    expect(filtros.pagina).toBe(2);
    expect(filtros.tamanho).toBe(TAMANHO_MAXIMO_SERVICOS);
  });

  it("equipamento só uuid; tipo só do catálogo", () => {
    expect(lerFiltrosServicos({ equipamento: "abc", tipo: "pintura" })).toMatchObject({
      equipamentoId: undefined,
      tipo: undefined,
    });
    expect(lerFiltrosServicos({ equipamento: EQUIP, tipo: "troca_oleo" })).toMatchObject({
      equipamentoId: EQUIP,
      tipo: "troca_oleo",
    });
  });

  it("período de conclusão: data inválida some, invertido troca de lado", () => {
    expect(lerFiltrosServicos({ conclusaoDe: "2026-02-31" }).conclusaoDe).toBeUndefined();
    expect(lerFiltrosServicos({ conclusaoDe: "2026-09-30", conclusaoAte: "2026-09-01" })).toMatchObject({
      conclusaoDe: "2026-09-01",
      conclusaoAte: "2026-09-30",
    });
  });
});

/** Builder falso que só registra as chamadas, na ordem. */
interface Falsa extends ConsultaFiltravelOs<Falsa> {
  chamadas: string[];
}

function consultaFalsa(): Falsa {
  const chamadas: string[] = [];
  const consulta: Falsa = {
    chamadas,
    eq: (coluna, valor) => (chamadas.push(`eq ${coluna} ${valor}`), consulta),
    gte: (coluna, valor) => (chamadas.push(`gte ${coluna} ${valor}`), consulta),
    lte: (coluna, valor) => (chamadas.push(`lte ${coluna} ${valor}`), consulta),
    in: (coluna, valores) => (chamadas.push(`in ${coluna} ${valores.join(",")}`), consulta),
    or: (filtro) => (chamadas.push(`or ${filtro}`), consulta),
  };
  return consulta;
}

describe("aplicarFiltrosServicos", () => {
  it("sem filtro não mexe na consulta", () => {
    const consulta = consultaFalsa();
    aplicarFiltrosServicos(consulta, { status: [] });
    expect(consulta.chamadas).toEqual([]);
  });

  it("aplica todos os filtros nas colunas certas (data_conclusao para o período)", () => {
    const consulta = consultaFalsa();
    aplicarFiltrosServicos(consulta, {
      status: ["aberta", "em_execucao"],
      equipamentoId: EQUIP,
      tipo: "corretiva",
      conclusaoDe: "2026-01-01",
      conclusaoAte: "2026-01-31",
      busca: "OS-2026",
    });
    expect(consulta.chamadas).toEqual([
      "in status aberta,em_execucao",
      `eq equipamento_id ${EQUIP}`,
      "eq tipo corretiva",
      "gte data_conclusao 2026-01-01",
      "lte data_conclusao 2026-01-31",
      "or numero.ilike.%OS-2026%,numero_legado.ilike.%OS-2026%,descricao.ilike.%OS-2026%",
    ]);
  });

  it("busca só com caractere proibido não vira filtro que casa tudo", () => {
    const consulta = consultaFalsa();
    aplicarFiltrosServicos(consulta, { status: [], busca: "(,)" });
    expect(consulta.chamadas).toEqual([]);
  });
});

describe("padraoBuscaOs", () => {
  it("tira o que quebra o or() do PostgREST", () => {
    expect(padraoBuscaOs('bomba, (hidr)"')).toBe("%bomba hidr%");
  });
});
