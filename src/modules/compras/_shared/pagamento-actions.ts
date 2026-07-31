"use server";

import { logErroServidor } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";
import {
  tipoFormaPagamento,
  type TipoFormaPagamento,
} from "@/modules/_shared/forma-pagamento";

type CriarResultado = { id: string } | { erro: string };

/**
 * Criar condição de pagamento saiu daqui para
 * `@/modules/_shared/condicao-pagamento/actions`: o lançamento avulso também
 * cria, e o catálogo tem que ser o mesmo em todas as telas.
 *
 * Forma de pagamento ficou: `fn_criar_forma_pagamento` exige permissão de criar
 * em `compras.ordens` ou `compras.cotacoes`, então é de Compras mesmo.
 */

/** Cria uma forma de pagamento (método) na hora. */
export async function criarFormaPagamento(
  nome: string,
  tipo: TipoFormaPagamento = "bancario",
): Promise<CriarResultado> {
  const limpo = (nome ?? "").trim();
  if (limpo.length < 2) return { erro: "Informe um nome válido" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_criar_forma_pagamento", {
    p_nome: limpo,
    p_tipo: tipoFormaPagamento(tipo),
  });
  if (error) {
    logErroServidor("compras.criar-forma", error);
    return {
      erro: error.message || "Não foi possível criar a forma de pagamento",
    };
  }
  return { id: data as string };
}
