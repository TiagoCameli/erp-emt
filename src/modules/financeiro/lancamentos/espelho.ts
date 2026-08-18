import { emLotes, LOTE_IDS_POSTGREST } from "@/lib/lotes-de-ids";
import { createClient } from "@/lib/supabase/server";

/** Uma parcela no papel. */
export interface EspelhoParcela {
  id: string;
  numeroParcela: number;
  dataVencimento: string | null;
  valor: number;
  desconto: number;
  juros: number;
  valorLiquido: number;
  status: string;
  dataPagamento: string | null;
  contaNome: string | null;
}

/** Uma linha de rateio no papel. */
export interface EspelhoRateio {
  centroNome: string;
  centroCodigo: string | null;
  valor: number;
}

export interface EspelhoLancamento {
  id: string;
  numero: string | null;
  descricao: string | null;
  valor: number;
  status: string;
  dataCompra: string | null;
  dataVencimento: string | null;
  mesCompetencia: string | null;
  observacoes: string | null;
  fornecedorNome: string | null;
  categoriaNome: string | null;
  formaPagamentoNome: string | null;
  parcelas: EspelhoParcela[];
  rateios: EspelhoRateio[];
}

/** A linha crua do PostgREST. `numeric` chega como string. */
export interface LinhaEspelhoLancamento {
  id: string;
  numero: string | null;
  descricao: string | null;
  valor: string | number;
  status: string;
  data_compra: string | null;
  data_vencimento: string | null;
  mes_competencia: string | null;
  observacoes: string | null;
  fornecedores: { razao_social: string } | null;
  categorias_financeiras: { nome: string } | null;
  formas_pagamento: { nome: string } | null;
  lancamento_parcelas: {
    id: string;
    numero_parcela: number;
    data_vencimento: string | null;
    valor: string | number;
    desconto: string | number | null;
    juros: string | number | null;
    valor_liquido: string | number;
    status: string;
    data_pagamento: string | null;
    contas_bancarias: { nome: string } | null;
  }[];
  lancamento_rateios: {
    valor: string | number;
    centros_custo: { nome: string; codigo: string | null } | null;
  }[];
}

/** Conversão única de dinheiro: sobre o texto exato que o banco mandou. */
function dinheiro(valor: string | number | null | undefined): number {
  return Number(valor ?? 0);
}

/**
 * Monta o espelho a partir da linha crua. Pura, e por isso testável sem banco.
 *
 * Ordena as parcelas por número para o papel sair na ordem do carnê: o
 * PostgREST não garante ordem de linha embutida.
 */
export function montarEspelhoLancamento(
  linha: LinhaEspelhoLancamento,
): EspelhoLancamento {
  return {
    id: linha.id,
    numero: linha.numero,
    descricao: linha.descricao,
    valor: dinheiro(linha.valor),
    status: linha.status,
    dataCompra: linha.data_compra,
    dataVencimento: linha.data_vencimento,
    mesCompetencia: linha.mes_competencia,
    observacoes: linha.observacoes,
    fornecedorNome: linha.fornecedores?.razao_social ?? null,
    categoriaNome: linha.categorias_financeiras?.nome ?? null,
    formaPagamentoNome: linha.formas_pagamento?.nome ?? null,
    parcelas: (linha.lancamento_parcelas ?? [])
      .map((parcela) => ({
        id: parcela.id,
        numeroParcela: parcela.numero_parcela,
        dataVencimento: parcela.data_vencimento,
        valor: dinheiro(parcela.valor),
        desconto: dinheiro(parcela.desconto),
        juros: dinheiro(parcela.juros),
        valorLiquido: dinheiro(parcela.valor_liquido),
        status: parcela.status,
        dataPagamento: parcela.data_pagamento,
        contaNome: parcela.contas_bancarias?.nome ?? null,
      }))
      .sort((a, b) => a.numeroParcela - b.numeroParcela),
    rateios: (linha.lancamento_rateios ?? []).map((rateio) => ({
      centroNome: rateio.centros_custo?.nome ?? "sem centro",
      centroCodigo: rateio.centros_custo?.codigo ?? null,
      valor: dinheiro(rateio.valor),
    })),
  };
}

/**
 * Busca os lançamentos para o espelho, na ordem em que os ids vieram.
 *
 * Em lotes de LOTE_IDS_POSTGREST porque `in` vai na query string de um GET.
 * Id que a RLS não deixa ver simplesmente não volta, e quem chama conta a
 * diferença: o espelho nunca imprime linha que o usuário não pode ver, e
 * nunca derruba a impressão inteira por causa dela.
 */
export async function buscarLancamentosParaEspelho(
  ids: string[],
): Promise<EspelhoLancamento[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();

  const linhas: LinhaEspelhoLancamento[] = [];
  for (const lote of emLotes(ids, LOTE_IDS_POSTGREST)) {
    const { data, error } = await supabase
      .from("lancamentos")
      .select(
        `id, numero, descricao, valor, status, data_compra, data_vencimento,
         mes_competencia, observacoes,
         fornecedores(razao_social),
         categorias_financeiras(nome),
         formas_pagamento(nome),
         lancamento_parcelas(id, numero_parcela, data_vencimento, valor,
           desconto, juros, valor_liquido, status, data_pagamento,
           contas_bancarias(nome)),
         lancamento_rateios(valor, centros_custo(nome, codigo))`,
      )
      .in("id", lote);

    if (error) {
      // A mensagem do banco vai junto: sem ela a falha chega como "não foi
      // possível" e descobrir o motivo vira adivinhação.
      throw new Error(
        `Não foi possível carregar o espelho do lançamento: ${error.message}`,
      );
    }
    linhas.push(...((data ?? []) as unknown as LinhaEspelhoLancamento[]));
  }

  const porId = new Map(
    linhas.map((linha) => [linha.id, montarEspelhoLancamento(linha)]),
  );
  // Ordem pedida, não ordem do banco: o usuário marcou numa ordem e espera o
  // maço de papel naquela ordem.
  return ids
    .map((id) => porId.get(id))
    .filter((espelho): espelho is EspelhoLancamento => espelho !== undefined);
}
