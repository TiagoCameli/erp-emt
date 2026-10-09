import { describe, expect, it } from "vitest";

import {
  facetarFilaAReceber,
  VALORES_FILTROS_A_RECEBER_VAZIOS,
  type ValoresFiltrosAReceber,
} from "@/modules/financeiro/recebimentos/fila-a-receber";
import type { ParcelaAReceber } from "@/modules/financeiro/recebimentos/queries";

const OBRA = "obra";
const ETAPA_1 = "obra-etapa-1";
const ETAPA_2 = "obra-etapa-2";
const ESCRITORIO = "escritorio";

/** A árvore: a obra tem duas etapas; o escritório não tem filho. */
const ARVORE: Record<string, string[]> = {
  [OBRA]: [OBRA, ETAPA_1, ETAPA_2],
  [ETAPA_1]: [ETAPA_1],
  [ETAPA_2]: [ETAPA_2],
  [ESCRITORIO]: [ESCRITORIO],
};

const subarvoreDe = (id: string) => new Set(ARVORE[id] ?? [id]);

function parcela(troca: Partial<ParcelaAReceber> = {}): ParcelaAReceber {
  return {
    id: "p",
    lancamentoId: "l",
    lancamentoNumero: "LAN-2026-0001",
    numeroParcela: 1,
    descricao: "Medição 08/2026",
    categoriaNome: "Medições de obra",
    numeroDocumento: "370",
    clienteId: "dnit",
    clienteNome: "DNIT",
    contaBancariaId: "bb",
    contaBancariaNome: "Banco do Brasil",
    dataVencimento: "2026-10-20",
    valor: 1000,
    status: "pendente",
    centroCustoRotulo: null,
    categoriaId: "medicao",
    mesCompetencia: "2026-08-01",
    centroCustoIds: [ETAPA_1],
    ...troca,
  };
}

function filtrar(
  parcelas: ParcelaAReceber[],
  troca: Partial<ValoresFiltrosAReceber>,
) {
  const valores = { ...VALORES_FILTROS_A_RECEBER_VAZIOS, ...troca };
  const subarvore =
    valores.centroIds.length === 0
      ? null
      : new Set(valores.centroIds.flatMap((id) => [...subarvoreDe(id)]));
  return facetarFilaAReceber(parcelas, valores, subarvore, subarvoreDe);
}

describe("facetarFilaAReceber", () => {
  const naEtapa = parcela({ id: "etapa" });
  const noEscritorio = parcela({
    id: "escritorio",
    centroCustoIds: [ESCRITORIO],
    categoriaId: "outras",
    mesCompetencia: "2026-09-01",
    status: "aprovado",
  });
  const dividida = parcela({ id: "dividida", centroCustoIds: [ESCRITORIO, ETAPA_2] });
  const todas = [naEtapa, noEscritorio, dividida];

  it("sem filtro devolve a fila inteira", () => {
    expect(filtrar(todas, {}).linhas).toHaveLength(3);
  });

  it("centro raiz alcança as etapas dela", () => {
    const { linhas } = filtrar(todas, { centroIds: [OBRA] });
    expect(linhas.map((p) => p.id)).toEqual(["etapa", "dividida"]);
  });

  it("receita dividida aparece filtrando por qualquer um dos centros", () => {
    const { linhas } = filtrar(todas, { centroIds: [ESCRITORIO] });
    expect(linhas.map((p) => p.id)).toEqual(["escritorio", "dividida"]);
  });

  it("etapa filtra só a etapa", () => {
    const { linhas } = filtrar(todas, { centroIds: [ETAPA_1] });
    expect(linhas.map((p) => p.id)).toEqual(["etapa"]);
  });

  it("filtra por categoria, status e mês de competência", () => {
    expect(filtrar(todas, { categoria: "outras" }).linhas.map((p) => p.id)).toEqual([
      "escritorio",
    ]);
    expect(filtrar(todas, { status: "aprovado" }).linhas.map((p) => p.id)).toEqual([
      "escritorio",
    ]);
    expect(filtrar(todas, { mes: "2026-08" }).linhas.map((p) => p.id)).toEqual([
      "etapa",
      "dividida",
    ]);
  });

  it("o centro só oferece o que sobra depois dos outros filtros", () => {
    const { opcoes } = filtrar(todas, { categoria: "outras" });
    const base = [
      { valor: OBRA, rotulo: "Obra" },
      { valor: ESCRITORIO, rotulo: "Escritório" },
    ];
    expect(opcoes("centro", base).map((o) => o.valor)).toEqual([ESCRITORIO]);
  });
});
