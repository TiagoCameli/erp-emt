import { emLotes, LOTE_IDS_POSTGREST } from "@/lib/lotes-de-ids";
import { createClient } from "@/lib/supabase/server";
import type {
  StatusLancamento,
  StatusParcela,
  TipoLancamento,
} from "@/modules/financeiro/_shared/formato";
import {
  resumirParcelas,
  type EspelhoParcela,
  type EspelhoResumoParcelas,
} from "@/modules/financeiro/lancamentos/espelho";

export interface EspelhoPagamentoRateio {
  centroNome: string;
  centroCodigo: string | null;
  valor: number;
}

export interface EspelhoPagamento {
  /** Id da PARCELA: é ele que a rota recebe. */
  id: string;
  /** "LAN-2026-0001 parcela 2". Vai no cabeçalho do papel. */
  titulo: string;
  numeroParcela: number;
  dataVencimento: string | null;
  valor: number;
  desconto: number;
  juros: number;
  /** Tarifa, cartório, protesto: despesa que não é juros nem multa. */
  outrasDespesas: number;
  /** valor - desconto + juros + outrasDespesas: o que de fato saiu da conta. */
  valorLiquido: number;
  status: StatusParcela;
  dataPagamento: string | null;
  contaNome: string | null;
  /** O lançamento pai, achatado: o papel imprime tudo em um bloco. */
  lancamentoId: string | null;
  lancamentoNumero: string | null;
  lancamentoDescricao: string | null;
  lancamentoValor: number;
  lancamentoStatus: StatusLancamento | null;
  /**
   * Necessário para o rótulo do status do lançamento:
   * `rotuloStatusLancamento(status, tipo)` inverte "a_pagar" para "A receber"
   * quando o lançamento é a receber. Sem o tipo, um recebível em aberto
   * imprimiria o código cru e, pior, de trás para frente (parece uma dívida a
   * pagar quando é dinheiro a receber) — num papel que vai para contador ou
   * processo.
   */
  lancamentoTipo: TipoLancamento | null;
  lancamentoObservacoes: string | null;
  mesCompetencia: string | null;
  fornecedorNome: string | null;
  categoriaNome: string | null;
  formaPagamentoNome: string | null;
  rateios: EspelhoPagamentoRateio[];
  /**
   * Soma das linhas de `rateios`, e NUNCA `lancamentoValor`.
   *
   * Existe pelo mesmo motivo do `somaItens` do espelho de OC: a linha de total
   * da tabela tem que reduzir sobre as linhas que o papel acabou de imprimir.
   * Ecoar o valor do pai ali embaixo esconde a divergência exatamente no lugar
   * onde ela apareceria — e o valor do lançamento continua no papel, no campo
   * "Valor do lançamento", para quem lê comparar os dois.
   */
  somaRateios: number;
  /**
   * Como está o LANÇAMENTO INTEIRO em parcelas: quantas já foram pagas, quanto
   * já saiu da conta e quanto ainda falta.
   *
   * É a pergunta que quem assina o pagamento faz e que o papel não respondia:
   * a folha falava só da parcela em questão, e "R$ 3.881,73 da parcela 19" não
   * diz se o parcelamento está em dia nem quanto ainda deve. Vem da MESMA
   * `resumirParcelas` do espelho de lançamento, para os dois papéis nunca
   * discordarem sobre o mesmo lançamento.
   *
   * Nulo quando o lançamento pai não veio (não deveria acontecer): o papel
   * então omite o bloco em vez de imprimir zeros, que seriam lidos como
   * "nada pago, nada a pagar".
   */
  resumoParcelas: EspelhoResumoParcelas | null;
}

/** A linha crua do PostgREST. `numeric` chega como string. */
export interface LinhaEspelhoPagamento {
  id: string;
  numero_parcela: number;
  data_vencimento: string | null;
  valor: string | number;
  desconto: string | number | null;
  juros: string | number | null;
  outras_despesas: string | number | null;
  valor_liquido: string | number;
  status: string;
  data_pagamento: string | null;
  contas_bancarias: { nome: string } | null;
  lancamentos: {
    id: string;
    numero: string | null;
    descricao: string | null;
    valor: string | number;
    status: string;
    /** Cru do banco (texto); vira `TipoLancamento` na montagem. */
    tipo: string;
    mes_competencia: string | null;
    observacoes: string | null;
    fornecedores: { razao_social: string } | null;
    categorias_financeiras: { nome: string } | null;
    formas_pagamento: { nome: string } | null;
    lancamento_rateios: {
      valor: string | number;
      centros_custo: { nome: string; codigo: string | null } | null;
    }[];
    /**
     * TODAS as parcelas do lançamento, inclusive a que este espelho imprime.
     * Só existem para o resumo; o papel não lista parcela a parcela.
     *
     * A RLS de `lancamento_parcelas` é por PERMISSÃO, não por linha: quem tem
     * `financeiro.pagamentos:ver` ou `financeiro.aprovacao-pagamentos:ver` (que
     * é exatamente quem a rota do espelho deixa entrar) enxerga todas. Então o
     * resumo não sai pela metade sem avisar.
     */
    lancamento_parcelas: {
      id: string;
      numero_parcela: number;
      data_vencimento: string | null;
      valor: string | number;
      desconto: string | number | null;
      juros: string | number | null;
      outras_despesas: string | number | null;
      valor_liquido: string | number;
      status: string;
      data_pagamento: string | null;
    }[];
  } | null;
}

/** Conversão única de dinheiro: sobre o texto exato que o banco mandou. */
function dinheiro(valor: string | number | null | undefined): number {
  return Number(valor ?? 0);
}

/**
 * Monta o espelho do pagamento. Pura, testável sem banco.
 *
 * Achata o lançamento pai para o topo: a página imprime parcela e lançamento em
 * um bloco só, e navegar dois níveis de objeto dentro do JSX daria linha
 * ilegível e um `?.` em cada campo.
 */
export function montarEspelhoPagamento(
  linha: LinhaEspelhoPagamento,
): EspelhoPagamento {
  const pai = linha.lancamentos;
  const rateios: EspelhoPagamentoRateio[] = (pai?.lancamento_rateios ?? []).map(
    (rateio) => ({
      // "Sem centro de custo", igual ao fallback do espelho de lançamento e do
      // de OC: os três descrevem a mesma ausência e não podem divergir entre si.
      centroNome: rateio.centros_custo?.nome ?? "Sem centro de custo",
      centroCodigo: rateio.centros_custo?.codigo ?? null,
      valor: dinheiro(rateio.valor),
    }),
  );
  return {
    id: linha.id,
    titulo: `${pai?.numero ?? "sem número"} parcela ${linha.numero_parcela}`,
    numeroParcela: linha.numero_parcela,
    dataVencimento: linha.data_vencimento,
    valor: dinheiro(linha.valor),
    desconto: dinheiro(linha.desconto),
    juros: dinheiro(linha.juros),
    outrasDespesas: dinheiro(linha.outras_despesas),
    valorLiquido: dinheiro(linha.valor_liquido),
    status: linha.status as StatusParcela,
    dataPagamento: linha.data_pagamento,
    contaNome: linha.contas_bancarias?.nome ?? null,
    lancamentoId: pai?.id ?? null,
    lancamentoNumero: pai?.numero ?? null,
    lancamentoDescricao: pai?.descricao ?? null,
    lancamentoValor: dinheiro(pai?.valor),
    lancamentoStatus: pai ? (pai.status as StatusLancamento) : null,
    lancamentoTipo: pai ? (pai.tipo as TipoLancamento) : null,
    lancamentoObservacoes: pai?.observacoes ?? null,
    mesCompetencia: pai?.mes_competencia ?? null,
    fornecedorNome: pai?.fornecedores?.razao_social ?? null,
    categoriaNome: pai?.categorias_financeiras?.nome ?? null,
    formaPagamentoNome: pai?.formas_pagamento?.nome ?? null,
    rateios,
    somaRateios: rateios.reduce((soma, rateio) => soma + rateio.valor, 0),
    resumoParcelas: pai ? resumirParcelas(parcelasDoPai(pai)) : null,
  };
}

/**
 * As parcelas do lançamento pai no formato que `resumirParcelas` espera.
 *
 * `contaNome: null` de propósito: o resumo não usa conta bancária, e trazer
 * `contas_bancarias(nome)` de todas as parcelas do lançamento seria um join a
 * mais por linha em um dado que não vai ao papel.
 */
function parcelasDoPai(
  pai: NonNullable<LinhaEspelhoPagamento["lancamentos"]>,
): EspelhoParcela[] {
  return (pai.lancamento_parcelas ?? []).map((parcela) => ({
    id: parcela.id,
    numeroParcela: parcela.numero_parcela,
    dataVencimento: parcela.data_vencimento,
    valor: dinheiro(parcela.valor),
    desconto: dinheiro(parcela.desconto),
    juros: dinheiro(parcela.juros),
    outrasDespesas: dinheiro(parcela.outras_despesas),
    valorLiquido: dinheiro(parcela.valor_liquido),
    status: parcela.status as StatusParcela,
    dataPagamento: parcela.data_pagamento,
    contaNome: null,
  }));
}

/**
 * Busca os pagamentos para o espelho, na ordem em que os ids vieram.
 *
 * Parte de `lancamento_parcelas` e SOBE para o pai, porque é a parcela que o
 * usuário marcou na listagem. Em lotes de LOTE_IDS_POSTGREST: `in` vai na query
 * string de um GET. Parcela que a RLS não deixa ver não volta, e quem chama
 * conta a diferença.
 */
export async function buscarPagamentosParaEspelho(
  ids: string[],
): Promise<EspelhoPagamento[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();

  const linhas: LinhaEspelhoPagamento[] = [];
  for (const lote of emLotes(ids, LOTE_IDS_POSTGREST)) {
    const { data, error } = await supabase
      .from("lancamento_parcelas")
      .select(
        `id, numero_parcela, data_vencimento, valor, desconto, juros,
         outras_despesas, valor_liquido, status, data_pagamento,
         contas_bancarias(nome),
         lancamentos(id, numero, tipo, descricao, valor, status, mes_competencia,
           observacoes,
           fornecedores(razao_social),
           categorias_financeiras(nome),
           formas_pagamento(nome),
           lancamento_rateios(valor, centros_custo(nome, codigo)),
           lancamento_parcelas(id, numero_parcela, data_vencimento, valor,
             desconto, juros, outras_despesas, valor_liquido, status,
             data_pagamento))`,
      )
      .in("id", lote);

    if (error) {
      throw new Error(
        `Não foi possível carregar o espelho do pagamento: ${error.message}`,
      );
    }
    linhas.push(...((data ?? []) as unknown as LinhaEspelhoPagamento[]));
  }

  const porId = new Map(
    linhas.map((linha) => [linha.id, montarEspelhoPagamento(linha)]),
  );
  return ids
    .map((id) => porId.get(id))
    .filter((espelho): espelho is EspelhoPagamento => espelho !== undefined);
}
