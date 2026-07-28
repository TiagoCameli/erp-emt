"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Json } from "@/lib/database.types";
import { erroAcao } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  lancamentoSchema,
  type LancamentoInput,
} from "@/modules/financeiro/lancamentos/schemas";

const RECURSO = "financeiro.lancamentos" as const;
const ROTA = "/financeiro/lancamentos";

export type ResultadoCriacao = { ok: true; id: string } | { erro: string };

export type ResultadoExclusao = { ok: true } | { erro: string };

const uuidSchema = z.uuid();

/** Cabeçalho do lançamento no formato que a RPC espera (p_dados). */
function dadosParaRpc(dados: LancamentoInput): Json {
  return {
    tipo: dados.tipo,
    fornecedor_id: dados.fornecedorId ?? null,
    categoria_id: dados.categoriaId ?? null,
    descricao: dados.descricao,
    valor: dados.valor,
    competencia: dados.competencia ?? null,
    data_vencimento: dados.dataVencimento ?? null,
  };
}

/** Parcelas no formato que a RPC espera (p_parcelas). */
function parcelasParaRpc(dados: LancamentoInput): Json {
  return dados.parcelas.map((parcela) => ({
    numero_parcela: parcela.numeroParcela,
    valor: parcela.valor,
    data_vencimento: parcela.dataVencimento ?? null,
  }));
}

/** Rateios no formato que a RPC espera (p_rateios). */
function rateiosParaRpc(dados: LancamentoInput): Json {
  return dados.rateios.map((rateio) => ({
    centro_custo_id: rateio.centroCustoId,
    valor: rateio.valor,
  }));
}

/**
 * Cria (id null) ou edita (id) um lançamento manual com suas parcelas e
 * rateios via fn_salvar_lancamento. A RPC valida soma das parcelas = valor e
 * soma do rateio = valor; o erro do banco é repassado direto ao toast.
 *
 * Lançamentos de origem diferente de 'manual' (ex: 'oc', vindos de compras) são
 * somente-leitura aqui: a barreira é tripla (UI esconde o botão, esta action
 * recusa antes de chamar a RPC, e a própria RPC levanta exceção). Editar um
 * lançamento de OC se faz na origem (Compras).
 */
export async function salvarLancamento(
  id: string | null,
  dados: LancamentoInput,
): Promise<ResultadoCriacao> {
  const acao = id === null ? "criar" : "editar";
  try {
    await exigirPermissao(RECURSO, acao);
  } catch {
    return {
      erro:
        id === null
          ? "Sem permissão para criar lançamentos"
          : "Sem permissão para editar lançamentos",
    };
  }

  const supabase = await createClient();

  if (id !== null) {
    const idValido = uuidSchema.safeParse(id);
    if (!idValido.success) return { erro: "Lançamento inválido" };

    // Só lançamento manual se edita aqui. OC e outras origens editam-se na
    // origem; bloqueamos antes da RPC (que também recusa).
    const { data: existente, error: erroExistente } = await supabase
      .from("lancamentos")
      .select("origem")
      .eq("id", idValido.data)
      .maybeSingle();
    if (erroExistente || !existente) {
      return erroAcao(
        "financeiro.lancamentos.salvarLancamento",
        erroExistente,
        "Lançamento não encontrado",
      );
    }
    if (existente.origem !== "manual") {
      return {
        erro: `Lançamento de origem ${existente.origem} é somente-leitura aqui. Edite na origem.`,
      };
    }
  }

  const validado = lancamentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const { data, error } = await supabase.rpc("fn_salvar_lancamento", {
    p_id: id as string,
    p_dados: dadosParaRpc(validado.data),
    p_parcelas: parcelasParaRpc(validado.data),
    p_rateios: rateiosParaRpc(validado.data),
  });

  if (error || !data) {
    return erroAcao(
      "financeiro.lancamentos.salvarLancamento",
      error,
      error?.message || "Não foi possível salvar o lançamento",
    );
  }

  revalidatePath(ROTA);
  return { ok: true, id: data };
}

/**
 * Exclui um lançamento com suas parcelas e rateios via fn_excluir_lancamento.
 * A RPC checa a permissão, recusa lançamentos de origem 'oc' ou 'diaria'
 * (que devem ser excluídos pela origem) e lançamentos com parcela paga ou
 * conciliada, sempre com uma mensagem amigável que repassamos direto ao toast.
 */
export async function excluirLancamento(
  id: string,
): Promise<ResultadoExclusao> {
  try {
    await exigirPermissao(RECURSO, "excluir");
  } catch {
    return { erro: "Sem permissão para excluir lançamentos" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Lançamento inválido" };

  const supabase = await createClient();

  const { error } = await supabase.rpc("fn_excluir_lancamento", {
    p_id: idValido.data,
  });

  if (error) {
    return erroAcao(
      "financeiro.lancamentos.excluirLancamento",
      error,
      error.message || "Não foi possível excluir o lançamento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Definir parcelas de um lançamento que nasceu sem elas
// ---------------------------------------------------------------------------
// É o outro lado das parcelas manuais da OC: quando a ordem não define
// parcelas, o lançamento nasce sem nenhuma e alguém precisa definir aqui.
// fn_salvar_lancamento recusa lançamento de origem <> 'manual' de propósito (o
// cabeçalho pertence à origem), então isso passa por uma função dedicada que só
// mexe nas parcelas.

/** Parcela definida na tela do lançamento. */
const parcelaDefinidaSchema = z.object({
  dataVencimento: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Informe o vencimento da parcela" }),
  valor: z
    .number({ error: "Valor da parcela inválido" })
    .positive({ error: "O valor da parcela precisa ser maior que zero" }),
});

export type ParcelaDefinidaInput = z.infer<typeof parcelaDefinidaSchema>;

/**
 * Troca as parcelas de um lançamento. A função do banco valida o resto: soma
 * igual ao valor do lançamento e nenhuma parcela já aprovada ou paga.
 */
export async function definirParcelasLancamento(
  lancamentoId: string,
  parcelas: ParcelaDefinidaInput[],
): Promise<ResultadoExclusao> {
  await exigirPermissao(RECURSO, "editar");

  const idValido = uuidSchema.safeParse(lancamentoId);
  if (!idValido.success) return { erro: "Lançamento inválido" };

  const validado = z.array(parcelaDefinidaSchema).min(1).safeParse(parcelas);
  if (!validado.success) {
    return {
      erro: validado.error.issues[0]?.message ?? "Informe ao menos uma parcela",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_definir_parcelas_lancamento", {
    p_lanc_id: idValido.data,
    p_parcelas: validado.data.map((parcela) => ({
      data_vencimento: parcela.dataVencimento,
      valor: parcela.valor,
    })),
  });

  if (error) {
    return erroAcao(
      "financeiro.lancamentos.definirParcelas",
      error,
      error.message ?? "Não foi possível salvar as parcelas",
    );
  }

  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/${idValido.data}`);
  return { ok: true };
}

/**
 * Sugestão de parcelas para um lançamento de OC, pela condição de pagamento da
 * ordem de origem (o lançamento não tem condição própria). A divisão é a função
 * do banco, a mesma da OC. Data base: a emissão do lançamento.
 */
export async function sugerirParcelasDoLancamento(
  lancamentoId: string,
): Promise<
  { parcelas: { dataVencimento: string; valor: number }[] } | { erro: string }
> {
  await exigirPermissao(RECURSO, "ver");

  const idValido = uuidSchema.safeParse(lancamentoId);
  if (!idValido.success) return { erro: "Lançamento inválido" };

  const supabase = await createClient();
  const { data: lancamento } = await supabase
    .from("lancamentos")
    .select("valor, data_emissao, origem, origem_id")
    .eq("id", idValido.data)
    .maybeSingle();

  if (!lancamento) return { erro: "Lançamento não encontrado" };
  if (lancamento.origem !== "oc" || !lancamento.origem_id) {
    return {
      erro: "Só dá para gerar pela condição em lançamento vindo de ordem de compra",
    };
  }

  const { data: ordem } = await supabase
    .from("ordens_compra")
    .select("condicao_pagamento_id")
    .eq("id", lancamento.origem_id)
    .maybeSingle();

  if (!ordem?.condicao_pagamento_id) {
    return { erro: "A ordem de origem não tem condição de pagamento definida" };
  }

  const { data, error } = await supabase.rpc("fn_parcelas_da_condicao", {
    p_condicao_id: ordem.condicao_pagamento_id,
    p_valor: lancamento.valor,
    p_data_base: lancamento.data_emissao,
  });

  if (error) {
    return { erro: error.message ?? "Não foi possível gerar as parcelas" };
  }

  return {
    parcelas: (data ?? []).map((parcela) => ({
      dataVencimento: parcela.data_vencimento,
      valor: parcela.valor,
    })),
  };
}
