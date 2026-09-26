"use server";

import { revalidatePath } from "next/cache";

import { erroAcao, semLancar } from "@/lib/erros";
import { mensagemDeNegocio } from "@/lib/erros-banco";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  aditivoSchema,
  contratoSchema,
  motivoSchema,
  payloadDoAditivo,
  payloadDoContrato,
  type AditivoInput,
  type ContratoInput,
} from "@/modules/medicao/contratos/schemas";

/**
 * Mutações do cadastro de contrato (`medicao.contratos`). Só por RPC, que confere de novo a ação E
 * o acesso ao contrato. Nada aqui toca obra, cliente ou centro de custo (D1, D2).
 */

const RECURSO = "medicao.contratos" as const;
const ROTA = "/medicao/contratos";

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoSalvar = { ok: true; id: string } | { erro: string };

async function pode(acao: "criar" | "editar" | "excluir"): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/**
 * Restaurar é a Lixeira do contrato: pede as duas permissões que
 * `fn_mc_restaurar` confere de novo no banco (mesmo padrão de
 * `combustivel/entradas/actions.ts`): editar a lixeira administrativa E
 * excluir na aba, para quem só tem uma das duas não conseguir tirar um
 * contrato da lixeira.
 */
async function podeRestaurar(): Promise<boolean> {
  try {
    await exigirPermissao("administracao.lixeira", "editar");
    await exigirPermissao(RECURSO, "excluir");
    return true;
  } catch {
    return false;
  }
}

function revalidar(id?: string) {
  for (const rota of [ROTA, "/medicao/planilha", ...(id ? [`${ROTA}/${id}`] : [])]) {
    try {
      revalidatePath(rota);
    } catch {
      // O sucesso já aconteceu.
    }
  }
}

export async function salvarContrato(id: string | null, dados: ContratoInput): Promise<ResultadoSalvar> {
  return semLancar("medicao.contratos.salvar", async () => {
    if (!(await pode(id === null ? "criar" : "editar"))) {
      return { erro: id === null ? "Sem permissão para cadastrar contrato" : "Sem permissão para editar contrato" };
    }
    if (id !== null && !idSchema.safeParse(id).success) return { erro: "Contrato inválido" };
    const validado = contratoSchema.safeParse(dados);
    if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_mc_contrato_salvar", {
      p_dados: payloadDoContrato(validado.data),
      p_id: id ?? undefined,
    });
    if (error) {
      if (error.code === "23505") return { erro: `Já existe outro contrato ativo com o código ${validado.data.codigo.toUpperCase()}` };
      return erroAcao("medicao.contratos.salvar", error, mensagemDeNegocio(error, "Não foi possível salvar o contrato. Tente novamente"));
    }
    const salvo = typeof data === "string" ? data : (id ?? "");
    revalidar(salvo);
    return { ok: true, id: salvo };
  });
}

export async function definirAcesso(contratoId: string, usuarioId: string, tem: boolean): Promise<ResultadoAcao> {
  return semLancar("medicao.contratos.acesso", async () => {
    if (!(await pode("editar"))) return { erro: "Sem permissão para mudar o acesso" };
    if (!idSchema.safeParse(contratoId).success || !idSchema.safeParse(usuarioId).success) return { erro: "Dados inválidos" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mc_acesso_definir", { p_contrato: contratoId, p_usuario: usuarioId, p_tem: tem });
    if (error) return erroAcao("medicao.contratos.acesso", error, mensagemDeNegocio(error, "Não foi possível mudar o acesso"));
    revalidar(contratoId);
    return { ok: true };
  });
}

export async function salvarAditivo(contratoId: string, id: string | null, dados: AditivoInput): Promise<ResultadoSalvar> {
  return semLancar("medicao.contratos.aditivo", async () => {
    if (!(await pode("editar"))) return { erro: "Sem permissão para registrar aditivo" };
    if (!idSchema.safeParse(contratoId).success || (id !== null && !idSchema.safeParse(id).success)) return { erro: "Dados inválidos" };
    const validado = aditivoSchema.safeParse(dados);
    if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_mc_aditivo_salvar", {
      p_contrato: contratoId,
      p_dados: payloadDoAditivo(validado.data),
      p_id: id ?? undefined,
    });
    if (error) return erroAcao("medicao.contratos.aditivo", error, mensagemDeNegocio(error, "Não foi possível salvar o aditivo"));
    revalidar(contratoId);
    return { ok: true, id: typeof data === "string" ? data : (id ?? "") };
  });
}

async function excluir(tabela: "mc_contratos" | "mc_aditivos", id: string, motivo: string, contexto: string): Promise<ResultadoAcao> {
  if (!(await pode("excluir"))) return { erro: "Sem permissão para excluir" };
  if (!idSchema.safeParse(id).success) return { erro: "Registro inválido" };
  const m = motivoSchema.safeParse(motivo);
  if (!m.success) return { erro: "Informe o motivo" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_mc_excluir", { p_tabela: tabela, p_id: id, p_motivo: m.data });
  if (error) return erroAcao(contexto, error, mensagemDeNegocio(error, "Não foi possível excluir"));
  revalidar();
  return { ok: true };
}

export async function excluirContrato(id: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar("medicao.contratos.excluir", () => excluir("mc_contratos", id, motivo, "medicao.contratos.excluir"));
}

export async function excluirAditivo(id: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar("medicao.contratos.excluirAditivo", () => excluir("mc_aditivos", id, motivo, "medicao.contratos.excluirAditivo"));
}

export async function restaurarContrato(id: string): Promise<ResultadoAcao> {
  return semLancar("medicao.contratos.restaurar", async () => {
    if (!(await podeRestaurar())) return { erro: "Sem permissão para restaurar" };
    if (!idSchema.safeParse(id).success) return { erro: "Registro inválido" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mc_restaurar", { p_tabela: "mc_contratos", p_id: id });
    if (error) {
      if (error.code === "23505") return { erro: "Já existe outro contrato ativo com este código. Mude o código dele antes de restaurar" };
      return erroAcao("medicao.contratos.restaurar", error, mensagemDeNegocio(error, "Não foi possível restaurar"));
    }
    revalidar(id);
    return { ok: true };
  });
}
