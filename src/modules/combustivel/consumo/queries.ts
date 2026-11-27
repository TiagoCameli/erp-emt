import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import {
  CONFIG_CONSUMO_PADRAO,
  trechoDoBanco,
  type ConfigConsumo,
  type TrechoLinha,
} from "@/modules/combustivel/consumo/calculo";

/**
 * Trechos de consumo (`fn_comb_consumo_trechos`), um por abastecimento da janela.
 *
 * Uma linha por abastecimento cresce com a empresa, então passa por `todasAsLinhas` com
 * ordem de chave única (`data`, `saida_id`): o PostgREST corta RPC em 1.000 linhas calado,
 * e sem desempate a paginação repete e pula linha (lição do PR #553, Estoque >
 * Movimentações).
 *
 * `de`/`ate` são instantes ISO (o fim é exclusivo); `veiculo` restringe a um só.
 */
export async function carregarTrechos(janela: {
  de: string | null;
  ate: string | null;
  veiculo?: string | null;
}): Promise<TrechoLinha[]> {
  const supabase = await createClient();
  const args = {
    ...(janela.de ? { p_de: janela.de } : {}),
    ...(janela.ate ? { p_ate: janela.ate } : {}),
    ...(janela.veiculo ? { p_veiculo: janela.veiculo } : {}),
  };
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .rpc("fn_comb_consumo_trechos", args)
      .order("data", { ascending: true })
      .order("saida_id", { ascending: true })
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível calcular o consumo");
  return linhas.map(trechoDoBanco);
}

const CHAVES_CONFIG = {
  desvioPercentual: "combustivel.desvio_media_percentual",
  janelaMeses: "combustivel.desvio_janela_meses",
  minTrechos: "combustivel.desvio_min_trechos",
} as const;

/** Limites do destaque (Administração > Configurações), com o padrão se faltar algum. */
export async function carregarConfigConsumo(): Promise<ConfigConsumo> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("configuracoes")
    .select("chave, valor")
    .in("chave", Object.values(CHAVES_CONFIG));
  if (error) throw new Error("Não foi possível ler a configuração do consumo");
  const valor = (chave: string, padrao: number) => {
    const bruto = data?.find((c) => c.chave === chave)?.valor;
    const numero = typeof bruto === "number" ? bruto : Number(bruto);
    return Number.isFinite(numero) && numero > 0 ? numero : padrao;
  };
  return {
    desvioPercentual: valor(CHAVES_CONFIG.desvioPercentual, CONFIG_CONSUMO_PADRAO.desvioPercentual),
    janelaMeses: valor(CHAVES_CONFIG.janelaMeses, CONFIG_CONSUMO_PADRAO.janelaMeses),
    minTrechos: valor(CHAVES_CONFIG.minTrechos, CONFIG_CONSUMO_PADRAO.minTrechos),
  };
}
