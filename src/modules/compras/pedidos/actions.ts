"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Acao } from "@/config/recursos";
import { erroAcao } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { pedidoSchema, type PedidoInput } from "@/modules/compras/pedidos/schemas";

const RECURSO = "compras.pedidos" as const;
const ROTA = "/compras/pedidos";
const TABELA = "pedidos" as const;

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoCriacao = { ok: true; id: string } | { erro: string };

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

/** Linha de pedido_itens pronta para inserir, ligada ao pedido. */
function itensParaRegistro(pedidoId: string, dados: PedidoInput) {
  return dados.itens.map((item) => ({
    pedido_id: pedidoId,
    insumo_id: item.insumoId,
    quantidade: item.quantidade,
    centro_custo_id: item.centroCustoId,
    deposito_id: item.depositoId ?? null,
    observacao: item.observacao ?? null,
  }));
}

/** Lê o status atual de um pedido. Null se não existir ou sem acesso. */
async function statusAtual(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<string | null> {
  const { data } = await supabase
    .from(TABELA)
    .select("status")
    .eq("id", id)
    .maybeSingle();
  return data?.status ?? null;
}

/**
 * Cria um pedido em rascunho com os itens. supabase-js não tem transação,
 * então insere o cabeçalho e depois os itens; se os itens falharem, desfaz
 * o cabeçalho para não deixar pedido órfão. RLS cobre os inserts.
 */
export async function criarPedido(
  dados: PedidoInput,
): Promise<ResultadoCriacao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para criar pedidos" };
  }

  const validado = pedidoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();

  const { data: pedido, error } = await supabase
    .from(TABELA)
    .insert({
      justificativa: validado.data.justificativa ?? null,
      status: "rascunho",
    })
    .select("id")
    .single();

  if (error || !pedido) {
    return erroAcao(
      "compras.pedidos.criarPedido",
      error,
      "Não foi possível salvar o pedido. Tente novamente",
    );
  }

  const { error: erroItens } = await supabase
    .from("pedido_itens")
    .insert(itensParaRegistro(pedido.id, validado.data));

  if (erroItens) {
    await supabase.from(TABELA).delete().eq("id", pedido.id);
    return erroAcao(
      "compras.pedidos.criarPedido",
      erroItens,
      "Não foi possível salvar os itens do pedido. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true, id: pedido.id };
}

/**
 * Edita um pedido em rascunho ou pendente. Não há transação no supabase-js,
 * então apagamos os pedido_itens existentes e inserimos os novos (documentado:
 * a edição reescreve os itens em vez de fazer diff). RLS cobre tudo.
 */
export async function editarPedido(
  id: string,
  dados: PedidoInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar pedidos" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Pedido inválido" };

  const validado = pedidoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();

  const status = await statusAtual(supabase, idValido.data);
  if (status === null) return { erro: "Pedido não encontrado" };
  if (status !== "rascunho" && status !== "pendente_aprovacao") {
    return { erro: "Só dá para editar pedido em rascunho ou pendente" };
  }

  const { error } = await supabase
    .from(TABELA)
    .update({ justificativa: validado.data.justificativa ?? null })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "compras.pedidos.editarPedido",
      error,
      "Não foi possível salvar o pedido. Tente novamente",
    );
  }

  // Reescreve os itens: apaga os atuais e insere os novos. Sem transação no
  // supabase-js, guardamos os itens antigos antes de apagar e os restauramos
  // se o insert falhar, para o pedido nunca ficar sem nenhum item.
  const { data: itensAntigos } = await supabase
    .from("pedido_itens")
    .select(
      "pedido_id, insumo_id, quantidade, centro_custo_id, deposito_id, observacao",
    )
    .eq("pedido_id", idValido.data);

  const { error: erroApagar } = await supabase
    .from("pedido_itens")
    .delete()
    .eq("pedido_id", idValido.data);

  if (erroApagar) {
    return erroAcao(
      "compras.pedidos.editarPedido",
      erroApagar,
      "Não foi possível atualizar os itens. Tente novamente",
    );
  }

  const { error: erroItens } = await supabase
    .from("pedido_itens")
    .insert(itensParaRegistro(idValido.data, validado.data));

  if (erroItens) {
    // Restaura o estado anterior para não deixar o pedido sem itens.
    if (itensAntigos && itensAntigos.length > 0) {
      await supabase.from("pedido_itens").insert(itensAntigos);
    }
    return erroAcao(
      "compras.pedidos.editarPedido",
      erroItens,
      "Não foi possível salvar os itens do pedido. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Envia o pedido para aprovação: rascunho -> pendente_aprovacao. */
export async function enviarParaAprovacao(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para enviar pedidos para aprovação" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Pedido inválido" };

  const supabase = await createClient();

  const status = await statusAtual(supabase, idValido.data);
  if (status === null) return { erro: "Pedido não encontrado" };
  if (status !== "rascunho") {
    return { erro: "Só dá para enviar um pedido em rascunho" };
  }

  const { error } = await supabase
    .from(TABELA)
    .update({ status: "pendente_aprovacao" })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "compras.pedidos.enviarParaAprovacao",
      error,
      "Não foi possível enviar o pedido. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Aprova o pedido: pendente_aprovacao -> aprovado, marcando quem aprovou e
 * quando. Exige a permissão de aprovar.
 */
export async function aprovarPedido(id: string): Promise<ResultadoAcao> {
  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Pedido inválido" };

  let usuarioId: string;
  try {
    const usuario = await exigirPermissao(RECURSO, "aprovar");
    usuarioId = usuario.id;
  } catch {
    return { erro: "Sem permissão para aprovar pedidos" };
  }

  const supabase = await createClient();

  const status = await statusAtual(supabase, idValido.data);
  if (status === null) return { erro: "Pedido não encontrado" };
  if (status !== "pendente_aprovacao") {
    return { erro: "O pedido precisa estar pendente de aprovação" };
  }

  const { error } = await supabase
    .from(TABELA)
    .update({
      status: "aprovado",
      aprovado_por: usuarioId,
      aprovado_em: new Date().toISOString(),
      motivo_rejeicao: null,
    })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "compras.pedidos.aprovarPedido",
      error,
      "Não foi possível aprovar o pedido. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Rejeita o pedido: pendente_aprovacao -> rejeitado com o motivo.
 * Exige a permissão de aprovar.
 */
export async function rejeitarPedido(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Pedido inválido" };

  const motivoLimpo = motivo.trim();
  if (motivoLimpo.length === 0) {
    return { erro: "Informe o motivo da rejeição" };
  }

  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Sem permissão para rejeitar pedidos" };
  }

  const supabase = await createClient();

  const status = await statusAtual(supabase, idValido.data);
  if (status === null) return { erro: "Pedido não encontrado" };
  if (status !== "pendente_aprovacao") {
    return { erro: "O pedido precisa estar pendente de aprovação" };
  }

  const { error } = await supabase
    .from(TABELA)
    .update({ status: "rejeitado", motivo_rejeicao: motivoLimpo })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "compras.pedidos.rejeitarPedido",
      error,
      "Não foi possível rejeitar o pedido. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Desaprova o pedido: aprovado -> pendente_aprovacao com o motivo, limpando
 * os dados de aprovação. Exige a permissão de desaprovar.
 */
export async function desaprovarPedido(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Pedido inválido" };

  const motivoLimpo = motivo.trim();
  if (motivoLimpo.length === 0) {
    return { erro: "Informe o motivo da desaprovação" };
  }

  if (!(await checarPermissao("desaprovar"))) {
    return { erro: "Sem permissão para desaprovar pedidos" };
  }

  const supabase = await createClient();

  const status = await statusAtual(supabase, idValido.data);
  if (status === null) return { erro: "Pedido não encontrado" };
  if (status !== "aprovado") {
    return { erro: "Só dá para desaprovar um pedido aprovado" };
  }

  const { error } = await supabase
    .from(TABELA)
    .update({
      status: "pendente_aprovacao",
      aprovado_por: null,
      aprovado_em: null,
      motivo_rejeicao: motivoLimpo,
    })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "compras.pedidos.desaprovarPedido",
      error,
      "Não foi possível desaprovar o pedido. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Cancela o pedido com o motivo, desde que não esteja já cancelado.
 * Exige a permissão de editar.
 */
export async function cancelarPedido(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Pedido inválido" };

  const motivoLimpo = motivo.trim();
  if (motivoLimpo.length === 0) {
    return { erro: "Informe o motivo do cancelamento" };
  }

  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para cancelar pedidos" };
  }

  const supabase = await createClient();

  const status = await statusAtual(supabase, idValido.data);
  if (status === null) return { erro: "Pedido não encontrado" };
  if (status === "cancelado") {
    return { erro: "O pedido já está cancelado" };
  }

  const { error } = await supabase
    .from(TABELA)
    .update({ status: "cancelado", motivo_rejeicao: motivoLimpo })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "compras.pedidos.cancelarPedido",
      error,
      "Não foi possível cancelar o pedido. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}
