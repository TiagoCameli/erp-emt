import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";

import type { MedicaoLista } from "./tipos";

/**
 * Lista de medições do contrato, da mais recente para a mais antiga: a tabela (`mc_medicoes`), o
 * valor de `mc_v_medicao_totais` (D7: só EXIBIDO, nunca somado nem arredondado aqui — por isso
 * `valor::text` no select, para não passar por double) e a contagem de lançamentos não excluídos de
 * cada uma.
 *
 * Não existe RPC de agregação para a contagem por medição: lê só a coluna `medicao_id` de
 * `mc_lancamentos` do contrato (com `todasAsLinhas`, por causa do teto de 1.000 linhas do
 * PostgREST) e conta em memória. É contagem de LINHAS, não conta de dinheiro, então não fere D7.
 */
export async function carregarMedicoes(contratoId: string): Promise<MedicaoLista[]> {
  const supabase = await createClient();

  const [medicoes, totais, lancamentos] = await Promise.all([
    supabase
      .from("mc_medicoes")
      .select("id, numero, periodo_inicio, periodo_fim, status")
      .eq("contrato_id", contratoId)
      .order("numero", { ascending: false }),
    supabase.from("mc_v_medicao_totais").select("medicao_id, valor:valor::text").eq("contrato_id", contratoId),
    todasAsLinhas((de, ate) =>
      supabase
        .from("mc_lancamentos")
        .select("medicao_id")
        .eq("contrato_id", contratoId)
        .is("excluido_em", null)
        .range(de, ate),
    ),
  ]);
  if (medicoes.error) throw medicoes.error;
  if (totais.error) throw totais.error;
  if (lancamentos.erro) throw new Error(lancamentos.erro);

  const valorPorMedicao = new Map((totais.data ?? []).map((t) => [t.medicao_id, t.valor as string | null]));
  const contagemPorMedicao = new Map<string, number>();
  for (const l of lancamentos.linhas) {
    contagemPorMedicao.set(l.medicao_id, (contagemPorMedicao.get(l.medicao_id) ?? 0) + 1);
  }

  return (medicoes.data ?? []).map((m) => ({
    id: m.id,
    numero: m.numero,
    periodoInicio: m.periodo_inicio,
    periodoFim: m.periodo_fim,
    status: m.status,
    valor: valorPorMedicao.get(m.id) ?? null,
    lancamentos: contagemPorMedicao.get(m.id) ?? 0,
  }));
}
