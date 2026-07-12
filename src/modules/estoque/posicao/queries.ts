import "server-only";

import { createClient } from "@/lib/supabase/server";

/** KPIs da posição de estoque, calculados sobre todos os saldos. */
export interface ResumoPosicao {
  valorTotal: number;
  qtdItens: number;
  qtdDepositos: number;
}

/**
 * Resumo da posição de estoque para os KPIs: valor total, itens com saldo e
 * depósitos distintos. Lê só duas colunas dos saldos com quantidade > 0,
 * independente da página e dos filtros da listagem.
 */
export async function resumoPosicao(): Promise<ResumoPosicao> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("estoque_saldos")
    .select("deposito_id, valor_total")
    .gt("quantidade", 0);

  if (error) throw new Error("Não foi possível carregar o resumo do estoque");

  const saldos = data ?? [];

  return {
    valorTotal: saldos.reduce((soma, saldo) => soma + saldo.valor_total, 0),
    qtdItens: saldos.length,
    qtdDepositos: new Set(saldos.map((saldo) => saldo.deposito_id)).size,
  };
}
