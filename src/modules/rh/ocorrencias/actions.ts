"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Acao } from "@/config/recursos";
import { erroAcao } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  ocorrenciaSchema,
  type OcorrenciaInput,
} from "@/modules/rh/ocorrencias/schemas";

const RECURSO = "rh.ocorrencias" as const;
const ROTA = "/rh/ocorrencias";
const TABELA = "rh_ocorrencias" as const;

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
function paraRegistro(dados: OcorrenciaInput) {
  return {
    colaborador_id: dados.colaboradorId,
    data: dados.data,
    tipo: dados.tipo,
    descricao: dados.descricao,
    observacao: dados.observacao ?? null,
  };
}

/** Cria uma ocorrência. */
export async function criarOcorrencia(
  dados: OcorrenciaInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para criar ocorrências" };
  }

  const validado = ocorrenciaSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from(TABELA).insert(paraRegistro(validado.data));

  if (error) {
    return erroAcao(
      "rh.ocorrencias.criar",
      error,
      "Não foi possível salvar a ocorrência. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Edita uma ocorrência. */
export async function editarOcorrencia(
  id: string,
  dados: OcorrenciaInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar ocorrências" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Registro inválido" };

  const validado = ocorrenciaSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA)
    .update(paraRegistro(validado.data))
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "rh.ocorrencias.editar",
      error,
      "Não foi possível salvar a ocorrência. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Remove uma ocorrência. */
export async function removerOcorrencia(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("excluir"))) {
    return { erro: "Sem permissão para excluir ocorrências" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Registro inválido" };

  const supabase = await createClient();
  const { error } = await supabase.from(TABELA).delete().eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "rh.ocorrencias.remover",
      error,
      "Não foi possível excluir a ocorrência. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}
