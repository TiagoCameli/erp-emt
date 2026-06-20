"use server";

import { revalidatePath } from "next/cache";

import { dataHojeISO } from "@/lib/formatadores";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  transferenciaSchema,
  type TransferenciaInput,
} from "@/modules/estoque/transferencias/schemas";

const RECURSO = "estoque.transferencias" as const;
const ROTA = "/estoque/transferencias";

export type ResultadoCriacao = { ok: true; id: string } | { erro: string };

/**
 * Registra uma transferência de estoque entre depósitos via
 * fn_estoque_transferencia (baixa na origem, entrada no destino, preservando
 * o custo). Barreira tripla: a UI esconde o botão, esta action checa permissão
 * e a RPC revalida no banco (inclusive saldo insuficiente na origem).
 */
export async function registrarTransferencia(
  dados: TransferenciaInput,
): Promise<ResultadoCriacao> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para lançar transferências" };
  }

  const validado = transferenciaSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_estoque_transferencia", {
    p_insumo: validado.data.insumoId,
    p_origem: validado.data.origemId,
    p_destino: validado.data.destinoId,
    p_quantidade: validado.data.quantidade,
    p_data: validado.data.data ?? dataHojeISO(),
    p_obs: validado.data.observacao ?? "",
  });

  if (error || !data) {
    return {
      erro: error?.message || "Não foi possível registrar a transferência",
    };
  }

  revalidatePath(ROTA);
  return { ok: true, id: data };
}
