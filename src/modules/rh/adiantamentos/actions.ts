"use server";

import { revalidatePath } from "next/cache";

import type { Acao } from "@/config/recursos";
import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
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
 * Garante que o adiantamento existe, ainda não entrou numa folha (folha_id
 * preenchido) e o lançamento dele (se já existir) não tem pagamento
 * comprometido (parcela aprovada, paga ou conciliada). Qualquer um dos três
 * trava editar e excluir. A checagem de pagamento vai pela RPC
 * `fn_adiantamento_pagamento_comprometido` (security definer) porque um
 * perfil só-rh.adiantamentos não enxerga `lancamento_parcelas`/
 * `extrato_transacoes` pela RLS: uma consulta direta a essas tabelas
 * devolveria sempre vazio para esse perfil e a trava passaria "falso
 * positivo" de liberado.
 */
async function garantirEmAberto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<ResultadoAcao> {
  const { data, error } = await supabase
    .from(TABELA)
    .select("folha_id, lancamento_id")
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
  if (data.lancamento_id !== null) {
    const { data: comprometido, error: erroComprometido } = await supabase.rpc(
      "fn_adiantamento_pagamento_comprometido",
      { p_lancamento_id: data.lancamento_id },
    );

    if (erroComprometido) {
      return erroAcao(
        "rh.adiantamentos.garantirEmAberto",
        erroComprometido,
        "Não foi possível conferir o pagamento do adiantamento",
      );
    }
    if (comprometido) {
      return {
        erro:
          "O pagamento deste adiantamento já foi aprovado, pago ou conciliado. Estorne o pagamento antes de editar ou excluir",
      };
    }
  }
  return { ok: true };
}

/**
 * Cria um adiantamento. Vai pela RPC `fn_registrar_adiantamento`, que grava o
 * adiantamento e o lançamento a_pagar dele (no centro de custo do
 * colaborador) na mesma transação: um insert direto seguido de outra chamada
 * deixaria um dos dois órfão se a segunda falhasse.
 */
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
  const { error } = await supabase.rpc("fn_registrar_adiantamento", {
    p_dados: {
      colaborador_id: validado.data.colaboradorId,
      competencia: validado.data.competencia,
      valor: validado.data.valor,
      data: validado.data.data,
      descricao: validado.data.descricao ?? null,
    },
  });

  if (error) {
    return erroAcao(
      "rh.adiantamentos.criar",
      error,
      error.message || "Não foi possível salvar o adiantamento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Edita um adiantamento. Bloqueia se já entrou numa folha ou tem pagamento comprometido. */
export async function editarAdiantamento(
  id: string,
  dados: AdiantamentoInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar adiantamentos" };
  }

  const idValido = idSchema.safeParse(id);
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

/**
 * Remove um adiantamento. Bloqueia se já entrou numa folha ou tem pagamento
 * comprometido. Vai pela RPC `fn_excluir_adiantamento`, que apaga o
 * adiantamento e o lançamento dele junto, na mesma transação: por isso não é
 * mais um `.delete()` direto na tabela (que só apagaria o adiantamento e
 * deixaria o lançamento órfão).
 */
export async function removerAdiantamento(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("excluir"))) {
    return { erro: "Sem permissão para excluir adiantamentos" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Adiantamento inválido" };

  const supabase = await createClient();

  const aberto = await garantirEmAberto(supabase, idValido.data);
  if ("erro" in aberto) return aberto;

  const { error } = await supabase.rpc("fn_excluir_adiantamento", {
    p_id: idValido.data,
  });

  if (error) {
    return erroAcao(
      "rh.adiantamentos.remover",
      error,
      error.message || "Não foi possível excluir o adiantamento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}
