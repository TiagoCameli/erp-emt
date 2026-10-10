"use server";

import { revalidatePath } from "next/cache";

import type { Json } from "@/lib/database.types";
import { erroAcao, semLancar } from "@/lib/erros";
import { mensagemDeNegocio } from "@/lib/erros-banco";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { STATUS_CRONOGRAMA, type StatusCronograma } from "@/modules/execucao/_shared/rotulos";
import type { AtividadeGrade, LinhaLote } from "@/modules/execucao/cronogramas/edicao";
import { atividadesDoCronograma } from "@/modules/execucao/cronogramas/queries";
import { cronogramaSchema, motivoSchema, payloadDoCronograma, type CronogramaInput } from "@/modules/execucao/cronogramas/schemas";

/**
 * Mutações do cronograma e da grade. Só por RPC: o banco confere de novo a ação e a lista da obra,
 * valida, grava tudo ou nada e recalcula as datas (CPM). A grade troca tudo pelo que volta relido.
 */

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoGrade = { ok: true; atividades: AtividadeGrade[] } | { erro: string };

const RECURSO = "execucao.cronogramas" as const;
const MAX_LINHAS = 3000;

async function pode(acao: "criar" | "editar" | "excluir"): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

function revalidar(cronogramaId?: string) {
  for (const rota of ["/execucao/cronogramas", "/execucao/obras", ...(cronogramaId ? [`/execucao/cronogramas/${cronogramaId}`] : [])]) {
    try {
      revalidatePath(rota);
    } catch {
      // O sucesso já aconteceu.
    }
  }
}

async function relidas(cronogramaId: string): Promise<ResultadoGrade> {
  revalidar(cronogramaId);
  return { ok: true, atividades: await atividadesDoCronograma(cronogramaId) };
}

export async function salvarLinhas(cronogramaId: string, linhas: LinhaLote[]): Promise<ResultadoGrade> {
  return semLancar("execucao.cronogramas.salvarLinhas", async () => {
    if (!idSchema.safeParse(cronogramaId).success || !Array.isArray(linhas)) return { erro: "Dados inválidos" };
    if (linhas.length === 0) return { erro: "Nenhuma linha para gravar" };
    if (linhas.length > MAX_LINHAS) return { erro: "No máximo 3.000 linhas por vez" };
    const temNova = linhas.some((l) => !l.id);
    const temExistente = linhas.some((l) => !!l.id);
    if (temNova && !(await pode("criar"))) return { erro: "Sem permissão para criar atividade" };
    if (temExistente && !(await pode("editar"))) return { erro: "Sem permissão para editar atividade" };
    if (linhas.some((l) => l.id !== undefined && !idSchema.safeParse(l.id).success)) return { erro: "Dados inválidos" };
    const supabase = await createClient();
    // `versao` vai como o texto lido de ex_v_atividades: o banco compara em microssegundos.
    const { error } = await supabase.rpc("fn_ex_atividades_salvar_lote", { p_cronograma: cronogramaId, p_linhas: linhas as Json });
    if (error) return erroAcao("execucao.cronogramas.salvarLinhas", error, mensagemDeNegocio(error, "Não foi possível salvar as linhas"));
    return relidas(cronogramaId);
  });
}

export async function excluirAtividades(cronogramaId: string, ids: string[], motivo: string): Promise<ResultadoGrade> {
  return semLancar("execucao.cronogramas.excluirAtividades", async () => {
    if (!(await pode("excluir"))) return { erro: "Sem permissão para excluir atividade" };
    if (!idSchema.safeParse(cronogramaId).success || ids.length === 0 || ids.some((id) => !idSchema.safeParse(id).success)) {
      return { erro: "Dados inválidos" };
    }
    const m = motivoSchema.safeParse(motivo);
    if (!m.success) return { erro: m.error.issues[0]?.message ?? "Informe o motivo" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_ex_atividades_excluir", { p_cronograma: cronogramaId, p_ids: ids, p_motivo: m.data });
    if (error) return erroAcao("execucao.cronogramas.excluirAtividades", error, mensagemDeNegocio(error, "Não foi possível excluir as linhas"));
    return relidas(cronogramaId);
  });
}

export async function renumerarEap(cronogramaId: string): Promise<ResultadoGrade> {
  return semLancar("execucao.cronogramas.renumerar", async () => {
    if (!(await pode("editar"))) return { erro: "Sem permissão para renumerar a EAP" };
    if (!idSchema.safeParse(cronogramaId).success) return { erro: "Dados inválidos" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_ex_eap_renumerar", { p_cronograma: cronogramaId });
    if (error) return erroAcao("execucao.cronogramas.renumerar", error, mensagemDeNegocio(error, "Não foi possível renumerar a EAP"));
    return relidas(cronogramaId);
  });
}

export async function recalcular(cronogramaId: string): Promise<ResultadoGrade> {
  return semLancar("execucao.cronogramas.recalcular", async () => {
    if (!(await pode("editar"))) return { erro: "Sem permissão para recalcular o cronograma" };
    if (!idSchema.safeParse(cronogramaId).success) return { erro: "Dados inválidos" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_ex_cronograma_recalcular", { p_id: cronogramaId });
    if (error) return erroAcao("execucao.cronogramas.recalcular", error, mensagemDeNegocio(error, "Não foi possível recalcular as datas"));
    return relidas(cronogramaId);
  });
}

export async function salvarCronograma(id: string, dados: CronogramaInput): Promise<ResultadoAcao> {
  return semLancar("execucao.cronogramas.salvar", async () => {
    if (!(await pode("editar"))) return { erro: "Sem permissão para editar cronograma" };
    if (!idSchema.safeParse(id).success) return { erro: "Dados inválidos" };
    const v = cronogramaSchema.safeParse(dados);
    if (!v.success) return { erro: v.error.issues[0]?.message ?? "Dados inválidos" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_ex_cronograma_salvar", { p_dados: payloadDoCronograma(v.data), p_id: id });
    if (error) return erroAcao("execucao.cronogramas.salvar", error, mensagemDeNegocio(error, "Não foi possível salvar o cronograma"));
    revalidar(id);
    return { ok: true };
  });
}

export async function mudarStatus(id: string, status: StatusCronograma): Promise<ResultadoAcao> {
  return semLancar("execucao.cronogramas.status", async () => {
    if (!(await pode("editar"))) return { erro: "Sem permissão para mudar a situação do cronograma" };
    if (!idSchema.safeParse(id).success || !STATUS_CRONOGRAMA.includes(status)) return { erro: "Dados inválidos" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_ex_cronograma_status", { p_id: id, p_status: status });
    if (error) return erroAcao("execucao.cronogramas.status", error, mensagemDeNegocio(error, "Não foi possível mudar a situação"));
    revalidar(id);
    return { ok: true };
  });
}

export async function excluirCronograma(id: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar("execucao.cronogramas.excluir", async () => {
    if (!(await pode("excluir"))) return { erro: "Sem permissão para excluir cronograma" };
    if (!idSchema.safeParse(id).success) return { erro: "Dados inválidos" };
    const m = motivoSchema.safeParse(motivo);
    if (!m.success) return { erro: m.error.issues[0]?.message ?? "Informe o motivo" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_ex_cronograma_excluir", { p_id: id, p_motivo: m.data });
    if (error) return erroAcao("execucao.cronogramas.excluir", error, mensagemDeNegocio(error, "Não foi possível excluir o cronograma"));
    revalidar();
    return { ok: true };
  });
}
