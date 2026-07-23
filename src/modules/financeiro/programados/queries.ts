import "server-only";

import { createClient } from "@/lib/supabase/server";
import { dataEfetivaProgramacao } from "@/modules/financeiro/programados/calculo";

/**
 * Parcela na fila de pagamento programado: uma parcela aprovada (ainda não
 * paga) de um lançamento a_pagar, com a data efetiva já resolvida
 * (data_programada, ou o vencimento na falta dela).
 */
export interface ParcelaProgramada {
  id: string;
  lancamentoId: string;
  lancamentoNumero: string | null;
  lancamentoDescricao: string;
  lancamentoTipo: string;
  numeroParcela: number;
  valor: number;
  dataVencimento: string | null;
  dataProgramada: string | null;
  dataEfetiva: string | null;
  fornecedorNome: string;
}

/** Nome de exibição do fornecedor: fantasia quando existe, senão razão social. */
function nomeFornecedor(
  fornecedor: { razao_social: string; nome_fantasia: string | null } | null,
): string {
  if (!fornecedor) return "-";
  return fornecedor.nome_fantasia ?? fornecedor.razao_social;
}

/**
 * Lista a fila de pagamento programado: parcelas status='aprovado'
 * (aprovadas, ainda não pagas) de lançamentos do tipo a_pagar (a_receber
 * baixa em contas a receber, não entra na fila de pagamento), cujo
 * lançamento não está cancelado. Segue o mesmo padrão de filtro de
 * `pagamentos/queries.ts` e `aprovacao-pagamentos/queries.ts` (join com
 * `!inner` pra poder filtrar por coluna do lançamento, e `.neq(...,
 * 'cancelado')` como defesa em profundidade caso alguma parcela escape da
 * cascata de cancelamento).
 *
 * Ordena pela data efetiva (data_programada, ou vencimento na falta dela),
 * calculada em `calculo.ts`, do mais antigo para o mais novo — não dá pra
 * ordenar isso direto no banco porque é um coalesce entre duas colunas.
 */
export async function listarProgramados(): Promise<ParcelaProgramada[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lancamento_parcelas")
    .select(
      `id, numero_parcela, valor, data_vencimento, data_programada, lancamento_id,
       lancamentos!inner(
         numero, descricao, tipo, status,
         fornecedores(razao_social, nome_fantasia)
       )`,
    )
    .eq("status", "aprovado")
    .eq("lancamentos.tipo", "a_pagar")
    .neq("lancamentos.status", "cancelado");

  if (error) {
    throw new Error("Não foi possível carregar os pagamentos programados");
  }

  const itens: ParcelaProgramada[] = (data ?? []).map((parcela) => ({
    id: parcela.id,
    lancamentoId: parcela.lancamento_id,
    lancamentoNumero: parcela.lancamentos?.numero ?? null,
    lancamentoDescricao: parcela.lancamentos?.descricao ?? "-",
    lancamentoTipo: parcela.lancamentos?.tipo ?? "-",
    numeroParcela: parcela.numero_parcela,
    valor: parcela.valor,
    dataVencimento: parcela.data_vencimento,
    dataProgramada: parcela.data_programada,
    dataEfetiva: dataEfetivaProgramacao(
      parcela.data_programada,
      parcela.data_vencimento,
    ),
    fornecedorNome: nomeFornecedor(parcela.lancamentos?.fornecedores ?? null),
  }));

  return itens.sort((a, b) => {
    if (a.dataEfetiva === b.dataEfetiva) return 0;
    if (a.dataEfetiva === null) return 1;
    if (b.dataEfetiva === null) return -1;
    return a.dataEfetiva < b.dataEfetiva ? -1 : 1;
  });
}
