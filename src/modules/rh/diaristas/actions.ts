"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Acao } from "@/config/recursos";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  diariaSchema,
  fecharSchema,
  type DiariaInput,
  type FecharInput,
} from "@/modules/rh/diaristas/schemas";

const RECURSO = "rh.diaristas" as const;
const ROTA = "/rh/diaristas";
const TABELA = "rh_diarias" as const;

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
 * Garante que a diária existe e ainda não foi fechada. Com lancamento_id
 * preenchido a diária está paga: fica travada (sem editar nem excluir), e o
 * RLS no banco também barra. Aqui devolvemos a mensagem amigável.
 */
async function garantirEmAberto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<ResultadoAcao> {
  const { data, error } = await supabase
    .from(TABELA)
    .select("lancamento_id")
    .eq("id", id)
    .maybeSingle();

  if (error) return { erro: "Não foi possível carregar a diária" };
  if (!data) return { erro: "Diária não encontrada" };
  if (data.lancamento_id !== null) {
    return { erro: "Diária já fechada/paga" };
  }
  return { ok: true };
}

/** Cria uma diária. A competência é o 1o dia do mês da data (derivada). */
export async function criarDiaria(dados: DiariaInput): Promise<ResultadoAcao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para registrar diárias" };
  }

  const validado = diariaSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from(TABELA).insert({
    colaborador_id: validado.data.colaboradorId,
    obra_id: validado.data.obraId ?? null,
    data: validado.data.data,
    competencia: validado.data.competencia,
    valor: validado.data.valor,
    observacao: validado.data.observacao ?? null,
  });

  if (error) {
    return { erro: "Não foi possível salvar a diária. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Edita uma diária. Bloqueia se já estiver fechada/paga. */
export async function editarDiaria(
  id: string,
  dados: DiariaInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar diárias" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Diária inválida" };

  const validado = diariaSchema.safeParse(dados);
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
      obra_id: validado.data.obraId ?? null,
      data: validado.data.data,
      competencia: validado.data.competencia,
      valor: validado.data.valor,
      observacao: validado.data.observacao ?? null,
    })
    .eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível salvar a diária. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Remove uma diária. Bloqueia se já estiver fechada/paga (RLS editar). */
export async function removerDiaria(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para excluir diárias" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Diária inválida" };

  const supabase = await createClient();

  const aberto = await garantirEmAberto(supabase, idValido.data);
  if ("erro" in aberto) return aberto;

  const { error } = await supabase.from(TABELA).delete().eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível excluir a diária. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Fecha as diárias em aberto de um diarista numa competência via
 * fn_fechar_diarias, que cria UM lançamento a pagar somando os valores e marca
 * as diárias. Vencimento é opcional (null = sem vencimento definido).
 */
export async function fecharDiarias(
  dados: FecharInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para fechar diárias" };
  }

  const validado = fecharSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const args: {
    p_colaborador: string;
    p_competencia: string;
    p_data_vencimento?: string;
  } = {
    p_colaborador: validado.data.colaboradorId,
    p_competencia: validado.data.competencia,
  };
  if (validado.data.dataVencimento) {
    args.p_data_vencimento = validado.data.dataVencimento;
  }
  const { error } = await supabase.rpc("fn_fechar_diarias", args);

  if (error) {
    return { erro: error.message || "Não foi possível fechar as diárias" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}
