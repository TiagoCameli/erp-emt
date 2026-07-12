"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Acao } from "@/config/recursos";
import type { Database, Json } from "@/lib/database.types";
import { erroAcao } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  checklistSchema,
  execucaoSchema,
  type ChecklistInput,
  type ExecucaoInput,
} from "@/modules/manutencao/checklists/schemas";

const RECURSO = "manutencao.checklists" as const;
const ROTA = "/manutencao/checklists";

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoExecucao =
  | { ok: true; id: string; abriuOs: boolean }
  | { erro: string };

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

/* ------------------------------------------------------------------ */
/* Modelos de checklist                                               */
/* ------------------------------------------------------------------ */

/** Perguntas validadas viram linhas de checklist_perguntas (ordem reindexada). */
function linhasPerguntas(
  checklistId: string,
  perguntas: ChecklistInput["perguntas"],
): { checklist_id: string; pergunta: string; ordem: number }[] {
  return perguntas.map((item, indice) => ({
    checklist_id: checklistId,
    pergunta: item.pergunta,
    ordem: indice,
  }));
}

/** Cria um modelo de checklist com suas perguntas. Gerenciar modelo = editar. */
export async function criarChecklist(
  dados: ChecklistInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para gerenciar checklists" };
  }

  const validado = checklistSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();

  const { data: checklist, error } = await supabase
    .from("checklists")
    .insert({
      nome: validado.data.nome,
      descricao: validado.data.descricao ?? null,
      ativo: validado.data.ativo,
    })
    .select("id")
    .single();

  if (error || !checklist) {
    return erroAcao(
      "manutencao.checklists.criarChecklist",
      error,
      "Não foi possível salvar o checklist. Tente novamente",
    );
  }

  const { error: erroPerguntas } = await supabase
    .from("checklist_perguntas")
    .insert(linhasPerguntas(checklist.id, validado.data.perguntas));

  if (erroPerguntas) {
    return erroAcao(
      "manutencao.checklists.criarChecklist",
      erroPerguntas,
      "Não foi possível salvar as perguntas. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Edita um modelo: atualiza o cabeçalho e regrava as perguntas (delete + insert
 * dentro do mesmo checklist). Gerenciar modelo = editar.
 */
export async function editarChecklist(
  id: string,
  dados: ChecklistInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para gerenciar checklists" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Checklist inválido" };

  const validado = checklistSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("checklists")
    .update({
      nome: validado.data.nome,
      descricao: validado.data.descricao ?? null,
      ativo: validado.data.ativo,
    })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "manutencao.checklists.editarChecklist",
      error,
      "Não foi possível salvar o checklist. Tente novamente",
    );
  }

  const { error: erroRemover } = await supabase
    .from("checklist_perguntas")
    .delete()
    .eq("checklist_id", idValido.data);

  if (erroRemover) {
    return erroAcao(
      "manutencao.checklists.editarChecklist",
      erroRemover,
      "Não foi possível atualizar as perguntas. Tente novamente",
    );
  }

  const { error: erroInserir } = await supabase
    .from("checklist_perguntas")
    .insert(linhasPerguntas(idValido.data, validado.data.perguntas));

  if (erroInserir) {
    return erroAcao(
      "manutencao.checklists.editarChecklist",
      erroInserir,
      "Não foi possível salvar as perguntas. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Ativa ou desativa um modelo de checklist. */
export async function alternarAtivoChecklist(
  id: string,
  ativo: boolean,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para gerenciar checklists" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Checklist inválido" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("checklists")
    .update({ ativo })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "manutencao.checklists.alternarAtivoChecklist",
      error,
      "Não foi possível alterar o status. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Execução do checklist                                              */
/* ------------------------------------------------------------------ */

/** Argumentos de fn_executar_checklist (operador/horímetro/km/obs opcionais). */
type ArgsExecutar = Database["public"]["Functions"]["fn_executar_checklist"]["Args"];

/**
 * Executa o checklist via fn_executar_checklist: grava a execução e as
 * respostas e, se houver item reprovado e a flag estiver ligada (e o usuário
 * puder abrir OS), abre uma OS corretiva e vincula às respostas 'nok'. A flag
 * de status 'com_pendencia' indica que houve reprovação para avisar no toast.
 */
export async function executarChecklist(
  dados: ExecucaoInput,
): Promise<ResultadoExecucao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para executar checklists" };
  }

  const validado = execucaoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const respostas: Json = validado.data.respostas.map((item) => ({
    pergunta_id: item.perguntaId,
    resposta: item.resposta,
    observacao: item.observacao ?? "",
  }));

  const args: ArgsExecutar = {
    p_checklist: validado.data.checklistId,
    p_equipamento: validado.data.equipamentoId,
    p_respostas: respostas,
    p_abrir_os: validado.data.abrirOs,
  };
  if (validado.data.operadorId) args.p_operador = validado.data.operadorId;
  if (validado.data.horimetro !== undefined) args.p_horimetro = validado.data.horimetro;
  if (validado.data.km !== undefined) args.p_km = validado.data.km;
  if (validado.data.observacao) args.p_obs = validado.data.observacao;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_executar_checklist", args);

  if (error || !data) {
    return erroAcao(
      "manutencao.checklists.executarChecklist",
      error,
      error?.message || "Não foi possível enviar o checklist",
    );
  }

  // Houve reprovação quando há ao menos um 'nok'; a OS só abre se a flag
  // estava ligada e o usuário tem permissão de abrir OS (checado no banco).
  const temNok = validado.data.respostas.some((item) => item.resposta === "nok");
  const abriuOs = temNok && validado.data.abrirOs;

  revalidatePath(ROTA);
  return { ok: true, id: data, abriuOs };
}
