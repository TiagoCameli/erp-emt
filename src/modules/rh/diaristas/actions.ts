"use server";

import { revalidatePath } from "next/cache";

import type { Acao } from "@/config/recursos";
import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  diariaSchema,
  fecharSchema,
  novaFuncaoSchema,
  type DiariaInput,
  type FecharInput,
  type NovaFuncaoInput,
} from "@/modules/rh/diaristas/schemas";

const RECURSO = "rh.diaristas" as const;
const ROTA = "/rh/diaristas";

export type ResultadoAcao = { ok: true } | { erro: string };

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
 * Grava a diária por período pela `fn_salvar_diaria` (p_id nulo cria). O banco
 * calcula quantidade e total a partir dos dias, grava o último valor da função
 * e, na diária fechada, acerta o lançamento a pagar com as travas de sempre
 * (pagamento aprovado/pago/conciliado, folha, troca de diarista ou mês).
 */
async function salvarDiaria(
  id: string | null,
  dados: DiariaInput,
  contexto: string,
): Promise<ResultadoAcao> {
  const validado = diariaSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_salvar_diaria", {
    // As RPCs aceitam null (criar / sem obra); o tipo gerado não sabe disso.
    p_id: id as string,
    p_colaborador: validado.data.colaboradorId,
    p_funcao: validado.data.funcaoId,
    p_obra: (validado.data.obraId ?? null) as string,
    p_inicio: validado.data.inicio,
    p_fim: validado.data.fim,
    p_meias: validado.data.meias,
    p_faltas: validado.data.faltas,
    p_valor_diaria: validado.data.valorDiaria,
    p_observacao: validado.data.observacao ?? "",
  });

  if (error) {
    return erroAcao(
      contexto,
      error,
      error.message || "Não foi possível salvar a diária. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Registra uma diária por período. */
export async function criarDiaria(dados: DiariaInput): Promise<ResultadoAcao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para registrar diárias" };
  }
  return salvarDiaria(null, dados, "rh.diaristas.criar");
}

/** Edita uma diária, aberta ou já fechada. */
export async function editarDiaria(
  id: string,
  dados: DiariaInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar diárias" };
  }
  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Diária inválida" };
  return salvarDiaria(idValido.data, dados, "rh.diaristas.editar");
}

/**
 * Cria uma função no catálogo único pelo formulário da diária
 * (`fn_criar_funcao_diaria`). Nome repetido reaproveita a existente. O valor
 * vira o valor atual da função na tabela "Valores por função".
 */
export async function criarFuncaoDiaria(
  dados: NovaFuncaoInput,
): Promise<{ ok: true; id: string; nome: string } | { erro: string }> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para criar função" };
  }

  const validado = novaFuncaoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_criar_funcao_diaria", {
    p_nome: validado.data.nome,
    p_valor: validado.data.valor,
  });

  if (error || !data) {
    return erroAcao(
      "rh.diaristas.criarFuncao",
      error,
      error?.message || "Não foi possível criar a função",
    );
  }

  revalidatePath(ROTA);
  // Mesmo nome que o banco grava: maiúsculo, espaços colapsados.
  const nome = validado.data.nome.replace(/\s+/g, " ").toUpperCase();
  return { ok: true, id: data, nome };
}

/**
 * Exclui uma diária, aberta ou já fechada, pela `fn_excluir_diaria`. Na fechada
 * o banco tira o valor dela do lançamento a pagar, ou apaga o lançamento quando
 * ela era a única. Mesmas travas da edição.
 */
export async function removerDiaria(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para excluir diárias" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Diária inválida" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_excluir_diaria", {
    p_id: idValido.data,
  });

  if (error) {
    return erroAcao(
      "rh.diaristas.remover",
      error,
      error.message || "Não foi possível excluir a diária. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Fecha as diárias em aberto de um diarista numa competência via
 * fn_fechar_diarias, que cria UM lançamento a pagar somando os valores e marca
 * as diárias.
 *
 * Vencimento e forma de pagamento são obrigatórios e vão SEMPRE. Antes o
 * vencimento só era enviado quando a tela tinha valor, e o lançamento nascia sem
 * data -- o `if` que faltava era o defeito. Quem recebe e em que categoria o
 * custo entra não vêm daqui: o trigger `trg_rh_completar_lancamento` deriva os
 * dois do cadastro, para os três caminhos do RH no mesmo lugar.
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
  const { error } = await supabase.rpc("fn_fechar_diarias", {
    p_colaborador: validado.data.colaboradorId,
    p_competencia: validado.data.competencia,
    p_data_vencimento: validado.data.dataVencimento,
    p_forma_pagamento: validado.data.formaPagamentoId,
  });

  if (error) {
    return erroAcao(
      "rh.diaristas.fechar",
      error,
      error.message || "Não foi possível fechar as diárias",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}
