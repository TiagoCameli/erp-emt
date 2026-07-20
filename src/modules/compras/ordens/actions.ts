"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Acao } from "@/config/recursos";
import { erroAcao } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  ordemCompraSchema,
  type OrdemCompraInput,
} from "@/modules/compras/ordens/schemas";

const RECURSO = "compras.ordens" as const;
const ROTA = "/compras/ordens";
const TABELA = "ordens_compra" as const;

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoCriacao = { ok: true; id: string } | { erro: string };

const uuidSchema = z.uuid();

/** Status em que a OC ainda é editável (sem efeito financeiro). */
const STATUS_EDITAVEIS = new Set(["rascunho", "pendente_aprovacao"]);

/** Converte o throw de exigirPermissao no contrato { erro } das actions. */
async function checarPermissao(acao: Acao): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/** Mapeia os itens validados para os registros de oc_itens. */
function itensParaRegistros(
  ordemCompraId: string,
  itens: OrdemCompraInput["itens"],
) {
  return itens.map((item) => ({
    ordem_compra_id: ordemCompraId,
    insumo_id: item.insumoId,
    quantidade: item.quantidade,
    preco_unitario: item.precoUnitario,
    centro_custo_id: item.centroCustoId,
  }));
}

/** Cabeçalho da OC para insert/update, sem campos de status nem valor_total. */
function cabecalhoParaRegistro(dados: OrdemCompraInput) {
  return {
    fornecedor_id: dados.fornecedorId,
    condicao_pagamento: dados.condicaoPagamento ?? null,
    cotacao_id: dados.cotacaoId ?? null,
    data_emissao: dados.dataEmissao,
    observacoes: dados.observacoes ?? null,
  };
}

/**
 * Cria uma OC em rascunho com seus itens. O valor_total é calculado pelo
 * trigger do banco, nunca no app. RLS cobre os inserts.
 */
export async function criarOrdem(
  dados: OrdemCompraInput,
): Promise<ResultadoCriacao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para criar ordens de compra" };
  }

  const validado = ordemCompraSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data: ordem, error } = await supabase
    .from(TABELA)
    .insert({ ...cabecalhoParaRegistro(validado.data), status: "rascunho" })
    .select("id")
    .single();

  if (error || !ordem) {
    return erroAcao(
      "compras.ordens.criarOrdem",
      error,
      "Não foi possível salvar a ordem de compra. Tente novamente",
    );
  }

  const { error: erroItens } = await supabase
    .from("oc_itens")
    .insert(itensParaRegistros(ordem.id, validado.data.itens));

  if (erroItens) {
    // Desfaz a OC sem itens para não deixar cabeçalho órfão.
    await supabase.from(TABELA).delete().eq("id", ordem.id);
    return erroAcao(
      "compras.ordens.criarOrdem",
      erroItens,
      "Não foi possível salvar os itens. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true, id: ordem.id };
}

/**
 * Edita a OC e substitui os itens dela. Só em rascunho ou pendente: OC
 * aprovada precisa ser desaprovada antes (regra de ouro 8). Os itens são
 * trocados por inteiro; o trigger recalcula o valor_total.
 */
export async function editarOrdem(
  id: string,
  dados: OrdemCompraInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar ordens de compra" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Ordem de compra inválida" };

  const validado = ordemCompraSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();

  const { data: atual, error: erroBusca } = await supabase
    .from(TABELA)
    .select("status")
    .eq("id", idValido.data)
    .single();

  if (erroBusca || !atual) {
    return erroAcao(
      "compras.ordens.editarOrdem",
      erroBusca,
      "Ordem de compra não encontrada",
    );
  }
  if (!STATUS_EDITAVEIS.has(atual.status)) {
    return {
      erro: "Só dá para editar ordens em rascunho ou pendentes. Desaprove antes de alterar",
    };
  }

  const { error } = await supabase
    .from(TABELA)
    .update(cabecalhoParaRegistro(validado.data))
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "compras.ordens.editarOrdem",
      error,
      "Não foi possível salvar a ordem de compra. Tente novamente",
    );
  }

  // Troca os itens por inteiro: apaga os antigos e insere os novos. Sem
  // transação no supabase-js, guardamos os itens antigos antes de apagar e os
  // restauramos se o insert falhar, para a OC nunca ficar sem nenhum item.
  const { data: itensAntigos } = await supabase
    .from("oc_itens")
    .select(
      "ordem_compra_id, insumo_id, quantidade, preco_unitario, centro_custo_id",
    )
    .eq("ordem_compra_id", idValido.data);

  const { error: erroDelete } = await supabase
    .from("oc_itens")
    .delete()
    .eq("ordem_compra_id", idValido.data);

  if (erroDelete) {
    return erroAcao(
      "compras.ordens.editarOrdem",
      erroDelete,
      "Não foi possível atualizar os itens. Tente novamente",
    );
  }

  const { error: erroItens } = await supabase
    .from("oc_itens")
    .insert(itensParaRegistros(idValido.data, validado.data.itens));

  if (erroItens) {
    // Restaura o estado anterior para não deixar a OC sem itens.
    if (itensAntigos && itensAntigos.length > 0) {
      await supabase.from("oc_itens").insert(itensAntigos);
    }
    return erroAcao(
      "compras.ordens.editarOrdem",
      erroItens,
      "Não foi possível salvar os itens. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Atualiza só o status da OC, com a guarda de transição esperada. */
async function transicionarStatus(
  id: string,
  acao: Acao,
  statusEsperado: string,
  novoStatus: string,
  extra: { motivo_rejeicao?: string | null } = {},
): Promise<ResultadoAcao> {
  if (!(await checarPermissao(acao))) {
    return { erro: `Sem permissão para esta ação em ordens de compra` };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Ordem de compra inválida" };

  const supabase = await createClient();
  const { data: atual, error: erroBusca } = await supabase
    .from(TABELA)
    .select("status")
    .eq("id", idValido.data)
    .single();

  if (erroBusca || !atual) {
    return erroAcao(
      "compras.ordens.transicionarStatus",
      erroBusca,
      "Ordem de compra não encontrada",
    );
  }
  if (atual.status !== statusEsperado) {
    return { erro: "A ordem não está no status esperado para esta ação" };
  }

  const { error } = await supabase
    .from(TABELA)
    .update({ status: novoStatus, ...extra })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "compras.ordens.transicionarStatus",
      error,
      "Não foi possível atualizar a ordem de compra. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Envia a OC de rascunho para aprovação. */
export async function enviarParaAprovacao(id: string): Promise<ResultadoAcao> {
  return transicionarStatus(id, "editar", "rascunho", "pendente_aprovacao", {
    motivo_rejeicao: null,
  });
}

/**
 * Aprova a OC via RPC, que gera o lançamento financeiro previsto. Repassa
 * a mensagem de erro do banco direto para o toast.
 */
export async function aprovarOrdem(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Sem permissão para aprovar ordens de compra" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Ordem de compra inválida" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_aprovar_ordem_compra", {
    p_oc_id: idValido.data,
  });

  if (error) {
    return erroAcao(
      "compras.ordens.aprovarOrdem",
      error,
      error.message || "Não foi possível aprovar a ordem de compra",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Rejeita a OC pendente, com motivo registrado para a auditoria. */
export async function rejeitarOrdem(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  const motivoLimpo = motivo.trim();
  if (motivoLimpo === "") return { erro: "Informe o motivo da rejeição" };

  return transicionarStatus(id, "aprovar", "pendente_aprovacao", "rejeitado", {
    motivo_rejeicao: motivoLimpo,
  });
}

/**
 * Desaprova a OC via RPC: volta para pendente e cancela o lançamento
 * previsto. Erros de regra vêm da RPC com mensagem clara, repassada ao toast.
 */
export async function desaprovarOrdem(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("desaprovar"))) {
    return { erro: "Sem permissão para desaprovar ordens de compra" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Ordem de compra inválida" };

  const motivoLimpo = motivo.trim();
  if (motivoLimpo === "") return { erro: "Informe o motivo da desaprovação" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_desaprovar_ordem_compra", {
    p_oc_id: idValido.data,
    p_motivo: motivoLimpo,
  });

  if (error) {
    return erroAcao(
      "compras.ordens.desaprovarOrdem",
      error,
      error.message || "Não foi possível desaprovar a ordem de compra",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Cancela a OC, com motivo registrado para a auditoria. */
export async function cancelarOrdem(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para cancelar ordens de compra" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Ordem de compra inválida" };

  const motivoLimpo = motivo.trim();
  if (motivoLimpo === "") return { erro: "Informe o motivo do cancelamento" };

  const supabase = await createClient();
  const { data: atual, error: erroBusca } = await supabase
    .from(TABELA)
    .select("status")
    .eq("id", idValido.data)
    .single();

  if (erroBusca || !atual) {
    return erroAcao(
      "compras.ordens.cancelarOrdem",
      erroBusca,
      "Ordem de compra não encontrada",
    );
  }
  if (atual.status === "cancelado") {
    return { erro: "A ordem já está cancelada" };
  }
  if (atual.status === "aprovado") {
    return { erro: "Desaprove a ordem antes de cancelar" };
  }

  const { error } = await supabase
    .from(TABELA)
    .update({ status: "cancelado", motivo_rejeicao: motivoLimpo })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "compras.ordens.cancelarOrdem",
      error,
      "Não foi possível cancelar a ordem de compra. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}
