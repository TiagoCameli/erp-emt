"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Acao } from "@/config/recursos";
import { erroAcao } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  adiantamentoSchema,
  type AdiantamentoInput,
} from "@/modules/rh/adiantamentos/schemas";

const RECURSO = "rh.adiantamentos" as const;
const ROTA = "/rh/adiantamentos";
const TABELA = "rh_adiantamentos" as const;

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

/**
 * Garante que o adiantamento existe e ainda não entrou numa folha. Uma vez na
 * folha (folha_id preenchido) fica travado: não dá para editar nem excluir.
 */
async function garantirEmAberto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<ResultadoAcao> {
  const { data, error } = await supabase
    .from(TABELA)
    .select("folha_id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return erroAcao(
      "rh.adiantamentos.garantirEmAberto",
      error,
      "Não foi possível carregar o adiantamento",
    );
  }
  if (!data) return { erro: "Adiantamento não encontrado" };
  if (data.folha_id !== null) {
    return { erro: "Adiantamento já incluído numa folha" };
  }
  return { ok: true };
}

/** Cria um adiantamento. */
export async function criarAdiantamento(
  dados: AdiantamentoInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para criar adiantamentos" };
  }

  const validado = adiantamentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from(TABELA).insert({
    colaborador_id: validado.data.colaboradorId,
    competencia: validado.data.competencia,
    valor: validado.data.valor,
    data: validado.data.data,
    descricao: validado.data.descricao ?? null,
  });

  if (error) {
    return erroAcao(
      "rh.adiantamentos.criar",
      error,
      "Não foi possível salvar o adiantamento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Edita um adiantamento. Bloqueia se já entrou numa folha. */
export async function editarAdiantamento(
  id: string,
  dados: AdiantamentoInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar adiantamentos" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Adiantamento inválido" };

  const validado = adiantamentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();

  const aberto = await garantirEmAberto(supabase, idValido.data);
  if ("erro" in aberto) return aberto;

  const { error } = await supabase
    .from(TABELA)
    .update({
      colaborador_id: validado.data.colaboradorId,
      competencia: validado.data.competencia,
      valor: validado.data.valor,
      data: validado.data.data,
      descricao: validado.data.descricao ?? null,
    })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "rh.adiantamentos.editar",
      error,
      "Não foi possível salvar o adiantamento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Remove um adiantamento. Bloqueia se já entrou numa folha. */
export async function removerAdiantamento(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("excluir"))) {
    return { erro: "Sem permissão para excluir adiantamentos" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Adiantamento inválido" };

  const supabase = await createClient();

  const aberto = await garantirEmAberto(supabase, idValido.data);
  if ("erro" in aberto) return aberto;

  const { error } = await supabase
    .from(TABELA)
    .delete()
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "rh.adiantamentos.remover",
      error,
      "Não foi possível excluir o adiantamento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}
