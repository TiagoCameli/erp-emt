import "server-only";

import { createClient } from "@/lib/supabase/server";

import { ORDEM_GRAVIDADE } from "./formato";
import type { AlertaLinha } from "./tipos";

export interface FiltrosAlertas {
  contratoId?: string;
  gravidade?: string;
}

/**
 * Alertas calculados (mc_v_alertas, security_invoker: a RLS esconde contrato fora da lista de
 * acesso). Sem tabela e sem escrita: o que já passou da regra aparece, o que foi resolvido some.
 */
export async function carregarAlertas(filtros: FiltrosAlertas = {}): Promise<AlertaLinha[]> {
  const supabase = await createClient();
  let q = supabase
    .from("mc_v_alertas")
    .select("contrato_id, codigo, tipo, gravidade, item_id, item_codigo, unidade, valor, referencia, data, com_motivo");
  if (filtros.contratoId) q = q.eq("contrato_id", filtros.contratoId);
  if (filtros.gravidade) q = q.eq("gravidade", filtros.gravidade);
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
