"use server";

import { revalidatePath } from "next/cache";

import { erroAcao, semLancar } from "@/lib/erros";
import { mensagemDeNegocio } from "@/lib/erros-banco";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  calendarioSchema,
  dataValida,
  excecaoSchema,
  feriadoSchema,
  payloadDoCalendario,
  payloadDoFeriado,
  payloadDoServico,
  servicoSchema,
  type CalendarioInput,
  type ExcecaoInput,
  type FeriadoInput,
  type ServicoInput,
} from "@/modules/execucao/modelos/schemas";

/**
 * Mutações da biblioteca de serviços, dos calendários e dos feriados. Só por RPC, que confere a permissão de novo.
 * Calendário e exceção também podem ser do calendário próprio de um cronograma: a action deixa passar quem tem
 * modelos/editar OU cronogramas/editar, e o banco (fn_ex_exigir_calendario) decide pelo tipo do calendário.
 */

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoSalvar = { ok: true; id: string } | { erro: string };

const RECURSO = "execucao.modelos" as const;

async function permitido(recurso: "execucao.modelos" | "execucao.cronogramas", acao: "criar" | "editar" | "excluir"): Promise<boolean> {
  try {
    await exigirPermissao(recurso, acao);
    return true;
  } catch {
    return false;
  }
}

const pode = (acao: "criar" | "editar" | "excluir") => permitido(RECURSO, acao);

async function podeEditarCalendario(): Promise<boolean> {
  return (await pode("editar")) || (await permitido("execucao.cronogramas", "editar"));
}

function revalidar() {
  for (const rota of ["/execucao/modelos", "/execucao/cronogramas"]) {
    try {
      revalidatePath(rota);
    } catch {
      // O sucesso já aconteceu.
    }
  }
}

export async function salvarServico(id: string | null, dados: ServicoInput): Promise<ResultadoSalvar> {
  return semLancar("execucao.modelos.servico", async () => {
    if (!(await pode(id === null ? "criar" : "editar"))) {
      return { erro: id === null ? "Sem permissão para cadastrar serviço" : "Sem permissão para editar serviço" };
    }
    if (id !== null && !idSchema.safeParse(id).success) return { erro: "Dados inválidos" };
    const v = servicoSchema.safeParse(dados);
    if (!v.success) return { erro: v.error.issues[0]?.message ?? "Dados inválidos" };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_ex_servico_salvar", { p_dados: payloadDoServico(v.data), p_id: id ?? undefined });
    if (error) return erroAcao("execucao.modelos.servico", error, mensagemDeNegocio(error, "Não foi possível salvar o serviço"));
    revalidar();
    return { ok: true, id: String(data) };
  });
}

export async function salvarCalendario(id: string | null, dados: CalendarioInput): Promise<ResultadoSalvar> {
  return semLancar("execucao.modelos.calendario", async () => {
    const autorizado = id === null ? await pode("criar") : await podeEditarCalendario();
    if (!autorizado) return { erro: id === null ? "Sem permissão para cadastrar calendário" : "Sem permissão para editar calendário" };
    if (id !== null && !idSchema.safeParse(id).success) return { erro: "Dados inválidos" };
    const v = calendarioSchema.safeParse(dados);
    if (!v.success) return { erro: v.error.issues[0]?.message ?? "Dados inválidos" };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_ex_calendario_salvar", { p_dados: payloadDoCalendario(v.data), p_id: id ?? undefined });
    if (error) return erroAcao("execucao.modelos.calendario", error, mensagemDeNegocio(error, "Não foi possível salvar o calendário"));
    revalidar();
    return { ok: true, id: String(data) };
  });
}

export async function salvarExcecao(calendarioId: string, dados: ExcecaoInput): Promise<ResultadoAcao> {
  return semLancar("execucao.modelos.excecao", async () => {
    if (!(await podeEditarCalendario())) return { erro: "Sem permissão para editar calendário" };
    if (!idSchema.safeParse(calendarioId).success) return { erro: "Dados inválidos" };
    const v = excecaoSchema.safeParse(dados);
    if (!v.success) return { erro: v.error.issues[0]?.message ?? "Dados inválidos" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_ex_calendario_excecao_salvar", {
      p_cal: calendarioId,
      p_data: v.data.data,
      // O tipo gerado diz number, mas a coluna é numeric: a string normalizada ("4", "7.5") entra sem perder casas.
      p_horas: v.data.horas as unknown as number,
      p_tipo: v.data.tipo,
      p_descricao: v.data.descricao,
    });
    if (error) return erroAcao("execucao.modelos.excecao", error, mensagemDeNegocio(error, "Não foi possível salvar a exceção"));
    revalidar();
    return { ok: true };
  });
}

export async function excluirExcecao(calendarioId: string, data: string): Promise<ResultadoAcao> {
  return semLancar("execucao.modelos.excluirExcecao", async () => {
    if (!(await podeEditarCalendario())) return { erro: "Sem permissão para editar calendário" };
    if (!idSchema.safeParse(calendarioId).success || !dataValida(data)) return { erro: "Dados inválidos" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_ex_calendario_excecao_excluir", { p_cal: calendarioId, p_data: data });
    if (error) return erroAcao("execucao.modelos.excluirExcecao", error, mensagemDeNegocio(error, "Não foi possível excluir a exceção"));
    revalidar();
    return { ok: true };
  });
}

export async function salvarFeriado(id: string | null, dados: FeriadoInput): Promise<ResultadoSalvar> {
  return semLancar("execucao.modelos.feriado", async () => {
    if (!(await pode(id === null ? "criar" : "editar"))) {
      return { erro: id === null ? "Sem permissão para cadastrar feriado" : "Sem permissão para editar feriado" };
    }
    if (id !== null && !idSchema.safeParse(id).success) return { erro: "Dados inválidos" };
    const v = feriadoSchema.safeParse(dados);
    if (!v.success) return { erro: v.error.issues[0]?.message ?? "Dados inválidos" };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_ex_feriado_salvar", { p_dados: payloadDoFeriado(v.data), p_id: id ?? undefined });
    if (error) return erroAcao("execucao.modelos.feriado", error, mensagemDeNegocio(error, "Não foi possível salvar o feriado"));
    revalidar();
    return { ok: true, id: String(data) };
  });
}

export async function excluirFeriado(id: string): Promise<ResultadoAcao> {
  return semLancar("execucao.modelos.excluirFeriado", async () => {
    if (!(await pode("excluir"))) return { erro: "Sem permissão para excluir feriado" };
    if (!idSchema.safeParse(id).success) return { erro: "Dados inválidos" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_ex_feriado_excluir", { p_id: id });
    if (error) return erroAcao("execucao.modelos.excluirFeriado", error, mensagemDeNegocio(error, "Não foi possível excluir o feriado"));
    revalidar();
    return { ok: true };
  });
}
