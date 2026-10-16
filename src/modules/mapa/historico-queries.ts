import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { MovimentacaoMapa } from "@/modules/mapa/historico";

export interface FiltrosHistorico {
  de?: string;
  ate?: string;
  /** Equipamento (ou pessoa) da trilha. */
  alvo?: string;
  tipo?: string;
}

export interface MaquinaOpcao {
  id: string;
  codigo: string;
  descricao: string;
}

/**
 * A trilha do Mapa com os nomes resolvidos, numa RPC só (`fn_mapa_historico`, até 2000 linhas,
 * mais recentes primeiro). A RPC recusa quem não tem mapa.historico/ver nem mapa.mapa/ver.
 */
export async function carregarHistorico(
  filtros: FiltrosHistorico,
): Promise<{ linhas: MovimentacaoMapa[]; erro: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_mapa_historico", {
    p_de: filtros.de || undefined,
    p_ate: filtros.ate || undefined,
    p_alvo: filtros.alvo || undefined,
    p_tipo: filtros.tipo || undefined,
  });
  if (error)
    return {
      linhas: [],
      erro: error.message || "Não foi possível carregar o histórico.",
    };
  const linhas = (data ?? []).map(
    (r): MovimentacaoMapa => ({
      id: Number(r.id),
      tipo: r.tipo,
      alvo: r.alvo,
      alvoId: r.alvo_id,
      alvoCodigo: r.alvo_codigo ?? "",
      alvoNome: r.alvo_nome ?? "",
      dataEfetiva: r.data_efetiva,
      criadoEm: r.criado_em,
      usuarioNome: r.usuario_nome ?? "",
      motivo: r.motivo ?? "",
      deObra: r.de_obra,
      paraObra: r.para_obra,
      deLugar: r.de_lugar,
      paraLugar: r.para_lugar,
      deKm: r.de_km === null ? null : Number(r.de_km),
      paraKm: r.para_km === null ? null : Number(r.para_km),
      deEstado: r.de_estado,
      paraEstado: r.para_estado,
      dePessoa: r.de_pessoa,
      paraPessoa: r.para_pessoa,
      deAcoplado: r.de_acoplado,
      paraAcoplado: r.para_acoplado,
      fornecedor: r.fornecedor,
    }),
  );
  return { linhas, erro: null };
}

/** As máquinas do filtro: o cadastro inteiro; sem acesso a ele, a lista fica vazia. */
export async function listarMaquinasDoHistorico(): Promise<MaquinaOpcao[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipamentos")
    .select("id, codigo, descricao")
    .order("codigo");
  if (error || !data) return [];
  return data.map((e) => ({
    id: e.id,
    codigo: e.codigo ?? "",
    descricao: e.descricao ?? "",
  }));
}
