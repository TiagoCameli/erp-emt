"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  listarParcelasPagas,
  type FiltrosParcelasPagas,
  type ParcelasPagasPagina,
} from "@/modules/financeiro/pagamentos/queries";

const RECURSO = "financeiro.pagamentos" as const;
const ROTA = "/financeiro/pagamentos";

export type ResultadoAcao = { ok: true } | { erro: string };

const uuidSchema = z.uuid();
const dataSchema = z.iso.date();

/**
 * Desconto do pagamento: dinheiro, então nunca negativo e no teto do
 * NUMERIC(14,2). O "não pode passar do valor da parcela" NÃO é checado aqui de
 * propósito: quem sabe o valor da parcela é o banco (a Server Action não pode
 * confiar no valor que o cliente mandou), e lá existem as duas barreiras, a
 * recusa da fn_pagar_parcela e o check da tabela.
 */
const descontoSchema = z.number().min(0).max(999999999999.99);

/**
 * Registra o pagamento de uma parcela via RPC. A_pagar exige parcela já
 * aprovada (a regra é validada no banco). Repassa a mensagem de erro do
 * banco direto para o toast. Sem anexo de comprovante nesta fase.
 *
 * `desconto` é o abatimento concedido pelo credor no ato do pagamento, em
 * reais: sai do valor que a conta bancária paga, sem mexer no valor devido da
 * parcela. Omitido ou zero, o pagamento é exatamente o de antes.
 */
export async function pagarParcela(
  id: string,
  contaBancariaId: string,
  dataPagamento: string,
  desconto = 0,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para registrar pagamentos" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Parcela inválida" };

  const contaValida = uuidSchema.safeParse(contaBancariaId);
  if (!contaValida.success) return { erro: "Selecione a conta bancária" };

  const dataValida = dataSchema.safeParse(dataPagamento);
  if (!dataValida.success) return { erro: "Informe a data do pagamento" };

  const descontoValido = descontoSchema.safeParse(desconto);
  if (!descontoValido.success) return { erro: "Desconto inválido" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_pagar_parcela", {
    p_parcela_id: idValido.data,
    p_conta_id: contaValida.data,
    p_data_pagamento: dataValida.data,
    p_desconto: descontoValido.data,
  });

  if (error) {
    return erroAcao(
      "financeiro.pagamentos.pagarParcela",
      error,
      error.message || "Não foi possível registrar o pagamento",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Estorna o pagamento de uma parcela via RPC. O banco exige a parcela estar
 * 'pago', barra quando conciliada e devolve a parcela ao estado anterior (o
 * saldo da conta, que é derivado, se restaura sozinho). Repassa a mensagem de
 * erro do banco direto para o toast.
 */
export async function estornarPagamento(
  parcelaId: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "excluir");
  } catch {
    return { erro: "Sem permissão para estornar pagamentos" };
  }

  const idValido = uuidSchema.safeParse(parcelaId);
  if (!idValido.success) return { erro: "Parcela inválida" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_estornar_pagamento", {
    p_parcela_id: idValido.data,
  });

  if (error) {
    return erroAcao(
      "financeiro.pagamentos.estornarPagamento",
      error,
      error.message || "Não foi possível estornar o pagamento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Teto do filtro de valor: o mesmo da coluna NUMERIC(14,2). */
const VALOR_MAXIMO = 999999999999.99;

const valorFiltroSchema = z.number().min(0).max(VALOR_MAXIMO).optional();

/**
 * Filtros do histórico vindos do cliente. Revalidados aqui mesmo já tendo sido
 * validados na página: a action é porta de entrada pública, e filtro inválido
 * não pode virar filtro do PostgREST.
 */
const filtrosPagasSchema = z.object({
  busca: z.string().trim().max(120).optional(),
  fornecedorId: z.uuid().optional(),
  contaBancariaId: z.uuid().optional(),
  valorDe: valorFiltroSchema,
  valorAte: valorFiltroSchema,
  vencimentoDe: z.iso.date().optional(),
  vencimentoAte: z.iso.date().optional(),
  programadaDe: z.iso.date().optional(),
  programadaAte: z.iso.date().optional(),
  pagamentoDe: z.iso.date().optional(),
  pagamentoAte: z.iso.date().optional(),
});

/**
 * Página do histórico de pagamentos, para a paginação server-side da tabela
 * "Pagas". Exige só a permissão de ver (a RLS no banco é a barreira final). Os
 * filtros vão para o banco: a aba é paginada no servidor, então filtrar em
 * memória mostraria "3 resultados" quando existem trezentos.
 */
export async function buscarParcelasPagas(
  pagina: number,
  tamanho: number,
  filtros: FiltrosParcelasPagas = {},
): Promise<ParcelasPagasPagina> {
  await exigirPermissao(RECURSO, "ver");

  const validados = filtrosPagasSchema.safeParse(filtros);
  if (!validados.success) {
    // Recusa em vez de ignorar: devolver a lista inteira com os filtros na tela
    // faria o operador ler o histórico todo como se fosse o filtrado.
    throw new Error("Filtro inválido no histórico de pagamentos");
  }

  return listarParcelasPagas({ pagina, tamanho, filtros: validados.data });
}
