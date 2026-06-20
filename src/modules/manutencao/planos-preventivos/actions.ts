"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Acao, RecursoId } from "@/config/recursos";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  atribuicaoSchema,
  leituraSchema,
  planoSchema,
  type AtribuicaoInput,
  type LeituraInput,
  type PlanoInput,
} from "@/modules/manutencao/planos-preventivos/schemas";

const RECURSO = "manutencao.planos-preventivos" as const;
const RECURSO_OS = "manutencao.ordens-servico" as const;
const ROTA = "/manutencao/planos-preventivos";
const ROTA_OS = "/manutencao/ordens-servico";

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoCriacao = { ok: true; id: string } | { erro: string };

const uuidSchema = z.uuid();

/** Converte o throw de exigirPermissao no contrato { erro } das actions. */
async function checarPermissao(
  recurso: RecursoId,
  acao: Acao,
): Promise<boolean> {
  try {
    await exigirPermissao(recurso, acao);
    return true;
  } catch {
    return false;
  }
}

/** Mapeia as atividades validadas para os registros de plano_atividades. */
function atividadesParaRegistros(
  planoId: string,
  atividades: PlanoInput["atividades"],
) {
  return atividades.map((atividade, indice) => ({
    plano_id: planoId,
    descricao: atividade.descricao,
    intervalo_tipo: atividade.intervaloTipo,
    intervalo_valor: atividade.intervaloValor,
    ordem: indice,
  }));
}

/* ------------------------------------------------------------------ */
/* Modelos de plano                                                   */
/* ------------------------------------------------------------------ */

/** Cria um plano com suas atividades. */
export async function criarPlano(
  dados: PlanoInput,
): Promise<ResultadoCriacao> {
  if (!(await checarPermissao(RECURSO, "criar"))) {
    return { erro: "Sem permissão para criar planos" };
  }

  const validado = planoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data: plano, error } = await supabase
    .from("planos_preventivos")
    .insert({
      nome: validado.data.nome,
      descricao: validado.data.descricao,
      ativo: validado.data.ativo,
    })
    .select("id")
    .single();

  if (error || !plano) {
    if (error?.code === "23505") {
      return { erro: "Já existe um plano com este nome" };
    }
    return { erro: "Não foi possível salvar o plano. Tente novamente" };
  }

  const { error: erroAtividades } = await supabase
    .from("plano_atividades")
    .insert(atividadesParaRegistros(plano.id, validado.data.atividades));

  if (erroAtividades) {
    // Desfaz o plano sem atividades para não deixar cabeçalho órfão.
    await supabase.from("planos_preventivos").delete().eq("id", plano.id);
    return { erro: "Não foi possível salvar as atividades. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true, id: plano.id };
}

/**
 * Edita o plano e substitui suas atividades por inteiro. Sem transação no
 * supabase-js, guardamos as atividades antigas antes de apagar e as
 * restauramos se o insert falhar, para o plano nunca ficar sem atividade.
 */
export async function editarPlano(
  id: string,
  dados: PlanoInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao(RECURSO, "editar"))) {
    return { erro: "Sem permissão para editar planos" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Plano inválido" };

  const validado = planoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("planos_preventivos")
    .update({
      nome: validado.data.nome,
      descricao: validado.data.descricao,
      ativo: validado.data.ativo,
    })
    .eq("id", idValido.data);

  if (error) {
    if (error.code === "23505") {
      return { erro: "Já existe um plano com este nome" };
    }
    return { erro: "Não foi possível salvar o plano. Tente novamente" };
  }

  const { data: atividadesAntigas } = await supabase
    .from("plano_atividades")
    .select("plano_id, descricao, intervalo_tipo, intervalo_valor, ordem")
    .eq("plano_id", idValido.data);

  const { error: erroDelete } = await supabase
    .from("plano_atividades")
    .delete()
    .eq("plano_id", idValido.data);

  if (erroDelete) {
    return { erro: "Não foi possível atualizar as atividades. Tente novamente" };
  }

  const { error: erroAtividades } = await supabase
    .from("plano_atividades")
    .insert(atividadesParaRegistros(idValido.data, validado.data.atividades));

  if (erroAtividades) {
    // Restaura o estado anterior para não deixar o plano sem atividade.
    if (atividadesAntigas && atividadesAntigas.length > 0) {
      await supabase.from("plano_atividades").insert(atividadesAntigas);
    }
    return { erro: "Não foi possível salvar as atividades. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Ativa ou desativa um plano. */
export async function alternarAtivoPlano(
  id: string,
  ativo: boolean,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao(RECURSO, "editar"))) {
    return { erro: "Sem permissão para alterar planos" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Plano inválido" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("planos_preventivos")
    .update({ ativo })
    .eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível alterar o status. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Atribuição de plano a equipamento                                  */
/* ------------------------------------------------------------------ */

/** Atribui um plano a um equipamento com a base de cálculo. */
export async function atribuirPlano(
  dados: AtribuicaoInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao(RECURSO, "editar"))) {
    return { erro: "Sem permissão para atribuir planos" };
  }

  const validado = atribuicaoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("equipamento_planos").insert({
    equipamento_id: validado.data.equipamentoId,
    plano_id: validado.data.planoId,
    base_horimetro: validado.data.baseHorimetro ?? null,
    base_km: validado.data.baseKm ?? null,
    base_data: validado.data.baseData,
    ativo: true,
  });

  if (error) {
    if (error.code === "23505") {
      return { erro: "Esse plano já está atribuído a esse equipamento" };
    }
    return { erro: "Não foi possível atribuir o plano. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Remove uma atribuição de plano (delete direto, RLS editar). */
export async function removerAtribuicao(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao(RECURSO, "editar"))) {
    return { erro: "Sem permissão para remover atribuições" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Atribuição inválida" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("equipamento_planos")
    .delete()
    .eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível remover a atribuição. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Leitura manual                                                     */
/* ------------------------------------------------------------------ */

/** Registra uma leitura manual de horímetro/km (origem 'manual'). */
export async function registrarLeitura(
  dados: LeituraInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao(RECURSO, "editar"))) {
    return { erro: "Sem permissão para registrar leituras" };
  }

  const validado = leituraSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("leituras_equipamento").insert({
    equipamento_id: validado.data.equipamentoId,
    tipo: validado.data.tipo,
    valor: validado.data.valor,
    data: validado.data.data,
    origem: "manual",
  });

  if (error) {
    return { erro: error.message || "Não foi possível registrar a leitura" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Gerar OS preventiva                                                */
/* ------------------------------------------------------------------ */

/**
 * Gera a OS preventiva da atribuição via fn_gerar_os_preventiva, que cria a OS
 * e reseta a base de cálculo. Exige permissão de criar ordens de serviço.
 */
export async function gerarOsPreventiva(
  equipamentoPlanoId: string,
): Promise<ResultadoCriacao> {
  if (!(await checarPermissao(RECURSO_OS, "criar"))) {
    return { erro: "Sem permissão para gerar ordens de serviço" };
  }

  const idValido = uuidSchema.safeParse(equipamentoPlanoId);
  if (!idValido.success) return { erro: "Atribuição inválida" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_gerar_os_preventiva", {
    p_equip_plano: idValido.data,
  });

  if (error || !data) {
    return { erro: error?.message || "Não foi possível gerar a OS preventiva" };
  }

  revalidatePath(ROTA);
  revalidatePath(ROTA_OS);
  return { ok: true, id: data };
}
