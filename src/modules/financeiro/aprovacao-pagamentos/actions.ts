"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Acao } from "@/config/recursos";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

const RECURSO = "financeiro.aprovacao-pagamentos" as const;
const ROTA = "/financeiro/aprovacao-pagamentos";

export type ResultadoAcao = { ok: true } | { erro: string };

const uuidSchema = z.uuid();

/** Converte o throw de exigirPermissao no contrato { erro } das actions. */
async function checarPermissao(acao: Acao): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/**
 * Aprova uma parcela a pagar via RPC. A RPC valida o estado da parcela e
 * grava aprovado_por/aprovado_em; a mensagem de erro do banco é repassada
 * direto ao toast.
 */
export async function aprovarParcela(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Sem permissão para aprovar pagamentos" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Parcela inválida" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_aprovar_parcela", {
    p_parcela_id: idValido.data,
  });

  if (error) {
    return { erro: error.message || "Não foi possível aprovar o pagamento" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Rejeita uma parcela aguardando aprovação, com motivo registrado para a
 * auditoria. Usa a mesma RPC de desaprovação, que devolve a parcela ao fluxo
 * com o motivo gravado. A mensagem de erro do banco vai direto ao toast.
 */
export async function rejeitarParcela(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("desaprovar"))) {
    return { erro: "Sem permissão para rejeitar pagamentos" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Parcela inválida" };

  const motivoLimpo = motivo.trim();
  if (motivoLimpo === "") return { erro: "Informe o motivo da rejeição" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_desaprovar_parcela", {
    p_parcela_id: idValido.data,
    p_motivo: motivoLimpo,
  });

  if (error) {
    return { erro: error.message || "Não foi possível rejeitar o pagamento" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Aprova várias parcelas de uma vez. Para cada parcela aprovada com sucesso
 * incrementa o contador; se alguma falhar, interrompe e devolve a mensagem
 * do banco junto da contagem do que já passou, para o toast informar o
 * parcial. Revalida a rota uma única vez no fim.
 */
export async function aprovarParcelasEmLote(
  ids: string[],
): Promise<{ ok: true; aprovadas: number } | { erro: string; aprovadas: number }> {
  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Sem permissão para aprovar pagamentos", aprovadas: 0 };
  }

  const idsValidos = z.array(uuidSchema).min(1).safeParse(ids);
  if (!idsValidos.success) {
    return { erro: "Selecione ao menos um pagamento", aprovadas: 0 };
  }

  const supabase = await createClient();
  let aprovadas = 0;

  for (const id of idsValidos.data) {
    const { error } = await supabase.rpc("fn_aprovar_parcela", {
      p_parcela_id: id,
    });
    if (error) {
      revalidatePath(ROTA);
      return {
        erro: error.message || "Não foi possível aprovar o pagamento",
        aprovadas,
      };
    }
    aprovadas += 1;
  }

  revalidatePath(ROTA);
  return { ok: true, aprovadas };
}
