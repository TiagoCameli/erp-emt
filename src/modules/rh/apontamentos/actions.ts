"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Acao } from "@/config/recursos";
import { erroAcao } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  apontamentoSchema,
  pontoSchema,
  type ApontamentoInput,
  type PontoInput,
} from "@/modules/rh/apontamentos/schemas";

const RECURSO = "rh.apontamentos" as const;
const ROTA = "/rh/apontamentos";

/** Caminho do detalhe de um ponto, para revalidar junto com a lista. */
function rotaDetalhe(id: string): string {
  return `${ROTA}/${id}`;
}

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoCriacao = { ok: true; id: string } | { erro: string };

const uuidSchema = z.uuid();

/** Código do Postgres para violação de unique constraint. */
const ERRO_UNIQUE = "23505";

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
 * Erro se o ponto não está aberto. Apontamentos só podem ser alterados com o
 * ponto aberto (a RLS também barra; aqui devolvemos a mensagem amigável).
 */
async function pontoNaoEditavel(pontoId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rh_pontos")
    .select("status")
    .eq("id", pontoId)
    .maybeSingle();
  if (!data) return "Ponto não encontrado";
  if (data.status !== "aberto") {
    return "Só dá para alterar os apontamentos de um ponto aberto";
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Ponto (cabeçalho do dia)                                           */
/* ------------------------------------------------------------------ */

/**
 * Cria o ponto de um dia numa obra (insert direto, RLS criar). Trata o unique
 * (obra_id, data) com mensagem amigável. Retorna o id para navegar ao detalhe.
 */
export async function criarPonto(dados: PontoInput): Promise<ResultadoCriacao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para criar pontos" };
  }

  const validado = pontoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rh_pontos")
    .insert({
      obra_id: validado.data.obraId,
      data: validado.data.data,
      encarregado_id: validado.data.encarregadoId ?? null,
      observacao: validado.data.observacao ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === ERRO_UNIQUE) {
      return { erro: "Já existe ponto dessa obra nesse dia" };
    }
    return erroAcao(
      "rh.apontamentos.criarPonto",
      error,
      error?.message || "Não foi possível criar o ponto",
    );
  }

  revalidatePath(ROTA);
  return { ok: true, id: data.id };
}

/**
 * Edita o cabeçalho do ponto (encarregado e observação). Só enquanto aberto
 * (a RLS só concede UPDATE dessas colunas com status = 'aberto').
 */
export async function editarPonto(
  id: string,
  dados: PontoInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar pontos" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Ponto inválido" };

  const validado = pontoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const bloqueio = await pontoNaoEditavel(idValido.data);
  if (bloqueio) return { erro: bloqueio };

  const supabase = await createClient();
  const { error } = await supabase
    .from("rh_pontos")
    .update({
      encarregado_id: validado.data.encarregadoId ?? null,
      observacao: validado.data.observacao ?? null,
    })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "rh.apontamentos.editarPonto",
      error,
      error.message || "Não foi possível salvar o ponto",
    );
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Apontamentos (horas dos colaboradores)                             */
/* ------------------------------------------------------------------ */

/**
 * Adiciona o apontamento de um colaborador no ponto (insert direto, RLS
 * editar). Só com o ponto aberto. Trata o unique (ponto_id, colaborador_id).
 */
export async function adicionarApontamento(
  pontoId: string,
  dados: ApontamentoInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para lançar apontamentos" };
  }

  const idValido = uuidSchema.safeParse(pontoId);
  if (!idValido.success) return { erro: "Ponto inválido" };

  const validado = apontamentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const bloqueio = await pontoNaoEditavel(idValido.data);
  if (bloqueio) return { erro: bloqueio };

  const supabase = await createClient();
  const { error } = await supabase.from("rh_apontamentos").insert({
    ponto_id: idValido.data,
    colaborador_id: validado.data.colaboradorId,
    horas_normais: validado.data.horasNormais,
    horas_extras: validado.data.horasExtras,
    tipo: validado.data.tipo,
    observacao: validado.data.observacao ?? null,
  });

  if (error) {
    if (error.code === ERRO_UNIQUE) {
      return { erro: "Esse colaborador já está lançado neste ponto" };
    }
    return erroAcao(
      "rh.apontamentos.adicionar",
      error,
      error.message || "Não foi possível lançar o apontamento",
    );
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/** Edita um apontamento pelo id (update direto, RLS editar). Só com ponto aberto. */
export async function editarApontamento(
  pontoId: string,
  apontamentoId: string,
  dados: ApontamentoInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar apontamentos" };
  }

  const pontoValido = uuidSchema.safeParse(pontoId);
  const idValido = uuidSchema.safeParse(apontamentoId);
  if (!pontoValido.success || !idValido.success) {
    return { erro: "Registro inválido" };
  }

  const validado = apontamentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const bloqueio = await pontoNaoEditavel(pontoValido.data);
  if (bloqueio) return { erro: bloqueio };

  const supabase = await createClient();
  const { error } = await supabase
    .from("rh_apontamentos")
    .update({
      colaborador_id: validado.data.colaboradorId,
      horas_normais: validado.data.horasNormais,
      horas_extras: validado.data.horasExtras,
      tipo: validado.data.tipo,
      observacao: validado.data.observacao ?? null,
    })
    .eq("id", idValido.data);

  if (error) {
    if (error.code === ERRO_UNIQUE) {
      return { erro: "Esse colaborador já está lançado neste ponto" };
    }
    return erroAcao(
      "rh.apontamentos.editar",
      error,
      error.message || "Não foi possível salvar o apontamento",
    );
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(pontoValido.data));
  return { ok: true };
}

/** Remove um apontamento pelo id (delete direto, RLS editar). Só com ponto aberto. */
export async function removerApontamento(
  pontoId: string,
  apontamentoId: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para remover apontamentos" };
  }

  const pontoValido = uuidSchema.safeParse(pontoId);
  const idValido = uuidSchema.safeParse(apontamentoId);
  if (!pontoValido.success || !idValido.success) {
    return { erro: "Registro inválido" };
  }

  const bloqueio = await pontoNaoEditavel(pontoValido.data);
  if (bloqueio) return { erro: bloqueio };

  const supabase = await createClient();
  const { error } = await supabase
    .from("rh_apontamentos")
    .delete()
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "rh.apontamentos.remover",
      error,
      error.message || "Não foi possível remover o apontamento",
    );
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(pontoValido.data));
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Aprovar / reabrir                                                  */
/* ------------------------------------------------------------------ */

/** Aprova o ponto via fn_aprovar_ponto (trava os apontamentos do dia). */
export async function aprovarPonto(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Sem permissão para aprovar pontos" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Ponto inválido" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_aprovar_ponto", {
    p_ponto: idValido.data,
  });

  if (error) {
    return erroAcao(
      "rh.apontamentos.aprovarPonto",
      error,
      error.message || "Não foi possível aprovar o ponto",
    );
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/** Reabre o ponto via fn_reabrir_ponto (volta a aceitar apontamentos). */
export async function reabrirPonto(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Sem permissão para reabrir pontos" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Ponto inválido" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_reabrir_ponto", {
    p_ponto: idValido.data,
  });

  if (error) {
    return erroAcao(
      "rh.apontamentos.reabrirPonto",
      error,
      error.message || "Não foi possível reabrir o ponto",
    );
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}
