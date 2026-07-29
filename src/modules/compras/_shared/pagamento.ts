import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  tipoFormaPagamento,
  type TipoFormaPagamento,
} from "@/modules/_shared/forma-pagamento";

/** Opção {id, nome} para os combos de forma/condição de pagamento. */
export interface OpcaoPagamento {
  id: string;
  nome: string;
}

/**
 * Forma de pagamento com o tipo, porque o tipo é o que decide o caminho do
 * pagamento e a tela precisa dizer isso antes de o usuário salvar.
 */
export interface OpcaoFormaPagamento extends OpcaoPagamento {
  tipo: TipoFormaPagamento;
}

/** Formas de pagamento ativas (dinheiro, PIX, cartão, boleto, TED...). */
export async function listarFormasPagamento(): Promise<OpcaoFormaPagamento[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("formas_pagamento")
    .select("id, nome, tipo")
    .eq("ativo", true)
    .order("nome");
  if (error) throw new Error("Não foi possível carregar as formas de pagamento");
  return (data ?? []).map((forma) => ({
    id: forma.id,
    nome: forma.nome,
    tipo: tipoFormaPagamento(forma.tipo),
  }));
}
