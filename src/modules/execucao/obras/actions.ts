"use server";

import { revalidatePath } from "next/cache";

import { erroAcao, semLancar } from "@/lib/erros";
import { mensagemDeNegocio } from "@/lib/erros-banco";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  configurarObraSchema,
  localSchema,
  novoCronogramaSchema,
  payloadDaObra,
  payloadDoLocal,
  payloadDoNovoCronograma,
  type ConfigurarObraInput,
  type LocalInput,
  type NovoCronogramaInput,
} from "@/modules/execucao/obras/schemas";

/**
 * Mutações de pasta, obra, acesso e locais. Só por RPC, que confere de novo a ação E a lista da obra.
 * Nada aqui escreve em obras, colaboradores ou qualquer outro módulo.
 */

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoSalvar = { ok: true; id: string } | { erro: string };

const RECURSO = "execucao.cronogramas" as const;

async function pode(acao: "criar" | "editar" | "excluir"): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

function revalidar(obraId?: string) {
  for (const rota of ["/execucao/obras", "/execucao/cronogramas", ...(obraId ? [`/execucao/obras/${obraId}`] : [])]) {
    try {
      revalidatePath(rota);
    } catch {
      // O sucesso já aconteceu.
    }
  }
}

export async function criarCronograma(dados: NovoCronogramaInput): Promise<ResultadoSalvar> {
  return semLancar("execucao.obras.criarCronograma", async () => {
    if (!(await pode("criar"))) return { erro: "Sem permissão para criar cronograma" };
    const v = novoCronogramaSchema.safeParse(dados);
    if (!v.success) return { erro: v.error.issues[0]?.message ?? "Dados inválidos" };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_ex_cronograma_salvar", { p_dados: payloadDoNovoCronograma(v.data) });
    if (error) return erroAcao("execucao.obras.criarCronograma", error, mensagemDeNegocio(error, "Não foi possível criar o cronograma"));
    revalidar(v.data.obraId);
    return { ok: true, id: String(data) };
  });
}

export async function configurarObra(obraId: string, dados: ConfigurarObraInput): Promise<ResultadoAcao> {
  return semLancar("execucao.obras.configurar", async () => {
    if (!(await pode("editar"))) return { erro: "Sem permissão para configurar a obra" };
    if (!idSchema.safeParse(obraId).success) return { erro: "Dados inválidos" };
    const v = configurarObraSchema.safeParse(dados);
    if (!v.success) return { erro: v.error.issues[0]?.message ?? "Dados inválidos" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_ex_obra_configurar", { p_obra: obraId, p_dados: payloadDaObra(v.data) });
    if (error) return erroAcao("execucao.obras.configurar", error, mensagemDeNegocio(error, "Não foi possível salvar a configuração"));
    revalidar(obraId);
    return { ok: true };
  });
}

export async function definirAcesso(obraId: string, usuarioId: string, tem: boolean): Promise<ResultadoAcao> {
  return semLancar("execucao.obras.acesso", async () => {
    if (!(await pode("editar"))) return { erro: "Sem permissão para mudar o acesso da obra" };
    if (!idSchema.safeParse(obraId).success || !idSchema.safeParse(usuarioId).success) return { erro: "Dados inválidos" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_ex_acesso_definir", { p_obra: obraId, p_usuario: usuarioId, p_tem: tem });
    if (error) return erroAcao("execucao.obras.acesso", error, mensagemDeNegocio(error, "Não foi possível mudar o acesso"));
    revalidar(obraId);
    return { ok: true };
  });
}

export async function salvarLocal(obraId: string, id: string | null, dados: LocalInput): Promise<ResultadoSalvar> {
  return semLancar("execucao.obras.local", async () => {
    if (!(await pode(id === null ? "criar" : "editar"))) {
      return { erro: id === null ? "Sem permissão para cadastrar local" : "Sem permissão para editar local" };
    }
    if (!idSchema.safeParse(obraId).success || (id !== null && !idSchema.safeParse(id).success)) return { erro: "Dados inválidos" };
    const v = localSchema.safeParse(dados);
    if (!v.success) return { erro: v.error.issues[0]?.message ?? "Dados inválidos" };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_ex_local_salvar", { p_obra: obraId, p_dados: payloadDoLocal(v.data), p_id: id ?? undefined });
    if (error) return erroAcao("execucao.obras.local", error, mensagemDeNegocio(error, "Não foi possível salvar o local"));
    revalidar(obraId);
    return { ok: true, id: String(data) };
  });
}

export async function excluirLocal(id: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar("execucao.obras.excluirLocal", async () => {
    if (!(await pode("excluir"))) return { erro: "Sem permissão para excluir local" };
    if (!idSchema.safeParse(id).success) return { erro: "Dados inválidos" };
    if (motivo.trim() === "") return { erro: "Informe o motivo da exclusão" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_ex_local_excluir", { p_id: id, p_motivo: motivo.trim() });
    if (error) return erroAcao("execucao.obras.excluirLocal", error, mensagemDeNegocio(error, "Não foi possível excluir o local"));
    revalidar();
    return { ok: true };
  });
}
