"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Acao } from "@/config/recursos";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { feriasSchema, type FeriasInput } from "@/modules/rh/ferias/schemas";

const RECURSO = "rh.ferias" as const;
const ROTA = "/rh/ferias";
const TABELA = "rh_ferias" as const;

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
function paraRegistro(dados: FeriasInput) {
  return {
    colaborador_id: dados.colaboradorId,
    periodo_aquisitivo_inicio: dados.periodoAquisitivoInicio,
    periodo_aquisitivo_fim: dados.periodoAquisitivoFim,
    data_inicio: dados.dataInicio ?? null,
    data_fim: dados.dataFim ?? null,
    dias: dados.dias,
    status: dados.status,
    observacao: dados.observacao ?? null,
  };
}

/** Cria um registro de férias. */
export async function criarFerias(dados: FeriasInput): Promise<ResultadoAcao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para criar férias" };
  }

  const validado = feriasSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from(TABELA).insert(paraRegistro(validado.data));

  if (error) {
    return { erro: "Não foi possível salvar as férias. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Edita um registro de férias. */
export async function editarFerias(
  id: string,
  dados: FeriasInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar férias" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Registro inválido" };

  const validado = feriasSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA)
    .update(paraRegistro(validado.data))
    .eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível salvar as férias. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Remove um registro de férias. */
export async function removerFerias(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("excluir"))) {
    return { erro: "Sem permissão para excluir férias" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Registro inválido" };

  const supabase = await createClient();
  const { error } = await supabase.from(TABELA).delete().eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível excluir as férias. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}
