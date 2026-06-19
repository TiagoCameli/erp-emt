"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Acao } from "@/config/recursos";
import type { Json } from "@/lib/database.types";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  receberSchema,
  type ReceberParcelaInput,
  type ReceberRateioInput,
} from "@/modules/financeiro/contas-receber/schemas";

const RECURSO = "financeiro.contas-receber" as const;
const ROTA = "/financeiro/contas-receber";

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoCriacao = { ok: true; id: string } | { erro: string };

const uuidSchema = z.uuid();
const dataSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Data inválida" });

/** Converte o throw de exigirPermissao no contrato { erro } das actions. */
async function checarPermissao(acao: Acao): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/** Monta o payload `p_dados` do lançamento a receber para a RPC. */
function dadosParaRpc(dados: z.infer<typeof receberSchema>): Json {
  return {
    tipo: "a_receber",
    categoria_id: dados.categoriaId ?? null,
    descricao: dados.descricao,
    valor: dados.valor,
    competencia: dados.competencia ?? null,
    data_vencimento: dados.dataVencimento ?? null,
  };
}

/** Monta o payload `p_parcelas` para a RPC. */
function parcelasParaRpc(parcelas: ReceberParcelaInput[]): Json {
  return parcelas.map((parcela) => ({
    numero_parcela: parcela.numeroParcela,
    valor: parcela.valor,
    data_vencimento: parcela.dataVencimento ?? null,
  }));
}

/** Monta o payload `p_rateios` para a RPC. */
function rateiosParaRpc(rateios: ReceberRateioInput[]): Json {
  return rateios.map((rateio) => ({
    centro_custo_id: rateio.centroCustoId,
    valor: rateio.valor,
  }));
}

/**
 * Cria um lançamento a receber com suas parcelas e rateios via
 * fn_salvar_lancamento (tipo a_receber). A RPC valida no banco que a soma das
 * parcelas e a soma do rateio batem com o valor; a mensagem de erro do banco é
 * repassada direto ao toast.
 */
export async function criarReceber(
  dados: z.infer<typeof receberSchema>,
  parcelas: ReceberParcelaInput[],
  rateios: ReceberRateioInput[],
): Promise<ResultadoCriacao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para criar contas a receber" };
  }

  const validado = receberSchema.safeParse({ ...dados, parcelas, rateios });
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_salvar_lancamento", {
    p_id: null as unknown as string,
    p_dados: dadosParaRpc(validado.data),
    p_parcelas: parcelasParaRpc(validado.data.parcelas),
    p_rateios: rateiosParaRpc(validado.data.rateios),
  });

  if (error || !data) {
    return {
      erro: error?.message || "Não foi possível salvar a conta a receber",
    };
  }

  revalidatePath(ROTA);
  return { ok: true, id: data };
}

/**
 * Baixa um recebimento via fn_pagar_parcela. Para a_receber a baixa é direta
 * (não exige aprovação prévia). Repassa a mensagem de erro do banco ao toast.
 */
export async function baixarRecebimento(
  parcelaId: string,
  contaId: string,
  data: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para registrar recebimentos" };
  }

  const parcelaValida = uuidSchema.safeParse(parcelaId);
  if (!parcelaValida.success) return { erro: "Parcela inválida" };

  const contaValida = uuidSchema.safeParse(contaId);
  if (!contaValida.success) return { erro: "Selecione a conta bancária" };

  const dataValida = dataSchema.safeParse(data);
  if (!dataValida.success) return { erro: "Informe a data do recebimento" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_pagar_parcela", {
    p_parcela_id: parcelaValida.data,
    p_conta_id: contaValida.data,
    p_data_pagamento: dataValida.data,
  });

  if (error) {
    return { erro: error.message || "Não foi possível registrar o recebimento" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}
