"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  condicaoPagamentoSchema,
  type CondicaoPagamentoInput,
} from "@/modules/cadastros/condicoes-pagamento/schemas";

const RECURSO = "cadastros.condicoes-pagamento" as const;
const ROTA = "/cadastros/condicoes-pagamento";
const TABELA = "condicoes_pagamento" as const;

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoCriacao = { ok: true; id: string } | { erro: string };

const uuidSchema = z.uuid();

const ERRO_DESCRICAO_DUPLICADA =
  "Já existe uma condição de pagamento com esta descrição";

/** Payload das parcelas no formato esperado pela RPC salvar_condicao. */
function parcelasParaRpc(parcelas: CondicaoPagamentoInput["parcelas"]) {
  return parcelas.map((parcela) => ({
    dias_offset: parcela.diasOffset,
    percentual: parcela.percentual,
  }));
}

/**
 * Cria uma condição de pagamento com suas parcelas. Cabeçalho (descrição,
 * ativo) e parcelas são gravados numa transação só pela RPC
 * salvar_condicao (security definer): não há grant de INSERT/DELETE direto
 * em condicao_parcelas nem de DELETE em condicoes_pagamento para o client,
 * e a RPC valida de novo que a soma dos percentuais fecha em 100. Como
 * tudo roda na mesma transação da chamada, uma falha na validação (ou na
 * checagem de permissão) desfaz o cabeçalho junto — nunca fica uma
 * condição órfã sem parcelas.
 */
export async function criarCondicao(
  dados: CondicaoPagamentoInput,
): Promise<ResultadoCriacao> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para criar condições de pagamento" };
  }

  const validado = condicaoPagamentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("salvar_condicao", {
    p_id: null,
    p_descricao: validado.data.descricao,
    p_ativo: validado.data.ativo,
    p_parcelas: parcelasParaRpc(validado.data.parcelas),
  });

  if (error || !id) {
    if (error?.code === "23505") {
      return { erro: ERRO_DESCRICAO_DUPLICADA };
    }
    return erroAcao(
      "cadastros.condicoes-pagamento.criarCondicao",
      error,
      error?.message ||
        "Não foi possível salvar a condição de pagamento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true, id };
}

/**
 * Edita a descrição/status e substitui por inteiro as parcelas de uma
 * condição existente. Cabeçalho e parcelas são gravados numa transação só
 * pela RPC salvar_condicao (mesma usada em criarCondicao).
 */
export async function editarCondicao(
  id: string,
  dados: CondicaoPagamentoInput,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para editar condições de pagamento" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Condição de pagamento inválida" };

  const validado = condicaoPagamentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("salvar_condicao", {
    p_id: idValido.data,
    p_descricao: validado.data.descricao,
    p_ativo: validado.data.ativo,
    p_parcelas: parcelasParaRpc(validado.data.parcelas),
  });

  if (error) {
    if (error.code === "23505") {
      return { erro: ERRO_DESCRICAO_DUPLICADA };
    }
    return erroAcao(
      "cadastros.condicoes-pagamento.editarCondicao",
      error,
      error.message ||
        "Não foi possível salvar a condição de pagamento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Desativa uma condição de pagamento (soft delete via ativo=false). As
 * condições são reusadas por OCs/cotações já emitidas, então nunca são
 * removidas fisicamente — só somem das opções de novos lançamentos.
 */
export async function desativarCondicao(id: string): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para desativar condições de pagamento" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Condição de pagamento inválida" };

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA)
    .update({ ativo: false })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "cadastros.condicoes-pagamento.desativarCondicao",
      error,
      "Não foi possível desativar a condição de pagamento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}
