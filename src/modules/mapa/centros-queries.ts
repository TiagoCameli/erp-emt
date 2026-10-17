import "server-only";

import { createClient } from "@/lib/supabase/server";
import { propriedadeDoRelatorio, type RelDiasCentroLinha } from "@/modules/mapa/centros";

/**
 * Dias de cada máquina em cada centro de custo no mês (`fn_mapa_rel_dias_centro`: dias fechados às
 * 23:59 mais o de hoje ao vivo). A RPC recusa quem não tem mapa.historico/ver.
 * `propriedade` filtra própria/alugada (a Colorado entra em alugada); vazio traz todas.
 */
export async function carregarRelDiasCentro(
  mes: string,
  propriedade = "",
): Promise<{ linhas: RelDiasCentroLinha[]; erro: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_mapa_rel_dias_centro", {
    p_mes: `${mes}-01`,
  });
  if (error)
    return {
      linhas: [],
      erro: error.message || "Não foi possível carregar os dias por centro.",
    };
  const linhas = (data ?? [])
    .filter((r) => !propriedade || propriedadeDoRelatorio(r.propriedade ?? "") === propriedade)
    .map(
      (r): RelDiasCentroLinha => ({
        equipamentoId: r.equipamento_id,
        codigo: r.codigo ?? "",
        descricao: r.descricao ?? "",
        propriedade: r.propriedade ?? "",
        centroId: r.centro_custo_id,
        centroNome: r.centro_nome ?? "",
        dias: Number(r.dias),
      }),
    );
  return { linhas, erro: null };
}
