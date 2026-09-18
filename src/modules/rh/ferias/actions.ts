"use server";

import { revalidatePath } from "next/cache";

import type { Acao } from "@/config/recursos";
import { logErroServidor } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { feriasSchema, type FeriasInput } from "@/modules/rh/ferias/schemas";

const RECURSO = "rh.decimo-terceiro-ferias" as const;
// A aba virou "13º e Férias" e a rota mudou. Revalidar a rota antiga
// não faria nada: ela é só um redirect, e a tabela ficaria com dado velho.
const ROTA = "/rh/decimo-terceiro-e-ferias";

export type ResultadoAcao = { ok: true } | { erro: string };

/**
 * Só devolve `error.message` ao usuário quando é um `raise exception` nosso
 * (SQLSTATE P0001, o default do plpgsql). Qualquer outro código é
 * infraestrutura e vai só pro log.
 *
 * É o que faz a trava do banco chegar legível: "O recibo está aprovado e já
 * virou conta a pagar. Desaprove antes de mudar as datas." em vez de um
 * genérico "não foi possível salvar". Sem isso as travas ficam mudas e quem
 * clicou não sabe o que corrigir.
 */
function mensagemDeNegocio(
  operacao: string,
  error: { code?: string; message?: string } | null | undefined,
  fallback: string,
): string {
  if (error?.code === "P0001" && error.message) return error.message;
  logErroServidor(`rh.ferias.${operacao}`, error);
  return fallback;
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

/**
 * Argumentos de gozo das RPCs de cadastro.
 *
 * `?? undefined` OMITE o parâmetro e deixa valer o DEFAULT do banco. Mandar
 * `null` também funcionaria hoje, mas "não informado" é estado legítimo para
 * as datas de gozo (período só programado ainda não tem início e fim), e
 * omitir é o que diz isso.
 */
function argumentosDeGozo(dados: FeriasInput) {
  return {
    p_aquisitivo_inicio: dados.periodoAquisitivoInicio,
    p_aquisitivo_fim: dados.periodoAquisitivoFim,
    p_data_inicio: dados.dataInicio ?? undefined,
    p_data_fim: dados.dataFim ?? undefined,
    p_dias: dados.dias,
    p_status: dados.status,
    p_observacao: dados.observacao ?? undefined,
  };
}

/**
 * Cria um registro de férias.
 *
 * Escreve por RPC, e não por `.insert()` direto: enquanto existir escrita
 * direta o grant de `rh_ferias` tem que ficar aberto, e grant de tabela não se
 * reduz por coluna. Com o grant aberto, qualquer usuário autenticado altera
 * `valor_bruto` e `status_recibo` pelo PostgREST sem passar por trava nenhuma.
 */
export async function criarFerias(dados: FeriasInput): Promise<ResultadoAcao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para criar férias" };
  }

  const validado = feriasSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_criar_ferias", {
    p_colaborador: validado.data.colaboradorId,
    ...argumentosDeGozo(validado.data),
  });

  if (error) {
    return {
      erro: mensagemDeNegocio(
        "criar",
        error,
        "Não foi possível salvar as férias. Tente novamente",
      ),
    };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Edita um registro de férias. */
export async function editarFerias(
  id: string,
  dados: FeriasInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar férias" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Registro inválido" };

  const validado = feriasSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_editar_ferias", {
    p_ferias: idValido.data,
    ...argumentosDeGozo(validado.data),
  });

  if (error) {
    return {
      erro: mensagemDeNegocio(
        "editar",
        error,
        "Não foi possível salvar as férias. Tente novamente",
      ),
    };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Remove um registro de férias. */
export async function removerFerias(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("excluir"))) {
    return { erro: "Sem permissão para excluir férias" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Registro inválido" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_excluir_ferias", {
    p_ferias: idValido.data,
  });

  if (error) {
    return {
      erro: mensagemDeNegocio(
        "excluir",
        error,
        "Não foi possível excluir as férias. Tente novamente",
      ),
    };
  }

  revalidatePath(ROTA);
  return { ok: true };
}
