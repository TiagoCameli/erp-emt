"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  listarParcelasPagas,
  type ParcelasPagasPagina,
} from "@/modules/financeiro/pagamentos/queries";

const RECURSO = "financeiro.pagamentos" as const;
const ROTA = "/financeiro/pagamentos";

export type ResultadoAcao = { ok: true } | { erro: string };

const uuidSchema = z.uuid();
const dataSchema = z.iso.date();

/**
 * Registra o pagamento de uma parcela via RPC. A_pagar exige parcela já
 * aprovada (a regra é validada no banco). Repassa a mensagem de erro do
 * banco direto para o toast. Sem anexo de comprovante nesta fase.
 */
export async function pagarParcela(
  id: string,
  contaBancariaId: string,
  dataPagamento: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para registrar pagamentos" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Parcela inválida" };

  const contaValida = uuidSchema.safeParse(contaBancariaId);
  if (!contaValida.success) return { erro: "Selecione a conta bancária" };

  const dataValida = dataSchema.safeParse(dataPagamento);
  if (!dataValida.success) return { erro: "Informe a data do pagamento" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_pagar_parcela", {
    p_parcela_id: idValido.data,
    p_conta_id: contaValida.data,
    p_data_pagamento: dataValida.data,
  });

  if (error) {
    return { erro: error.message || "Não foi possível registrar o pagamento" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Página do histórico de pagamentos, para a paginação server-side da tabela
 * "Pagas". Exige só a permissão de ver (a RLS no banco é a barreira final).
 */
export async function buscarParcelasPagas(
  pagina: number,
  tamanho: number,
): Promise<ParcelasPagasPagina> {
  await exigirPermissao(RECURSO, "ver");
  return listarParcelasPagas({ pagina, tamanho });
}
