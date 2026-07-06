"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Acao } from "@/config/recursos";
import { erroAcao } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  movimentoSchema,
  type MovimentoInput,
} from "@/modules/rh/banco-horas/schemas";

const RECURSO = "rh.banco-horas" as const;
const ROTA = "/rh/banco-horas";
const TABELA = "banco_horas_movimentos" as const;

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

/** Cria um movimento de banco de horas. */
export async function criarMovimento(
  dados: MovimentoInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para criar movimentos" };
  }

  const validado = movimentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from(TABELA).insert({
    colaborador_id: validado.data.colaboradorId,
    data: validado.data.data,
    tipo: validado.data.tipo,
    horas: validado.data.horas,
    motivo: validado.data.motivo ?? null,
    observacao: validado.data.observacao ?? null,
  });

  if (error) {
    return erroAcao(
      "rh.banco-horas.criar",
      error,
      "Não foi possível salvar o movimento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Edita um movimento de banco de horas. */
export async function editarMovimento(
  id: string,
  dados: MovimentoInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar movimentos" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Movimento inválido" };

  const validado = movimentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA)
    .update({
      colaborador_id: validado.data.colaboradorId,
      data: validado.data.data,
      tipo: validado.data.tipo,
      horas: validado.data.horas,
      motivo: validado.data.motivo ?? null,
      observacao: validado.data.observacao ?? null,
    })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "rh.banco-horas.editar",
      error,
      "Não foi possível salvar o movimento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}
