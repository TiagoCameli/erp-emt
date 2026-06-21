/**
 * Lógica pura do módulo Gestão (BI). Sem banco, sem server-only: testável.
 *
 * Modelo de custo (decisão do plano 4.1, registrada em docs/decisoes.md):
 * o custo cai no centro de custo no CONSUMO, não na compra. Então o custo
 * gerencial por obra soma: consumo de estoque (material/combustível/peças) +
 * folha (folha_itens) + lançamentos rateados de origem 'os'/'diaria'/'manual'.
 * A compra (lançamento origem 'oc') é caixa/ativo e NÃO entra como custo, para
 * não contar duas vezes. Receita (origem 'fatura') também não é custo.
 */

/** Grupos de custo da obra. */
export type GrupoCusto =
  | "material"
  | "combustivel"
  | "manutencao"
  | "folha"
  | "servicos";

/** Nó de centro de custo (mínimo para resolver a obra). */
export interface NoCentroCusto {
  id: string;
  paiId: string | null;
  obraId: string | null;
}

/**
 * Mapeia cada centro de custo à obra a que pertence, subindo pelo pai até a
 * raiz e usando o obra_id do topo da cadeia. Robusto a níveis intermediários
 * sem obra_id. Centros sem obra na cadeia (Escritório, Manutenção) mapeiam null.
 */
export function resolverObraPorCentroCusto(
  nos: NoCentroCusto[],
): Map<string, string | null> {
  const porId = new Map(nos.map((no) => [no.id, no]));
  const cache = new Map<string, string | null>();

  function resolver(id: string, visitados: Set<string>): string | null {
    if (cache.has(id)) return cache.get(id) ?? null;
    const no = porId.get(id);
    if (!no || visitados.has(id)) return null;
    visitados.add(id);
    // O obra_id do próprio nó tem prioridade; senão sobe para o pai.
    const obra =
      no.obraId ?? (no.paiId ? resolver(no.paiId, visitados) : null);
    cache.set(id, obra);
    return obra;
  }

  for (const no of nos) resolver(no.id, new Set());
  return cache;
}

/** Categoria de insumo do consumo de estoque para o grupo de custo da obra. */
export function grupoDoConsumo(categoriaTipo: string | null): GrupoCusto {
  switch (categoriaTipo) {
    case "combustivel":
      return "combustivel";
    case "peca":
      return "manutencao";
    default:
      // material, oleo, betuminoso, servico -> material (insumo consumido).
      return "material";
  }
}

/** Origem do lançamento (a pagar) para o grupo de custo. */
export function grupoDoLancamento(origem: string): GrupoCusto | null {
  switch (origem) {
    case "os":
      return "manutencao";
    case "diaria":
      return "folha";
    case "manual":
      return "servicos";
    default:
      // 'oc' (compra = caixa/ativo) e 'fatura' (receita) não são custo aqui.
      return null;
  }
}

/** Custo por grupo de uma obra. */
export interface CustoPorGrupo {
  material: number;
  combustivel: number;
  manutencao: number;
  folha: number;
  servicos: number;
}

export function custoZerado(): CustoPorGrupo {
  return { material: 0, combustivel: 0, manutencao: 0, folha: 0, servicos: 0 };
}

/** Soma de todos os grupos. */
export function totalCusto(c: CustoPorGrupo): number {
  return c.material + c.combustivel + c.manutencao + c.folha + c.servicos;
}

/** Resultado gerencial de uma obra: medido menos custo. */
export interface MargemObra {
  medido: number;
  custo: number;
  margem: number;
  /** Margem percentual sobre o medido (0 quando medido = 0). */
  margemPct: number;
}

export function calcularMargem(medido: number, custo: number): MargemObra {
  const margem = round2(medido - custo);
  const margemPct = medido > 0 ? round2((margem / medido) * 100) : 0;
  return { medido: round2(medido), custo: round2(custo), margem, margemPct };
}

/** Percentual de avanço físico: medido sobre o valor contratual. */
export function avancoPercentual(medido: number, contratual: number): number {
  return contratual > 0 ? round2((medido / contratual) * 100) : 0;
}

/** Arredonda para 2 casas (dinheiro/percentual gerencial). */
export function round2(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}
