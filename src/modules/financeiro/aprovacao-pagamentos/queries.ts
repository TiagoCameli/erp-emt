import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Linha da fila de aprovação de pagamentos: uma parcela pendente de um
 * lançamento do tipo a_pagar, com o lançamento e o fornecedor resolvidos
 * via join. O valor vem do banco, nunca recalculado no app.
 */
export interface ParcelaPendente {
  id: string;
  numeroParcela: number;
  valor: number;
  dataVencimento: string | null;
  lancamentoId: string;
  lancamentoNumero: string | null;
  lancamentoDescricao: string;
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
 * Lista as parcelas pendentes de aprovação: status='pendente' em parcelas de
 * lançamentos do tipo a_pagar. Ordena por vencimento, do mais antigo para o
 * mais novo, para a fila priorizar o que vence primeiro. O filtro por tipo
 * a_pagar é feito via embed com `!inner` para descartar parcelas de
 * lançamentos a_receber.
 */
export async function listarParcelasPendentes(): Promise<ParcelaPendente[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lancamento_parcelas")
    .select(
      `id, numero_parcela, valor, data_vencimento, lancamento_id,
       lancamentos!inner(
         numero, descricao, tipo,
         fornecedores(razao_social, nome_fantasia)
       )`,
    )
    .eq("status", "pendente")
    .eq("lancamentos.tipo", "a_pagar")
    .order("data_vencimento", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error("Não foi possível carregar os pagamentos para aprovação");
  }

  return (data ?? []).map((parcela) => ({
    id: parcela.id,
    numeroParcela: parcela.numero_parcela,
    valor: parcela.valor,
    dataVencimento: parcela.data_vencimento,
    lancamentoId: parcela.lancamento_id,
    lancamentoNumero: parcela.lancamentos?.numero ?? null,
    lancamentoDescricao: parcela.lancamentos?.descricao ?? "-",
    fornecedorNome: nomeFornecedor(parcela.lancamentos?.fornecedores ?? null),
  }));
}
