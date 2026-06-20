"use server";

import { revalidatePath } from "next/cache";

import { dataHojeISO } from "@/lib/formatadores";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  abastecimentoSchema,
  type AbastecimentoInput,
} from "@/modules/estoque/tanques/schemas";

const RECURSO = "estoque.tanques" as const;
const ROTA = "/estoque/tanques";

export type ResultadoCriacao = { ok: true; id: string } | { erro: string };

/** Argumentos de fn_abastecer. Opcionais só entram quando há valor. */
interface ArgsAbastecer {
  p_tanque: string;
  p_equipamento: string;
  p_quantidade: number;
  p_data: string;
  p_obs: string;
  p_horimetro?: number;
  p_km?: number;
  p_operador?: string;
}

/**
 * Registra um abastecimento de equipamento via fn_abastecer (baixa o estoque
 * do tanque por PEPS e grava o abastecimento). Barreira tripla: a UI esconde o
 * botão, esta action checa permissão e a RPC revalida no banco. Append-only.
 */
export async function registrarAbastecimento(
  dados: AbastecimentoInput,
): Promise<ResultadoCriacao> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para registrar abastecimentos" };
  }

  const validado = abastecimentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const args: ArgsAbastecer = {
    p_tanque: validado.data.tanqueId,
    p_equipamento: validado.data.equipamentoId,
    p_quantidade: validado.data.quantidade,
    p_data: validado.data.data ?? dataHojeISO(),
    p_obs: validado.data.observacao ?? "",
  };

  if (validado.data.horimetro !== undefined) {
    args.p_horimetro = validado.data.horimetro;
  }
  if (validado.data.km !== undefined) {
    args.p_km = validado.data.km;
  }
  if (validado.data.operadorId !== undefined) {
    args.p_operador = validado.data.operadorId;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_abastecer", args);

  if (error || !data) {
    return {
      erro: error?.message || "Não foi possível registrar o abastecimento",
    };
  }

  revalidatePath(ROTA);
  return { ok: true, id: data };
}
