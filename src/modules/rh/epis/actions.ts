"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Acao } from "@/config/recursos";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { epiSchema, type EpiInput } from "@/modules/rh/epis/schemas";

const RECURSO = "rh.epis" as const;
const ROTA = "/rh/epis";
const TABELA = "rh_epis" as const;

export type ResultadoAcao = { ok: true } | { erro: string };

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

/** Monta o registro de banco a partir do input validado. */
function paraRegistro(dados: EpiInput) {
  return {
    colaborador_id: dados.colaboradorId,
    descricao: dados.descricao,
    ca: dados.ca ?? null,
    quantidade: dados.quantidade,
    data_entrega: dados.dataEntrega,
    data_devolucao: dados.dataDevolucao ?? null,
    assinado: dados.assinado,
    observacao: dados.observacao ?? null,
  };
}

/** Cria um registro de EPI. */
export async function criarEpi(dados: EpiInput): Promise<ResultadoAcao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para criar EPIs" };
  }

  const validado = epiSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from(TABELA).insert(paraRegistro(validado.data));

  if (error) {
    return { erro: "Não foi possível salvar o EPI. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Edita um registro de EPI. */
export async function editarEpi(
  id: string,
  dados: EpiInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar EPIs" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Registro inválido" };

  const validado = epiSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA)
    .update(paraRegistro(validado.data))
    .eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível salvar o EPI. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Remove um registro de EPI. */
export async function removerEpi(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("excluir"))) {
    return { erro: "Sem permissão para excluir EPIs" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Registro inválido" };

  const supabase = await createClient();
  const { error } = await supabase.from(TABELA).delete().eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível excluir o EPI. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}
