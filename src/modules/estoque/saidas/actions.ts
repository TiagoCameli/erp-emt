"use server";

import { revalidatePath } from "next/cache";

import { dataHojeISO } from "@/lib/formatadores";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  saidaSchema,
  type SaidaInput,
} from "@/modules/estoque/saidas/schemas";

const RECURSO = "estoque.saidas" as const;
const ROTA = "/estoque/saidas";

export type ResultadoCriacao = { ok: true; id: string } | { erro: string };

/**
 * Registra uma saída/consumo de estoque via fn_estoque_saida (cria o
 * movimento, consome as camadas PEPS mais antigas e atualiza o saldo).
 * Barreira tripla: a UI esconde o botão, esta action checa permissão e a RPC
 * revalida no banco (inclusive saldo insuficiente).
 */
export async function registrarSaida(
  dados: SaidaInput,
): Promise<ResultadoCriacao> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para lançar saídas" };
  }

  const validado = saidaSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_estoque_saida", {
    p_insumo: validado.data.insumoId,
    p_deposito: validado.data.depositoId,
    p_quantidade: validado.data.quantidade,
    p_centro_custo: validado.data.centroCustoId,
    p_data: validado.data.data ?? dataHojeISO(),
    p_obs: validado.data.observacao ?? "",
  });

  if (error || !data) {
    return { erro: error?.message || "Não foi possível registrar a saída" };
  }

  revalidatePath(ROTA);
  return { ok: true, id: data };
}
