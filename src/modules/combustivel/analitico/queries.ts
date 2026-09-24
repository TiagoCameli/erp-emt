import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import type { EntradaAnalitica } from "@/modules/combustivel/analitico/calculo";
import { relogioDeParede } from "@/modules/combustivel/anomalias/base";
import { paraNumeroDoBanco } from "@/modules/manutencao/servicos/formato";

interface LinhaEntradaBanco {
  id: string;
  data_hora: string;
  tanque_id: string;
  insumo_id: string;
  litros: number | string;
  valor_total: number | string;
  fornecedor_id: string | null;
  fornecedores: { razao_social: string; nome_fantasia: string | null } | null;
}

/**
 * Todas as entradas NÃO EXCLUÍDAS, no formato da aba Fornecedores da origem. São poucas
 * centenas, mas passam por `todasAsLinhas` (o PostgREST corta em 1.000 sem avisar) com
 * desempate por id. O período anterior (para os deltas) sai da mesma lista.
 */
export const carregarEntradasAnaliticas = cache(async (): Promise<EntradaAnalitica[]> => {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas<LinhaEntradaBanco>((de, ate) =>
    supabase
      .from("combustivel_entradas")
      .select("id, data_hora, tanque_id, insumo_id, litros, valor_total, fornecedor_id, fornecedores(razao_social, nome_fantasia)")
      .is("excluido_em", null)
      .order("data_hora", { ascending: false })
      .order("id")
      .range(de, ate)
      .returns<LinhaEntradaBanco[]>(),
  );
  if (erro) throw new Error("Não foi possível carregar as entradas de combustível");

  return linhas.map((linha) => ({
    id: linha.id,
    data: relogioDeParede(linha.data_hora),
    tanqueId: linha.tanque_id,
    insumoId: linha.insumo_id,
    fornecedorId: linha.fornecedor_id,
    fornecedorNome: linha.fornecedores
      ? linha.fornecedores.nome_fantasia?.trim() || linha.fornecedores.razao_social
      : null,
    litros: paraNumeroDoBanco(linha.litros),
    valorTotal: paraNumeroDoBanco(linha.valor_total),
  }));
});
