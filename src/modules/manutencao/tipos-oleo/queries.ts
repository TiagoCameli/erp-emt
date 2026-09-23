import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import {
  APLICACOES_OLEO,
  type AplicacaoOleo,
} from "@/modules/manutencao/_shared/rotulos";

/** Linha da listagem de tipos de óleo. */
export interface TipoOleoLista {
  id: string;
  nome: string;
  aplicacao: AplicacaoOleo;
  intervaloMeses: number | null;
  ativo: boolean;
}

function aplicacaoValida(valor: string): AplicacaoOleo {
  return (APLICACOES_OLEO as readonly string[]).includes(valor)
    ? (valor as AplicacaoOleo)
    : "outro";
}

/**
 * Todos os tipos de óleo, por nome. Cadastro pequeno (dezenas), mas lido por
 * `todasAsLinhas` para não depender do teto de 1.000 do PostgREST.
 */
export async function listar(): Promise<TipoOleoLista[]> {
  const supabase = await createClient();

  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("tipos_oleo")
      .select("id, nome, aplicacao, intervalo_meses, ativo")
      .order("nome")
      .order("id")
      .range(de, ate),
  );

  if (erro) {
    throw new Error("Não foi possível carregar os tipos de óleo");
  }

  return linhas.map((tipo) => ({
    id: tipo.id,
    nome: tipo.nome,
    aplicacao: aplicacaoValida(tipo.aplicacao),
    intervaloMeses: tipo.intervalo_meses,
    ativo: tipo.ativo,
  }));
}
