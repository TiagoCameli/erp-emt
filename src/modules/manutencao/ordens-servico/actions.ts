"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Acao } from "@/config/recursos";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  abrirOsSchema,
  concluirSchema,
  maoObraSchema,
  pecaSchema,
  terceiroSchema,
  type AbrirOsInput,
  type ConcluirInput,
  type MaoObraInput,
  type PecaInput,
  type TerceiroInput,
} from "@/modules/manutencao/ordens-servico/schemas";

const RECURSO = "manutencao.ordens-servico" as const;
const ROTA = "/manutencao/ordens-servico";

/** Caminho do detalhe de uma OS, para revalidar junto com a lista. */
function rotaDetalhe(id: string): string {
  return `${ROTA}/${id}`;
}

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoCriacao = { ok: true; id: string } | { erro: string };

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
 * Erro se a OS não está aberta/em execução. Peças, mão de obra e terceiros só
 * podem ser alterados antes da conclusão (o custo total é congelado ao concluir).
 * A RLS no banco também barra; aqui devolvemos a mensagem amigável.
 */
async function osNaoEditavel(ordemId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ordens_servico")
    .select("status")
    .eq("id", ordemId)
    .maybeSingle();
  if (!data) return "Ordem de serviço não encontrada";
  if (data.status !== "aberta" && data.status !== "em_execucao") {
    return "Só dá para alterar uma OS aberta ou em execução";
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Abrir OS                                                           */
/* ------------------------------------------------------------------ */

/** Argumentos de fn_abrir_os. Os opcionais só entram quando há valor. */
interface ArgsAbrirOs {
  p_equipamento: string;
  p_tipo: string;
  p_descricao: string;
  p_prioridade: string;
  p_origem: string;
  p_horimetro?: number;
  p_km?: number;
}

/**
 * Abre uma OS via fn_abrir_os (gera número e a transição inicial). Origem
 * sempre 'manual' nesta tela. Horímetro/km só entram quando informados.
 */
export async function abrirOrdem(
  dados: AbrirOsInput,
): Promise<ResultadoCriacao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para abrir ordens de serviço" };
  }

  const validado = abrirOsSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const args: ArgsAbrirOs = {
    p_equipamento: validado.data.equipamentoId,
    p_tipo: validado.data.tipo,
    p_descricao: validado.data.descricao,
    p_prioridade: validado.data.prioridade,
    p_origem: "manual",
  };
  if (validado.data.horimetro !== undefined) {
    args.p_horimetro = validado.data.horimetro;
  }
  if (validado.data.km !== undefined) {
    args.p_km = validado.data.km;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_abrir_os", args);

  if (error || !data) {
    return { erro: error?.message || "Não foi possível abrir a ordem de serviço" };
  }

  revalidatePath(ROTA);
  return { ok: true, id: data };
}

/* ------------------------------------------------------------------ */
/* Transições de status                                               */
/* ------------------------------------------------------------------ */

/** Inicia a OS (aberta -> em_execucao) via fn_iniciar_os. */
export async function iniciarOrdem(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para iniciar ordens de serviço" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Ordem de serviço inválida" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_iniciar_os", { p_os: idValido.data });

  if (error) {
    return { erro: error.message || "Não foi possível iniciar a ordem de serviço" };
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/**
 * Conclui a OS via fn_concluir_os, que calcula os custos e gera o lançamento
 * dos terceiros. Horímetro/km de fechamento só entram quando informados.
 */
export async function concluirOrdem(
  id: string,
  dados: ConcluirInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para concluir ordens de serviço" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Ordem de serviço inválida" };

  const validado = concluirSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const args: {
    p_os: string;
    p_horimetro_fech?: number;
    p_km_fech?: number;
  } = { p_os: idValido.data };
  if (validado.data.horimetroFech !== undefined) {
    args.p_horimetro_fech = validado.data.horimetroFech;
  }
  if (validado.data.kmFech !== undefined) {
    args.p_km_fech = validado.data.kmFech;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_concluir_os", args);

  if (error) {
    return { erro: error.message || "Não foi possível concluir a ordem de serviço" };
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/** Cancela a OS via fn_cancelar_os (só sem peças baixadas), com motivo. */
export async function cancelarOrdem(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para cancelar ordens de serviço" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Ordem de serviço inválida" };

  const motivoLimpo = motivo.trim();
  if (motivoLimpo === "") return { erro: "Informe o motivo do cancelamento" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_cancelar_os", {
    p_os: idValido.data,
    p_motivo: motivoLimpo,
  });

  if (error) {
    return { erro: error.message || "Não foi possível cancelar a ordem de serviço" };
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Peças                                                              */
/* ------------------------------------------------------------------ */

/**
 * Baixa uma peça do almoxarifado para a OS via fn_os_adicionar_peca (custo
 * PEPS). A RPC repassa erros claros do banco (ex.: "Saldo insuficiente").
 */
export async function adicionarPeca(
  id: string,
  dados: PecaInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para adicionar peças" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Ordem de serviço inválida" };

  const validado = pecaSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_os_adicionar_peca", {
    p_os: idValido.data,
    p_insumo: validado.data.insumoId,
    p_deposito: validado.data.depositoId,
    p_quantidade: validado.data.quantidade,
  });

  if (error) {
    return { erro: error.message || "Não foi possível adicionar a peça" };
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Mão de obra                                                        */
/* ------------------------------------------------------------------ */

/** Adiciona um apontamento de mão de obra (insert direto, RLS editar). */
export async function adicionarMaoObra(
  id: string,
  dados: MaoObraInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para adicionar mão de obra" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Ordem de serviço inválida" };

  const validado = maoObraSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const bloqueio = await osNaoEditavel(idValido.data);
  if (bloqueio) return { erro: bloqueio };

  const supabase = await createClient();
  const { error } = await supabase.from("os_mao_obra").insert({
    ordem_servico_id: idValido.data,
    colaborador_id: validado.data.colaboradorId,
    horas: validado.data.horas,
    valor_hora: validado.data.valorHora,
  });

  if (error) {
    return { erro: error.message || "Não foi possível adicionar a mão de obra" };
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/** Remove um apontamento de mão de obra pelo id (delete direto, RLS editar). */
export async function removerMaoObra(
  ordemId: string,
  maoObraId: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para remover mão de obra" };
  }

  const ordemValida = uuidSchema.safeParse(ordemId);
  const idValido = uuidSchema.safeParse(maoObraId);
  if (!ordemValida.success || !idValido.success) {
    return { erro: "Registro inválido" };
  }

  const bloqueio = await osNaoEditavel(ordemValida.data);
  if (bloqueio) return { erro: bloqueio };

  const supabase = await createClient();
  const { error } = await supabase
    .from("os_mao_obra")
    .delete()
    .eq("id", idValido.data);

  if (error) {
    return { erro: error.message || "Não foi possível remover a mão de obra" };
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(ordemValida.data));
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Terceiros                                                          */
/* ------------------------------------------------------------------ */

/** Adiciona um serviço de terceiro (insert direto, RLS editar). */
export async function adicionarTerceiro(
  id: string,
  dados: TerceiroInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para adicionar serviços de terceiro" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Ordem de serviço inválida" };

  const validado = terceiroSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const bloqueio = await osNaoEditavel(idValido.data);
  if (bloqueio) return { erro: bloqueio };

  const supabase = await createClient();
  const { error } = await supabase.from("os_terceiros").insert({
    ordem_servico_id: idValido.data,
    fornecedor_id: validado.data.fornecedorId ?? null,
    descricao: validado.data.descricao,
    valor: validado.data.valor,
    data_vencimento: validado.data.dataVencimento ?? null,
  });

  if (error) {
    return { erro: error.message || "Não foi possível adicionar o terceiro" };
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/** Remove um serviço de terceiro pelo id (delete direto, RLS editar). */
export async function removerTerceiro(
  ordemId: string,
  terceiroId: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para remover serviços de terceiro" };
  }

  const ordemValida = uuidSchema.safeParse(ordemId);
  const idValido = uuidSchema.safeParse(terceiroId);
  if (!ordemValida.success || !idValido.success) {
    return { erro: "Registro inválido" };
  }

  const bloqueio = await osNaoEditavel(ordemValida.data);
  if (bloqueio) return { erro: bloqueio };

  const supabase = await createClient();
  const { error } = await supabase
    .from("os_terceiros")
    .delete()
    .eq("id", idValido.data);

  if (error) {
    return { erro: error.message || "Não foi possível remover o terceiro" };
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(ordemValida.data));
  return { ok: true };
}
