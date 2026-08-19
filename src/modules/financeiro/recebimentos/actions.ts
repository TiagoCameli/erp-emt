"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  listarParcelasRecebidas,
  type FiltrosRecebidas,
  type RecebidasPagina,
} from "@/modules/financeiro/recebimentos/queries";

const RECURSO = "financeiro.recebimentos" as const;
const ROTA = "/financeiro/recebimentos";
/** A outra tela em que a mesma parcela aparece. */
const ROTA_LANCAMENTOS = "/financeiro/lancamentos";

export type ResultadoAcao = { ok: true } | { erro: string };

const dataSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Data inválida" });

/**
 * Dá um recebimento como recebido, via `fn_pagar_parcela`.
 *
 * A função do banco é a MESMA do pagamento, e é ela que sabe a diferença: no a
 * receber não há exigência de aprovação prévia nem de data programada, não há
 * trava de saldo (dinheiro entrando não pode estourar a conta) e o valor entra
 * SOMANDO no saldo. Ter uma segunda função só para o recebimento faria as duas
 * divergirem no primeiro ajuste de desconto ou juros.
 *
 * A mensagem de erro do banco é repassada direto ao toast: quem recusa é ele, e
 * traduzir a recusa aqui só produziria duas versões da mesma regra.
 */
export async function darComoRecebido(
  parcelaId: string,
  contaId: string,
  data: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para dar recebimentos como recebidos" };
  }

  const parcelaValida = idSchema.safeParse(parcelaId);
  if (!parcelaValida.success) return { erro: "Recebimento inválido" };

  const contaValida = idSchema.safeParse(contaId);
  if (!contaValida.success) return { erro: "Selecione a conta que recebeu" };

  const dataValida = dataSchema.safeParse(data);
  if (!dataValida.success) return { erro: "Informe a data do recebimento" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_pagar_parcela", {
    p_parcela_id: parcelaValida.data,
    p_conta_id: contaValida.data,
    p_data_pagamento: dataValida.data,
  });

  if (error) {
    return erroAcao(
      "financeiro.recebimentos.darComoRecebido",
      error,
      error.message || "Não foi possível registrar o recebimento",
    );
  }

  revalidatePath(ROTA);
  // O lançamento muda de status quando a última parcela é recebida, então a
  // lista de Lançamentos também sai de cache.
  revalidatePath(ROTA_LANCAMENTOS);
  return { ok: true };
}

/**
 * Busca uma página da aba "Recebidos" com os filtros já validados pela página.
 *
 * Existe porque a aba é paginada no servidor: a primeira página vem do Server
 * Component e as seguintes por aqui, levando os MESMOS filtros. Sem eles, a
 * segunda página voltaria sem filtro nenhum e a barra continuaria dizendo que
 * está filtrando.
 */
export async function buscarParcelasRecebidas(
  pagina: number,
  tamanho: number,
  filtros: FiltrosRecebidas,
): Promise<RecebidasPagina> {
  await exigirPermissao(RECURSO, "ver");
  return listarParcelasRecebidas({ pagina, tamanho, filtros });
}
