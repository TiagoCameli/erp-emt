"use server";

import { revalidatePath } from "next/cache";

import type { Acao } from "@/config/recursos";
import { logErroServidor } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  adicionarAoLoteSchema,
  definirVencimentoSchema,
  editarItemSchema,
  gerarLoteSchema,
  motivoSchema,
  tirarDoLoteSchema,
} from "@/modules/rh/decimo-terceiro/schemas";

const RECURSO = "rh.decimo-terceiro-ferias" as const;
const ROTA = "/rh/decimo-terceiro-e-ferias";

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoGeracao = { ok: true; id: string } | { erro: string };

/**
 * Só devolve `error.message` ao usuário quando é um `raise exception` nosso
 * (SQLSTATE P0001, o default do plpgsql). Qualquer outro código é
 * infraestrutura e vai só pro log.
 *
 * Aqui isso é o que faz o toast dizer "Não há faixas de INSS cadastradas.
 * Cadastre em /rh/parametros-folha antes de gerar uma parcela com desconto"
 * em vez de "não foi possível". Sem isso as três travas do banco ficam mudas
 * e o operador não sabe o que corrigir.
 */
function mensagemDeNegocio(
  operacao: string,
  error: { code?: string; message?: string } | null | undefined,
  fallback: string,
): string {
  if (error?.code === "P0001" && error.message) return error.message;
  logErroServidor(`rh.decimo-terceiro.${operacao}`, error);
  return fallback;
}

async function checarPermissao(acao: Acao): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/**
 * Revalida a lista E o detalhe. `revalidatePath(ROTA)` sozinho não alcança
 * `/13o/[id]`: rota dinâmica precisa do segundo argumento "page", e sem ele a
 * tela do lote continuaria mostrando o valor anterior depois de editar.
 *
 * Tudo dentro de try/catch, e de propósito: a revalidação roda DEPOIS de a RPC
 * ter commitado. Se ela estourar, o dinheiro já foi gravado, e devolver erro
 * aqui faria o usuário clicar de novo num lote que já está aprovado. Falha de
 * revalidação é problema de cache, vai para o log e não para a resposta.
 */
function revalidarTelas(...extras: string[]): void {
  try {
    revalidatePath(ROTA);
    revalidatePath(`${ROTA}/13o/[id]`, "page");
    for (const caminho of extras) revalidatePath(caminho);
  } catch (erro) {
    logErroServidor("rh.decimo-terceiro.revalidar", erro);
  }
}

export async function gerarLote(dados: unknown): Promise<ResultadoGeracao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Você não tem permissão para gerar o 13º" };
  }

  const validado = gerarLoteSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_gerar_decimo_terceiro", {
    p_ano: validado.data.ano,
    p_parcela: validado.data.parcela,
    // `?? undefined` OMITE o parâmetro e deixa valer o DEFAULT do banco.
    // "não informado" é estado legítimo: sem vencimento a RPC usa 20/12.
    p_data_vencimento: validado.data.dataVencimento ?? undefined,
  });

  if (error || !data) {
    return { erro: mensagemDeNegocio("gerar", error, "Não foi possível gerar o lote") };
  }

  revalidarTelas();
  return { ok: true, id: data };
}

export async function editarItem(dados: unknown): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Você não tem permissão para editar o 13º" };
  }

  const validado = editarItemSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_editar_item_decimo_terceiro", {
    p_item: validado.data.itemId,
    p_bruto: validado.data.bruto,
    p_inss: validado.data.inss,
    p_irrf: validado.data.irrf,
  });

  if (error) {
    return { erro: mensagemDeNegocio("editar-item", error, "Não foi possível salvar o valor") };
  }

  revalidarTelas();
  return { ok: true };
}

export async function enviarParaAprovacao(loteId: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Você não tem permissão para enviar o 13º para aprovação" };
  }
  if (!idSchema.safeParse(loteId).success) {
    return { erro: "Lote inválido" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_enviar_decimo_terceiro_aprovacao", {
    p_lote: loteId,
  });

  if (error) {
    return { erro: mensagemDeNegocio("enviar", error, "Não foi possível enviar para aprovação") };
  }

  revalidarTelas();
  return { ok: true };
}

export async function aprovarLote(loteId: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Você não tem permissão para aprovar o 13º" };
  }
  if (!idSchema.safeParse(loteId).success) {
    return { erro: "Lote inválido" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_aprovar_decimo_terceiro", {
    p_lote: loteId,
  });

  if (error) {
    return { erro: mensagemDeNegocio("aprovar", error, "Não foi possível aprovar o lote") };
  }

  // A aprovação cria uma conta a pagar por colaborador e as guias: o
  // financeiro passa a mostrar outra coisa.
  revalidarTelas("/financeiro/lancamentos", "/financeiro/pagamentos");
  return { ok: true };
}

export async function rejeitarLote(dados: unknown): Promise<ResultadoAcao> {
  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Você não tem permissão para rejeitar o 13º" };
  }

  const validado = motivoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_rejeitar_decimo_terceiro", {
    p_lote: validado.data.loteId,
    p_motivo: validado.data.motivo,
  });

  if (error) {
    return { erro: mensagemDeNegocio("rejeitar", error, "Não foi possível rejeitar o lote") };
  }

  revalidarTelas();
  return { ok: true };
}

export async function desaprovarLote(dados: unknown): Promise<ResultadoAcao> {
  if (!(await checarPermissao("desaprovar"))) {
    return { erro: "Você não tem permissão para desaprovar o 13º" };
  }

  const validado = motivoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_desaprovar_decimo_terceiro", {
    p_lote: validado.data.loteId,
    p_motivo: validado.data.motivo,
  });

  if (error) {
    return { erro: mensagemDeNegocio("desaprovar", error, "Não foi possível desaprovar o lote") };
  }

  // Desaprovar APAGA os lançamentos: o financeiro tem que largar o cache.
  revalidarTelas("/financeiro/lancamentos", "/financeiro/pagamentos");
  return { ok: true };
}

export async function excluirLote(dados: unknown): Promise<ResultadoAcao> {
  if (!(await checarPermissao("excluir"))) {
    return { erro: "Você não tem permissão para excluir o 13º" };
  }

  const validado = motivoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_excluir_decimo_terceiro", {
    p_lote: validado.data.loteId,
    p_motivo: validado.data.motivo,
  });

  if (error) {
    return { erro: mensagemDeNegocio("excluir", error, "Não foi possível excluir o lote") };
  }

  revalidarTelas();
  return { ok: true };
}

export async function tirarDoLote(dados: unknown): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Você não tem permissão para editar o 13º" };
  }

  const validado = tirarDoLoteSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_tirar_do_lote_decimo_terceiro", {
    p_item: validado.data.itemId,
  });

  if (error) {
    return { erro: mensagemDeNegocio("tirar-do-lote", error, "Não foi possível tirar do lote") };
  }

  revalidarTelas();
  return { ok: true };
}

export async function adicionarAoLote(dados: unknown): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Você não tem permissão para editar o 13º" };
  }

  const validado = adicionarAoLoteSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_adicionar_ao_lote_decimo_terceiro", {
    p_lote: validado.data.loteId,
    p_colaborador: validado.data.colaboradorId,
  });

  if (error) {
    return { erro: mensagemDeNegocio("adicionar-ao-lote", error, "Não foi possível acrescentar ao lote") };
  }

  revalidarTelas();
  return { ok: true };
}

/**
 * Traz o lote pendente de volta para rascunho, do lado de quem montou.
 *
 * Não é o mesmo que `rejeitarLote`: aquele é do lado de quem APROVA, exige
 * motivo e fica registrado. Este é correção antes de alguém aprovar, e existe
 * porque sem ele um lote enviado por engano só volta pelas mãos de quem tem
 * permissão de aprovar.
 */
export async function voltarParaRascunho(loteId: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Você não tem permissão para editar o 13º" };
  }
  if (!idSchema.safeParse(loteId).success) {
    return { erro: "Lote inválido" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_voltar_decimo_terceiro_para_rascunho", {
    p_lote: loteId,
  });

  if (error) {
    return {
      erro: mensagemDeNegocio("voltar-rascunho", error, "Não foi possível voltar para rascunho"),
    };
  }

  revalidarTelas();
  return { ok: true };
}

/**
 * Define o vencimento do lote. Só em rascunho, e a RPC é quem recusa fora dele.
 *
 * `null` apaga a data escolhida e volta ao padrão do banco (20/12 do ano). É o
 * único jeito de desfazer sem regerar o lote, e regerar aqui não existe.
 */
export async function definirVencimento(dados: unknown): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Você não tem permissão para editar o 13º" };
  }

  const validado = definirVencimentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_definir_vencimento_decimo_terceiro", {
    p_lote: validado.data.loteId,
    p_data: validado.data.dataVencimento,
  });

  if (error) {
    return {
      erro: mensagemDeNegocio("vencimento", error, "Não foi possível salvar o vencimento"),
    };
  }

  revalidarTelas();
  return { ok: true };
}
