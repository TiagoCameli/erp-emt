import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  tipoFormaPagamento,
  type TipoFormaPagamento,
} from "@/modules/_shared/forma-pagamento";

/** Linha da listagem de formas de pagamento. */
export interface FormaLista {
  id: string;
  nome: string;
  tipo: TipoFormaPagamento;
  ativo: boolean;
  /** Quantas OCs usam esta forma: dá o peso de mexer no tipo dela. */
  usoEmOrdens: number;
}

/**
 * Formas de pagamento com a contagem de uso em ordens de compra. O catálogo é
 * pequeno (uma dúzia de linhas), então lista tudo sem paginação, ativas e
 * inativas, para desativar e reativar na mesma tela.
 */
export async function listarFormas(): Promise<FormaLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("formas_pagamento")
    .select("id, nome, tipo, ativo")
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as formas de pagamento");
  }

  const linhas = data ?? [];
  const { data: usos } = await supabase
    .from("ordens_compra")
    .select("forma_pagamento_id")
    .not("forma_pagamento_id", "is", null);

  const contagem = new Map<string, number>();
  for (const ordem of usos ?? []) {
    if (!ordem.forma_pagamento_id) continue;
    contagem.set(
      ordem.forma_pagamento_id,
      (contagem.get(ordem.forma_pagamento_id) ?? 0) + 1,
    );
  }

  return linhas.map((forma) => ({
    id: forma.id,
    nome: forma.nome,
    tipo: tipoFormaPagamento(forma.tipo),
    ativo: forma.ativo,
    usoEmOrdens: contagem.get(forma.id) ?? 0,
  }));
}
