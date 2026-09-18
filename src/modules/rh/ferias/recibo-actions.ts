"use server";

import { revalidatePath } from "next/cache";

import type { Acao } from "@/config/recursos";
import { logErroServidor } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  definirVencimentoReciboSchema,
  editarReciboSchema,
  lancarFeriasSchema,
  motivoReciboSchema,
} from "@/modules/rh/ferias/recibo-schemas";

const RECURSO = "rh.decimo-terceiro-ferias" as const;
const ROTA = "/rh/decimo-terceiro-e-ferias";

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoLancamento = { ok: true; id: string } | { erro: string };

/**
 * Só devolve `error.message` ao usuário quando é um `raise exception` nosso
 * (SQLSTATE P0001, o default do plpgsql). Qualquer outro código é
 * infraestrutura e vai só pro log.
 *
 * É o que faz o toast dizer "Os descontos (180,00) passam do bruto (100,00)"
 * ou "Há parcela já paga neste recibo" em vez de "não foi possível". Sem isso
 * as travas do banco ficam mudas e quem clicou não sabe o que corrigir.
 */
function mensagemDeNegocio(
  operacao: string,
  error: { code?: string; message?: string } | null | undefined,
  fallback: string,
): string {
  if (error?.code === "P0001" && error.message) return error.message;
  logErroServidor(`rh.ferias-recibo.${operacao}`, error);
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
 * Revalida a lista E o detalhe.
 *
 * `revalidatePath(ROTA)` sozinho não alcança `/ferias/[id]`: rota dinâmica
 * precisa do segundo argumento "page", e sem ele a tela do recibo continuaria
 * mostrando o valor anterior depois de editar.
 *
 * Tudo dentro de try/catch, e de propósito: a revalidação roda DEPOIS de a RPC
 * ter commitado. Se ela estourar, o dinheiro já foi gravado, e devolver erro
 * aqui faria o usuário clicar de novo num recibo que já está aprovado. Falha
 * de revalidação é problema de cache, vai para o log e não para a resposta.
 */
function revalidarTelas(...extras: string[]): void {
  try {
    revalidatePath(ROTA);
    revalidatePath(`${ROTA}/ferias/[id]`, "page");
    for (const caminho of extras) revalidatePath(caminho);
  } catch (erro) {
    logErroServidor("rh.ferias-recibo.revalidar", erro);
  }
}

/** Lança as férias e o recibo numa tacada só. */
export async function lancarFerias(
  dados: unknown,
): Promise<ResultadoLancamento> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Você não tem permissão para lançar férias" };
  }

  const validado = lancarFeriasSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_lancar_ferias", {
    p_colaborador: validado.data.colaboradorId,
    p_aquisitivo_inicio: validado.data.periodoAquisitivoInicio,
    p_aquisitivo_fim: validado.data.periodoAquisitivoFim,
    p_data_inicio: validado.data.dataInicio,
    p_data_fim: validado.data.dataFim,
    p_dias: validado.data.dias,
    p_status: validado.data.status,
    p_bruto: validado.data.bruto,
    p_inss: validado.data.inss,
    p_irrf: validado.data.irrf,
    // `?? undefined` OMITE o parâmetro e deixa valer o DEFAULT do banco: sem
    // vencimento escolhido, vence dois dias antes do início do gozo.
    p_data_vencimento: validado.data.dataVencimento ?? undefined,
    p_observacao: validado.data.observacao ?? undefined,
  });

  if (error || !data) {
    return {
      erro: mensagemDeNegocio("lancar", error, "Não foi possível lançar as férias"),
    };
  }

  revalidarTelas();
  return { ok: true, id: data };
}

/** Grava os três valores digitados do recibo. */
export async function editarRecibo(dados: unknown): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Você não tem permissão para editar o recibo" };
  }

  const validado = editarReciboSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_editar_recibo_ferias", {
    p_ferias: validado.data.feriasId,
    p_bruto: validado.data.bruto,
    p_inss: validado.data.inss,
    p_irrf: validado.data.irrf,
  });

  if (error) {
    return {
      erro: mensagemDeNegocio("editar", error, "Não foi possível salvar o valor"),
    };
  }

  revalidarTelas();
  return { ok: true };
}

/**
 * Define ou apaga a data de vencimento.
 *
 * `null` é valor legítimo aqui, e não "não informado": apagar a data é o único
 * jeito de voltar ao padrão (dois dias antes do gozo) sem recriar o recibo.
 * Por isso NÃO leva `?? undefined`.
 */
export async function definirVencimentoRecibo(
  dados: unknown,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Você não tem permissão para editar o recibo" };
  }

  const validado = definirVencimentoReciboSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_definir_vencimento_ferias", {
    p_ferias: validado.data.feriasId,
    p_data: validado.data.dataVencimento,
  });

  if (error) {
    return {
      erro: mensagemDeNegocio(
        "vencimento",
        error,
        "Não foi possível salvar o vencimento",
      ),
    };
  }

  revalidarTelas();
  return { ok: true };
}

/** Manda o recibo para a fila de aprovação. */
export async function enviarReciboParaAprovacao(
  feriasId: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Você não tem permissão para enviar o recibo para aprovação" };
  }
  if (!idSchema.safeParse(feriasId).success) {
    return { erro: "Registro inválido" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_enviar_recibo_ferias_aprovacao", {
    p_ferias: feriasId,
  });

  if (error) {
    return {
      erro: mensagemDeNegocio(
        "enviar",
        error,
        "Não foi possível enviar para aprovação",
      ),
    };
  }

  revalidarTelas();
  return { ok: true };
}

/**
 * Traz o recibo de volta para rascunho, do lado de quem montou.
 *
 * É o caminho que faltou no 13º e deixou um lote preso em
 * `pendente_aprovacao` com a tela inteira em só leitura. Não leva motivo: não
 * é recusa, é quem enviou se corrigindo.
 */
export async function voltarReciboParaRascunho(
  feriasId: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Você não tem permissão para editar o recibo" };
  }
  if (!idSchema.safeParse(feriasId).success) {
    return { erro: "Registro inválido" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_voltar_recibo_ferias_para_rascunho", {
    p_ferias: feriasId,
  });

  if (error) {
    return {
      erro: mensagemDeNegocio(
        "voltar",
        error,
        "Não foi possível voltar o recibo para rascunho",
      ),
    };
  }

  revalidarTelas();
  return { ok: true };
}

/** Aprova o recibo: gera a conta a pagar e as guias. */
export async function aprovarRecibo(feriasId: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Você não tem permissão para aprovar o recibo" };
  }
  if (!idSchema.safeParse(feriasId).success) {
    return { erro: "Registro inválido" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_aprovar_recibo_ferias", {
    p_ferias: feriasId,
  });

  if (error) {
    return {
      erro: mensagemDeNegocio("aprovar", error, "Não foi possível aprovar o recibo"),
    };
  }

  // A aprovação cria a conta a pagar e as guias: o financeiro passa a mostrar
  // outra coisa.
  revalidarTelas("/financeiro/lancamentos", "/financeiro/pagamentos");
  return { ok: true };
}

/** Devolve o recibo pendente para rascunho, com motivo. Quem aprova recusa. */
export async function rejeitarRecibo(dados: unknown): Promise<ResultadoAcao> {
  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Você não tem permissão para rejeitar o recibo" };
  }

  const validado = motivoReciboSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_rejeitar_recibo_ferias", {
    p_ferias: validado.data.feriasId,
    p_motivo: validado.data.motivo,
  });

  if (error) {
    return {
      erro: mensagemDeNegocio("rejeitar", error, "Não foi possível rejeitar o recibo"),
    };
  }

  revalidarTelas();
  return { ok: true };
}

/** Desaprova o recibo aprovado: apaga a conta a pagar e a guia. */
export async function desaprovarRecibo(dados: unknown): Promise<ResultadoAcao> {
  if (!(await checarPermissao("desaprovar"))) {
    return { erro: "Você não tem permissão para desaprovar o recibo" };
  }

  const validado = motivoReciboSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_desaprovar_recibo_ferias", {
    p_ferias: validado.data.feriasId,
    p_motivo: validado.data.motivo,
  });

  if (error) {
    return {
      erro: mensagemDeNegocio(
        "desaprovar",
        error,
        "Não foi possível desaprovar o recibo",
      ),
    };
  }

  // Desaprovar apaga a conta a pagar e a guia que a aprovação criou.
  revalidarTelas("/financeiro/lancamentos", "/financeiro/pagamentos");
  return { ok: true };
}
