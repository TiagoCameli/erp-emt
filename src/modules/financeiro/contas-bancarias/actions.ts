"use server";

import { revalidatePath } from "next/cache";

import type { Acao } from "@/config/recursos";
import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  contaSchema,
  type ContaInput,
} from "@/modules/financeiro/contas-bancarias/schemas";

const RECURSO = "financeiro.contas-bancarias" as const;
const ROTA = "/financeiro/contas-bancarias";
/**
 * Rota do extrato de uma conta, na forma DINÂMICA que o `revalidatePath` exige.
 *
 * `revalidatePath("/financeiro/contas-bancarias")` invalida só aquela página, e
 * não os filhos: o extrato tem o próprio cache por id. Sem esta segunda chamada,
 * editar a conta pelo cabeçalho do extrato salvava no banco e a tela continuava
 * mostrando o saldo inicial e a data de corte antigos — o pior tipo de defeito de
 * dinheiro, porque a gravação deu certo e nada na tela disse o contrário.
 */
const ROTA_EXTRATO = "/financeiro/contas-bancarias/[id]";
const TABELA = "contas_bancarias" as const;

export type ResultadoAcao = { ok: true } | { erro: string };

/**
 * Invalida as duas telas que leem conta bancária: a listagem e o extrato de cada
 * conta. Sempre as duas, porque toda alteração de conta (nome, saldo inicial,
 * data de corte, ativo) muda o que as duas mostram.
 */
function revalidarTelasDaConta(): void {
  revalidatePath(ROTA);
  // O segundo argumento é obrigatório em rota dinâmica: sem ele o Next procura
  // uma página literalmente chamada "[id]", que não existe, e não invalida nada.
  revalidatePath(ROTA_EXTRATO, "page");
}

/** Converte o throw de exigirPermissao no contrato { erro } das actions. */
async function checarPermissao(acao: Acao): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/** Monta o payload do banco a partir do input validado. */
function paraRegistro(dados: ContaInput) {
  return {
    nome: dados.nome,
    banco: dados.banco,
    agencia: dados.agencia ?? null,
    conta: dados.conta ?? null,
    tipo: dados.tipo,
    saldo_inicial: dados.saldoInicial,
    saldo_inicial_data: dados.saldoInicialData,
    ativo: dados.ativo,
  };
}

/**
 * Cria uma conta bancária. RLS cobre o insert e created_by vem por trigger.
 */
export async function criarConta(dados: ContaInput): Promise<ResultadoAcao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para criar contas bancárias" };
  }

  const validado = contaSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA)
    .insert(paraRegistro(validado.data));

  if (error) {
    return erroAcao(
      "financeiro.contas-bancarias.criarConta",
      error,
      "Não foi possível salvar a conta. Tente novamente",
    );
  }

  revalidarTelasDaConta();
  return { ok: true };
}

/** Edita uma conta bancária existente. RLS cobre o update. */
export async function editarConta(
  id: string,
  dados: ContaInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar contas bancárias" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Conta inválida" };

  const validado = contaSchema.safeParse(dados);
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
      "financeiro.contas-bancarias.editarConta",
      error,
      "Não foi possível salvar a conta. Tente novamente",
    );
  }

  revalidarTelasDaConta();
  return { ok: true };
}

/**
 * Ativa ou desativa a conta. Conta não tem exclusão física: só desativa,
 * para preservar o histórico de parcelas e conciliações vinculadas.
 */
export async function alternarAtivo(
  id: string,
  ativo: boolean,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar contas bancárias" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Conta inválida" };

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA)
    .update({ ativo })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "financeiro.contas-bancarias.alternarAtivo",
      error,
      "Não foi possível salvar a conta. Tente novamente",
    );
  }

  revalidarTelasDaConta();
  return { ok: true };
}
