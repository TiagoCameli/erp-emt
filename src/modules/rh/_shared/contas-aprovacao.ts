import { createClient } from "@/lib/supabase/server";
import type { ContaBancariaOpcao } from "@/modules/financeiro/pagamentos/queries";

/**
 * Contas ativas para o modal de aprovação de folha, 13º e férias.
 *
 * Lê pela `fn_contas_para_aprovacao_rh`, e não pela tabela: a policy de
 * `contas_bancarias` só abre para quem vê telas do Financeiro, e quem só aprova
 * RH ficaria com a lista vazia, sem como aprovar. Saldo não vem (null): ele é
 * do Financeiro.
 */
export async function listarContasParaAprovacaoRh(): Promise<ContaBancariaOpcao[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_contas_para_aprovacao_rh");
  if (error) {
    throw new Error("Não foi possível carregar as contas bancárias");
  }
  return (data ?? []).map((conta) => ({
    id: conta.id,
    nome: conta.nome,
    banco: conta.banco,
    saldoAtual: null,
  }));
}
