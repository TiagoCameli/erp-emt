"use server";

import { revalidatePath } from "next/cache";

import { erroAcao } from "@/lib/erros";
import { dataHojeISO } from "@/lib/formatadores";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  entradaSchema,
  type EntradaInput,
} from "@/modules/estoque/entradas/schemas";

const RECURSO = "estoque.entradas" as const;
const ROTA = "/estoque/entradas";

export type ResultadoCriacao = { ok: true; id: string } | { erro: string };

/**
 * Registra uma entrada manual de estoque via fn_estoque_entrada (cria o
 * movimento, a camada PEPS e atualiza o saldo). Barreira tripla: a UI esconde
 * o botão, esta action checa permissão e a RPC revalida no banco.
 */
export async function registrarEntrada(
  dados: EntradaInput,
): Promise<ResultadoCriacao> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para lançar entradas" };
  }

  const validado = entradaSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_estoque_entrada", {
    p_insumo: validado.data.insumoId,
    p_deposito: validado.data.depositoId,
    p_quantidade: validado.data.quantidade,
    p_custo_unitario: validado.data.custoUnitario,
    p_data: validado.data.data ?? dataHojeISO(),
    p_obs: validado.data.observacao ?? "",
  });

  if (error || !data) {
    return erroAcao(
      "estoque.entradas.registrarEntrada",
      error,
      error?.message || "Não foi possível registrar a entrada",
    );
  }

  revalidatePath(ROTA);
  return { ok: true, id: data };
}
