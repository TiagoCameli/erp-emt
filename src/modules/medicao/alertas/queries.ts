import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { facetasNoServidor, type FacetasPresentes } from "@/modules/_shared/filtros-facetados";

import { ORDEM_GRAVIDADE } from "./formato";
import type { AlertaLinha } from "./tipos";

export interface FiltrosAlertas {
  contratoId?: string;
  gravidade?: string;
}

/** O pedaço do builder do PostgREST que os filtros dos alertas usam. */
interface ConsultaFiltravelAlertas<T> {
  eq: (coluna: string, valor: string) => T;
}

/**
 * Contrato e gravidade na consulta recebida. Serve a lista e as facetas (`facetasAlertas`), que
 * precisam do MESMO recorte. Síncrona: o builder é "thenable".
 */
export function aplicarFiltrosAlertas<T extends ConsultaFiltravelAlertas<T>>(consultaInicial: T, filtros: FiltrosAlertas): T {
  let q = consultaInicial;
  if (filtros.contratoId) q = q.eq("contrato_id", filtros.contratoId);
  if (filtros.gravidade) q = q.eq("gravidade", filtros.gravidade);
  return q;
}

/**
 * Alertas calculados (mc_v_alertas, security_invoker: a RLS esconde contrato fora da lista de
 * acesso). Sem tabela e sem escrita: o que já passou da regra aparece, o que foi resolvido some.
 */
export async function carregarAlertas(filtros: FiltrosAlertas = {}): Promise<AlertaLinha[]> {
  const supabase = await createClient();
  const q = aplicarFiltrosAlertas(
    supabase
      .from("mc_v_alertas")
      .select("contrato_id, codigo, tipo, gravidade, item_id, item_codigo, unidade, valor, referencia, data, com_motivo"),
    filtros,
  );
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? [])
    .map((r, i) => ({
      chave: `${r.contrato_id}:${r.tipo}:${r.item_id ?? ""}:${i}`,
      contratoId: r.contrato_id ?? "",
      codigo: r.codigo ?? "",
      tipo: r.tipo ?? "",
      gravidade: r.gravidade ?? "",
      itemCodigo: r.item_codigo,
      unidade: r.unidade,
      valor: r.valor,
      referencia: r.referencia,
      data: r.data,
      comMotivo: r.com_motivo === true,
    }))
    .sort(
      (a, b) =>
        (ORDEM_GRAVIDADE[a.gravidade] ?? 9) - (ORDEM_GRAVIDADE[b.gravidade] ?? 9) ||
        a.codigo.localeCompare(b.codigo) ||
        a.tipo.localeCompare(b.tipo) ||
        (a.itemCodigo ?? "").localeCompare(b.itemCodigo ?? "", "pt-BR", { numeric: true }),
    );
}

/** Os filtros de seleção da tela de alertas. */
export type FacetaAlertas = "contrato" | "gravidade";

/**
 * O que existe nos alertas filtrados, por filtro de seleção (ver `_shared/filtros-facetados`): os
 * contratos oferecidos são os que têm alerta da gravidade escolhida, e as gravidades, as que o
 * contrato escolhido tem. Só as duas colunas; são poucas dezenas de alertas.
 */
export async function facetasAlertas(filtros: FiltrosAlertas = {}): Promise<FacetasPresentes<FacetaAlertas>> {
  const supabase = await createClient();
  type Linha = { contrato_id: string | null; gravidade: string | null };
  return facetasNoServidor<Linha, FacetaAlertas>(
    {
      contrato: { ativo: !!filtros.contratoId, chave: (a) => a.contrato_id },
      gravidade: { ativo: !!filtros.gravidade, chave: (a) => a.gravidade },
    },
    async (exceto) => {
      const recorte: FiltrosAlertas = {
        ...filtros,
        ...(exceto === "contrato" ? { contratoId: undefined } : {}),
        ...(exceto === "gravidade" ? { gravidade: undefined } : {}),
      };
      const { linhas, erro } = await todasAsLinhas<Linha>((de, ate) =>
        aplicarFiltrosAlertas(supabase.from("mc_v_alertas").select("contrato_id, gravidade"), recorte)
          .order("contrato_id")
          .order("tipo")
          .order("item_id")
          .range(de, ate),
      );
      if (erro) throw new Error("Não foi possível carregar os filtros dos alertas");
      return linhas;
    },
  );
}
