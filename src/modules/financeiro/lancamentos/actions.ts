"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Json } from "@/lib/database.types";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  lancamentoSchema,
  type LancamentoInput,
} from "@/modules/financeiro/lancamentos/schemas";

const RECURSO = "financeiro.lancamentos" as const;
const ROTA = "/financeiro/lancamentos";

export type ResultadoCriacao = { ok: true; id: string } | { erro: string };

const uuidSchema = z.uuid();

/** Cabeçalho do lançamento no formato que a RPC espera (p_dados). */
function dadosParaRpc(dados: LancamentoInput): Json {
  return {
    tipo: dados.tipo,
    fornecedor_id: dados.fornecedorId ?? null,
    categoria_id: dados.categoriaId ?? null,
    descricao: dados.descricao,
    valor: dados.valor,
    competencia: dados.competencia ?? null,
    data_vencimento: dados.dataVencimento ?? null,
  };
}

/** Parcelas no formato que a RPC espera (p_parcelas). */
function parcelasParaRpc(dados: LancamentoInput): Json {
  return dados.parcelas.map((parcela) => ({
    numero_parcela: parcela.numeroParcela,
    valor: parcela.valor,
    data_vencimento: parcela.dataVencimento ?? null,
  }));
}

/** Rateios no formato que a RPC espera (p_rateios). */
function rateiosParaRpc(dados: LancamentoInput): Json {
  return dados.rateios.map((rateio) => ({
    centro_custo_id: rateio.centroCustoId,
    valor: rateio.valor,
  }));
}

/**
 * Cria (id null) ou edita (id) um lançamento manual com suas parcelas e
 * rateios via fn_salvar_lancamento. A RPC valida soma das parcelas = valor e
 * soma do rateio = valor; o erro do banco é repassado direto ao toast.
 *
 * Lançamentos de origem diferente de 'manual' (ex: 'oc', vindos de compras) são
 * somente-leitura aqui: o bloqueio de edição é da UI e do banco; esta action
 * só atende ao cadastro manual.
 */
export async function salvarLancamento(
  id: string | null,
  dados: LancamentoInput,
): Promise<ResultadoCriacao> {
  const acao = id === null ? "criar" : "editar";
  try {
    await exigirPermissao(RECURSO, acao);
  } catch {
    return {
      erro:
        id === null
          ? "Sem permissão para criar lançamentos"
          : "Sem permissão para editar lançamentos",
    };
  }

  if (id !== null) {
    const idValido = uuidSchema.safeParse(id);
    if (!idValido.success) return { erro: "Lançamento inválido" };
  }

  const validado = lancamentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_salvar_lancamento", {
    p_id: id as string,
    p_dados: dadosParaRpc(validado.data),
    p_parcelas: parcelasParaRpc(validado.data),
    p_rateios: rateiosParaRpc(validado.data),
  });

  if (error || !data) {
    return { erro: error?.message || "Não foi possível salvar o lançamento" };
  }

  revalidatePath(ROTA);
  return { ok: true, id: data };
}
