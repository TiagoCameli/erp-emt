"use server";

import { revalidatePath } from "next/cache";

import type { Acao } from "@/config/recursos";
import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  diariaSchema,
  fecharSchema,
  type DiariaInput,
  type FecharInput,
} from "@/modules/rh/diaristas/schemas";

const RECURSO = "rh.diaristas" as const;
const ROTA = "/rh/diaristas";
const TABELA = "rh_diarias" as const;

export type ResultadoAcao = { ok: true } | { erro: string };

/** Converte o throw de exigirPermissao no contrato { erro } das actions. */
async function checarPermissao(acao: Acao): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/** Cria uma diária. A competência é o 1o dia do mês da data (derivada). */
export async function criarDiaria(dados: DiariaInput): Promise<ResultadoAcao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para registrar diárias" };
  }

  const validado = diariaSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from(TABELA).insert({
    colaborador_id: validado.data.colaboradorId,
    obra_id: validado.data.obraId ?? null,
    data: validado.data.data,
    competencia: validado.data.competencia,
    valor: validado.data.valor,
    observacao: validado.data.observacao ?? null,
  });

  if (error) {
    return erroAcao(
      "rh.diaristas.criar",
      error,
      "Não foi possível salvar a diária. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Edita uma diária, aberta ou já fechada, pela `fn_editar_diaria`. Na fechada o
 * banco acerta o lançamento a pagar com a nova soma, e recusa (com a mensagem
 * que vai para o toast) quando o pagamento já foi aprovado, pago ou conciliado,
 * quando a diária foi paga pela folha, ou quando a edição troca o diarista ou o
 * mês de uma diária fechada.
 */
export async function editarDiaria(
  id: string,
  dados: DiariaInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar diárias" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Diária inválida" };

  const validado = diariaSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_editar_diaria", {
    p_id: idValido.data,
    p_colaborador: validado.data.colaboradorId,
    // A RPC aceita null (sem obra); o tipo gerado não sabe disso.
    p_obra: (validado.data.obraId ?? null) as string,
    p_data: validado.data.data,
    p_valor: validado.data.valor,
    p_observacao: validado.data.observacao ?? "",
  });

  if (error) {
    return erroAcao(
      "rh.diaristas.editar",
      error,
      error.message || "Não foi possível salvar a diária. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Exclui uma diária, aberta ou já fechada, pela `fn_excluir_diaria`. Na fechada
 * o banco tira o valor dela do lançamento a pagar, ou apaga o lançamento quando
 * ela era a única. Mesmas travas da edição.
 */
export async function removerDiaria(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para excluir diárias" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Diária inválida" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_excluir_diaria", {
    p_id: idValido.data,
  });

  if (error) {
    return erroAcao(
      "rh.diaristas.remover",
      error,
      error.message || "Não foi possível excluir a diária. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Fecha as diárias em aberto de um diarista numa competência via
 * fn_fechar_diarias, que cria UM lançamento a pagar somando os valores e marca
 * as diárias.
 *
 * Vencimento e forma de pagamento são obrigatórios e vão SEMPRE. Antes o
 * vencimento só era enviado quando a tela tinha valor, e o lançamento nascia sem
 * data -- o `if` que faltava era o defeito. Quem recebe e em que categoria o
 * custo entra não vêm daqui: o trigger `trg_rh_completar_lancamento` deriva os
 * dois do cadastro, para os três caminhos do RH no mesmo lugar.
 */
export async function fecharDiarias(
  dados: FecharInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para fechar diárias" };
  }

  const validado = fecharSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_fechar_diarias", {
    p_colaborador: validado.data.colaboradorId,
    p_competencia: validado.data.competencia,
    p_data_vencimento: validado.data.dataVencimento,
    p_forma_pagamento: validado.data.formaPagamentoId,
  });

  if (error) {
    return erroAcao(
      "rh.diaristas.fechar",
      error,
      error.message || "Não foi possível fechar as diárias",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}
