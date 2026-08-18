import { emLotes, LOTE_IDS_POSTGREST } from "@/lib/lotes-de-ids";
import { createClient } from "@/lib/supabase/server";

export interface EspelhoOrdemItem {
  id: string;
  insumoNome: string | null;
  unidade: string | null;
  quantidade: number;
  precoUnitario: number;
  /** quantidade x preço. Não é coluna do banco. */
  subtotal: number;
  /**
   * Chave real do agrupamento do rateio. `centros_custo` não tem unicidade em
   * `nome` (é árvore Obra > Etapa > Item; dois nós de nível 3 em obras
   * diferentes podem se chamar igual, ex: dois "Diesel"), então o rateio
   * NUNCA pode agrupar por nome — ver `porCentro` abaixo.
   */
  centroCustoId: string | null;
  centroCustoNome: string;
  centroCustoCodigo: string | null;
}

export interface EspelhoOrdemParcela {
  numeroParcela: number;
  dataVencimento: string | null;
  valor: number;
}

export interface EspelhoOrdemRateio {
  centroNome: string;
  centroCodigo: string | null;
  valor: number;
}

export interface EspelhoOrdem {
  id: string;
  numero: string | null;
  descricao: string | null;
  /** Soma dos itens, mantida por trigger. NÃO inclui frete nem impostos. */
  valorTotal: number;
  frete: number;
  outrasDespesas: number;
  impostos: number;
  desconto: number;
  status: string;
  motivoRejeicao: string | null;
  dataCompra: string | null;
  mesCompetencia: string | null;
  observacoes: string | null;
  fornecedorNome: string | null;
  categoriaNome: string | null;
  cotacaoNumero: string | null;
  condicaoDescricao: string | null;
  itens: EspelhoOrdemItem[];
  parcelas: EspelhoOrdemParcela[];
  /** Derivado dos itens: a OC não tem tabela de rateio. */
  rateios: EspelhoOrdemRateio[];
}

/** A linha crua do PostgREST. `numeric` chega como string. */
export interface LinhaEspelhoOrdem {
  id: string;
  numero: string | null;
  descricao: string | null;
  valor_total: string | number;
  frete: string | number | null;
  outras_despesas: string | number | null;
  impostos: string | number | null;
  desconto: string | number | null;
  status: string;
  motivo_rejeicao: string | null;
  data_compra: string | null;
  mes_competencia: string | null;
  observacoes: string | null;
  fornecedores: { razao_social: string; nome_fantasia: string | null } | null;
  categorias_financeiras: { nome: string } | null;
  cotacoes: { numero: string | null } | null;
  condicoes_pagamento: { descricao: string | null } | null;
  oc_itens: {
    id: string;
    quantidade: string | number;
    preco_unitario: string | number;
    centro_custo_id: string | null;
    insumos: { nome: string; unidades_medida: { sigla: string } | null } | null;
    centros_custo: { nome: string; codigo: string | null } | null;
  }[];
  oc_parcelas: {
    numero_parcela: number;
    data_vencimento: string | null;
    valor: string | number;
  }[];
}

/** Conversão única de número: sobre o texto exato que o banco mandou. */
function numero(valor: string | number | null | undefined): number {
  return Number(valor ?? 0);
}

/**
 * Monta o espelho da OC a partir da linha crua. Pura, testável sem banco.
 *
 * O rateio é derivado dos itens, somado por centro: a OC não tem tabela de
 * rateio, o centro mora no item, e dois itens do mesmo centro têm que virar uma
 * linha só no papel.
 */
export function montarEspelhoOrdem(linha: LinhaEspelhoOrdem): EspelhoOrdem {
  const itens: EspelhoOrdemItem[] = (linha.oc_itens ?? []).map((item) => {
    const quantidade = numero(item.quantidade);
    const precoUnitario = numero(item.preco_unitario);
    return {
      id: item.id,
      insumoNome: item.insumos?.nome ?? null,
      unidade: item.insumos?.unidades_medida?.sigla ?? null,
      quantidade,
      precoUnitario,
      subtotal: quantidade * precoUnitario,
      centroCustoId: item.centro_custo_id,
      // "Sem centro de custo", igual ao fallback de detalharLancamentosParaPlanilha
      // e do espelho de lançamento: os dois textos descrevem a mesma ausência e
      // não podem divergir entre a planilha, o outro espelho e este.
      centroCustoNome: item.centros_custo?.nome ?? "Sem centro de custo",
      centroCustoCodigo: item.centros_custo?.codigo ?? null,
    };
  });

  // Agrupa por ID, nunca por nome: `centros_custo` não tem unicidade em
  // `nome` (árvore Obra > Etapa > Item), então dois centros DIFERENTES podem
  // se chamar igual, e agrupar por nome juntaria custo de duas obras numa
  // linha só sem nada revelar isso no papel. Sentinela para item sem centro,
  // para todos eles colapsarem na mesma linha "Sem centro de custo" em vez de
  // cada um virar sua própria linha (mesmo problema, na direção oposta).
  const porCentro = new Map<string, EspelhoOrdemRateio>();
  for (const item of itens) {
    const chave = item.centroCustoId ?? "sem-centro";
    const atual = porCentro.get(chave);
    if (atual) {
      atual.valor += item.subtotal;
      continue;
    }
    porCentro.set(chave, {
      centroNome: item.centroCustoNome,
      centroCodigo: item.centroCustoCodigo,
      valor: item.subtotal,
    });
  }

  return {
    id: linha.id,
    numero: linha.numero,
    descricao: linha.descricao,
    valorTotal: numero(linha.valor_total),
    frete: numero(linha.frete),
    outrasDespesas: numero(linha.outras_despesas),
    impostos: numero(linha.impostos),
    desconto: numero(linha.desconto),
    status: linha.status,
    motivoRejeicao: linha.motivo_rejeicao,
    dataCompra: linha.data_compra,
    mesCompetencia: linha.mes_competencia,
    observacoes: linha.observacoes,
    // Nome fantasia primeiro, igual ao resto das telas de compras.
    fornecedorNome:
      linha.fornecedores?.nome_fantasia ??
      linha.fornecedores?.razao_social ??
      null,
    categoriaNome: linha.categorias_financeiras?.nome ?? null,
    cotacaoNumero: linha.cotacoes?.numero ?? null,
    condicaoDescricao: linha.condicoes_pagamento?.descricao ?? null,
    itens,
    parcelas: (linha.oc_parcelas ?? [])
      .map((parcela) => ({
        numeroParcela: parcela.numero_parcela,
        dataVencimento: parcela.data_vencimento,
        valor: numero(parcela.valor),
      }))
      .sort((a, b) => a.numeroParcela - b.numeroParcela),
    rateios: [...porCentro.values()],
  };
}

/**
 * Busca as OCs para o espelho, na ordem em que os ids vieram.
 *
 * Em lotes de LOTE_IDS_POSTGREST porque `in` vai na query string de um GET. Id
 * que a RLS não deixa ver simplesmente não volta, e quem chama conta a
 * diferença: o espelho nunca imprime linha que o usuário não pode ver, e nunca
 * derruba a impressão inteira por causa dela.
 */
export async function buscarOrdensParaEspelho(
  ids: string[],
): Promise<EspelhoOrdem[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();

  const linhas: LinhaEspelhoOrdem[] = [];
  for (const lote of emLotes(ids, LOTE_IDS_POSTGREST)) {
    const { data, error } = await supabase
      .from("ordens_compra")
      .select(
        `id, numero, descricao, valor_total, frete, outras_despesas, impostos,
         desconto, status, motivo_rejeicao, data_compra, mes_competencia,
         observacoes,
         fornecedores(razao_social, nome_fantasia),
         categorias_financeiras(nome),
         cotacoes(numero),
         condicoes_pagamento(descricao),
         oc_itens(id, quantidade, preco_unitario, centro_custo_id,
           insumos(nome, unidades_medida(sigla)),
           centros_custo(nome, codigo)),
         oc_parcelas(numero_parcela, data_vencimento, valor)`,
      )
      .in("id", lote);

    if (error) {
      // A mensagem do banco vai junto: sem ela a falha chega como "não foi
      // possível" e descobrir o motivo vira adivinhação.
      throw new Error(
        `Não foi possível carregar o espelho da ordem de compra: ${error.message}`,
      );
    }
    linhas.push(...((data ?? []) as unknown as LinhaEspelhoOrdem[]));
  }

  const porId = new Map(
    linhas.map((linha) => [linha.id, montarEspelhoOrdem(linha)]),
  );
  // Ordem pedida, não ordem do banco: o usuário marcou numa ordem e espera o
  // maço de papel naquela ordem.
  return ids
    .map((id) => porId.get(id))
    .filter((espelho): espelho is EspelhoOrdem => espelho !== undefined);
}
