import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";

export interface PilhaLinha {
  id: string;
  nome: string;
  observacoes: string | null;
  /** Falso quando a pilha já teve saída e zerou. */
  ativo: boolean;
  /** Data da saída que zerou a pilha; nula enquanto ativa. */
  zeradaEm: string | null;
  saldo: number;
  /** Soma das entradas, para "saldo de quanto entrou". */
  totalEntrada: number;
  /** Escolhido no cadastro. Nulo só nas pilhas criadas antes de 15/10 22h, até serem editadas. */
  insumoId: string | null;
  insumoNome: string | null;
  /** A localidade do Frete. Nula só nas pilhas criadas antes de 15/10 23h, até serem editadas. */
  localidadeId: string | null;
  localidadeNome: string | null;
  unidade: string | null;
}

/** Todas as pilhas, as inativas também (a tela filtra). Material e saldo vêm do cache do banco. */
export async function listarPilhas(): Promise<PilhaLinha[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("estoque_pilhas")
      .select("id, nome, observacoes, ativo, zerada_em, saldo, total_entrada, insumo_id, insumos(nome, unidades_medida(sigla)), localidade_id, localidades(nome)")
      .order("nome")
      .order("id")
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar as pilhas");

  return linhas.map((linha) => ({
    id: linha.id,
    nome: linha.nome,
    observacoes: linha.observacoes,
    ativo: linha.ativo,
    zeradaEm: linha.zerada_em,
    saldo: Number(linha.saldo),
    totalEntrada: Number(linha.total_entrada),
    insumoId: linha.insumo_id,
    insumoNome: linha.insumos?.nome ?? null,
    localidadeId: linha.localidade_id,
    localidadeNome: linha.localidades?.nome?.trim() ?? null,
    unidade: linha.insumos?.unidades_medida?.sigla ?? null,
  }));
}
