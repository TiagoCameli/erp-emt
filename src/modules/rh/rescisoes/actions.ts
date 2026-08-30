"use server";

import { revalidatePath } from "next/cache";

import type { Acao } from "@/config/recursos";
import { logErroServidor } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  adicionarItemRescisaoSchema,
  editarItemRescisaoSchema,
  gerarRescisaoSchema,
  motivoRescisaoSchema,
} from "@/modules/rh/rescisoes/schemas";

const RECURSO = "rh.rescisoes" as const;
const ROTA = "/rh/rescisoes";

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoGeracao = { ok: true; id: string } | { erro: string };

/**
 * Só devolve `error.message` ao usuário quando é um `raise exception` nosso
 * (SQLSTATE P0001, o default do plpgsql). Qualquer outro código é
 * infraestrutura e vai só pro log. Aqui isso pesa mais que em outras telas: as
 * mensagens das RPCs de rescisão são o que dizem "esta pessoa é terceiro",
 * "o desligamento é anterior à admissão" e "o pagamento já foi conciliado" —
 * sem elas o toast diria só "não foi possível", e o operador não saberia o
 * que corrigir.
 */
function mensagemDeNegocio(
  operacao: string,
  error: { code?: string; message?: string } | null | undefined,
  fallback: string,
): string {
  if (error?.code === "P0001" && error.message) return error.message;
  // Só o que NÃO é regra de negócio vai para o log. Uma recusa da RPC é
  // esperada e já chega inteira ao usuário; logar as duas coisas juntas enterra
  // o erro de infraestrutura no meio de centenas de "esta pessoa é terceiro".
  logErroServidor(`rh.rescisoes.${operacao}`, error);
  return fallback;
}

async function checarPermissao(acao: Acao): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/**
 * Revalida a lista E o detalhe. `revalidatePath(ROTA)` sozinho não alcança
 * `/rh/rescisoes/[id]`: rota dinâmica precisa do segundo argumento "page", e
 * sem ele a tela do documento continuaria mostrando o valor anterior depois de
 * editar uma verba.
 */
function revalidarTelas(): void {
  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/[id]`, "page");
}

export async function gerarRescisao(
  dados: unknown,
): Promise<ResultadoGeracao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Você não tem permissão para gerar rescisões" };
  }

  const validado = gerarRescisaoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_gerar_rescisao", {
    p_colaborador: validado.data.colaboradorId,
    p_tipo: validado.data.tipo,
    p_data_desligamento: validado.data.dataDesligamento,
    p_aviso: validado.data.aviso,
    // `?? undefined` OMITE o parâmetro e deixa valer o DEFAULT do banco. Os
    // quatro têm DEFAULT justamente porque "não informado" é estado legítimo.
    p_data_aviso: validado.data.dataAviso ?? undefined,
    p_saldo_fgts: validado.data.saldoFgts,
    p_ferias_vencidas_periodos: validado.data.feriasVencidasPeriodos,
    p_remuneracao_base: validado.data.remuneracaoBase ?? undefined,
    p_data_vencimento: validado.data.dataVencimento ?? undefined,
    p_observacao: validado.data.observacao ?? undefined,
  });

  if (error || !data) {
    return {
      erro: mensagemDeNegocio("gerar", error, "Não foi possível gerar a rescisão"),
    };
  }

  revalidarTelas();
  return { ok: true, id: data };
}

export async function editarItemRescisao(
  dados: unknown,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Você não tem permissão para editar a rescisão" };
  }

  const validado = editarItemRescisaoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_editar_item_rescisao", {
    p_item: validado.data.itemId,
    p_valor: validado.data.valor,
  });

  if (error) {
    return { erro: mensagemDeNegocio("editar-item", error, "Não foi possível salvar a verba") };
  }

  revalidarTelas();
  return { ok: true };
}

export async function adicionarItemRescisao(
  dados: unknown,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Você não tem permissão para editar a rescisão" };
  }

  const validado = adicionarItemRescisaoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_adicionar_item_rescisao", {
    p_rescisao: validado.data.rescisaoId,
    p_descricao: validado.data.descricao,
    p_natureza: validado.data.natureza,
    p_valor: validado.data.valor,
  });

  if (error) {
    return {
      erro: mensagemDeNegocio("adicionar-item", error, "Não foi possível acrescentar a verba"),
    };
  }

  revalidarTelas();
  return { ok: true };
}

export async function removerItemRescisao(
  itemId: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Você não tem permissão para editar a rescisão" };
  }
  if (!idSchema.safeParse(itemId).success) {
    return { erro: "Verba inválida" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_remover_item_rescisao", {
    p_item: itemId,
  });

  if (error) {
    return { erro: mensagemDeNegocio("remover-item", error, "Não foi possível remover a verba") };
  }

  revalidarTelas();
  return { ok: true };
}

export async function enviarRescisaoParaAprovacao(
  rescisaoId: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Você não tem permissão para editar a rescisão" };
  }
  if (!idSchema.safeParse(rescisaoId).success) {
    return { erro: "Rescisão inválida" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_enviar_rescisao_aprovacao", {
    p_rescisao: rescisaoId,
  });

  if (error) {
    return {
      erro: mensagemDeNegocio("enviar", error, "Não foi possível enviar para aprovação"),
    };
  }

  revalidarTelas();
  return { ok: true };
}

export async function aprovarRescisao(
  rescisaoId: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Você não tem permissão para aprovar rescisões" };
  }
  if (!idSchema.safeParse(rescisaoId).success) {
    return { erro: "Rescisão inválida" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_aprovar_rescisao", {
    p_rescisao: rescisaoId,
  });

  if (error) {
    return {
      erro: mensagemDeNegocio("aprovar", error, "Não foi possível aprovar a rescisão"),
    };
  }

  // A aprovação DESLIGA a pessoa e cria a conta a pagar: as telas de
  // colaboradores, de folha e do financeiro passam a mostrar outra coisa.
  revalidarTelas();
  revalidatePath("/cadastros/colaboradores");
  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro/pagamentos");
  return { ok: true };
}

export async function rejeitarRescisao(dados: unknown): Promise<ResultadoAcao> {
  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Você não tem permissão para rejeitar rescisões" };
  }

  const validado = motivoRescisaoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_rejeitar_rescisao", {
    p_rescisao: validado.data.rescisaoId,
    p_motivo: validado.data.motivo,
  });

  if (error) {
    return {
      erro: mensagemDeNegocio("rejeitar", error, "Não foi possível rejeitar a rescisão"),
    };
  }

  revalidarTelas();
  return { ok: true };
}

export async function desaprovarRescisao(
  dados: unknown,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("desaprovar"))) {
    return { erro: "Você não tem permissão para desaprovar rescisões" };
  }

  const validado = motivoRescisaoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_desaprovar_rescisao", {
    p_rescisao: validado.data.rescisaoId,
    p_motivo: validado.data.motivo,
  });

  if (error) {
    return {
      erro: mensagemDeNegocio("desaprovar", error, "Não foi possível desaprovar a rescisão"),
    };
  }

  // Desaprovar RELIGA o colaborador e apaga a conta a pagar.
  revalidarTelas();
  revalidatePath("/cadastros/colaboradores");
  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro/pagamentos");
  return { ok: true };
}

export async function excluirRescisao(dados: unknown): Promise<ResultadoAcao> {
  if (!(await checarPermissao("excluir"))) {
    return { erro: "Você não tem permissão para excluir rescisões" };
  }

  const validado = motivoRescisaoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_excluir_rescisao", {
    p_rescisao: validado.data.rescisaoId,
    p_motivo: validado.data.motivo,
  });

  if (error) {
    return {
      erro: mensagemDeNegocio("excluir", error, "Não foi possível excluir a rescisão"),
    };
  }

  revalidarTelas();
  return { ok: true };
}
