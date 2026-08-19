"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao } from "@/lib/erros";
import { formatarData } from "@/lib/formatadores";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import type { EventoTrilha } from "@/components/canonicos/trilha";
import { anexosDoDocumento } from "@/modules/_shared/anexos/actions";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import {
  buscarPagamentosParaEspelho,
  type EspelhoPagamento,
} from "@/modules/financeiro/pagamentos/espelho";
import { foraDaJanela } from "@/modules/financeiro/pagamentos/janela";
import {
  listarParcelasPagas,
  trilhaParcelasDoLancamento,
  type FiltrosParcelasPagas,
  type ParcelasPagasPagina,
} from "@/modules/financeiro/pagamentos/queries";

/** Tudo que o painel de detalhe da parcela mostra, numa ida só ao servidor. */
export interface DetalheParcela {
  espelho: EspelhoPagamento;
  anexos: AnexoDoDocumento[];
  trilha: EventoTrilha[];
}

const RECURSO = "financeiro.pagamentos" as const;
const ROTA = "/financeiro/pagamentos";

export type ResultadoAcao = { ok: true } | { erro: string };

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
 * Motivo de pagar fora da data autorizada. Trimado (motivo só de espaços é
 * motivo nenhum, e o banco aplica o mesmo `btrim`) e com teto de 500
 * caracteres, que a coluna `parcela_eventos.motivo` não tem: sem teto aqui, um
 * cliente contornado poderia gravar um texto de megabytes na trilha.
 */
const motivoSchema = z.string().trim().min(1).max(500);

/**
 * Registra o pagamento de uma parcela via RPC. A_pagar exige parcela já
 * aprovada (a regra é validada no banco). Repassa a mensagem de erro do
 * banco direto para o toast. Sem anexo de comprovante nesta fase.
 *
 * `desconto` é o abatimento concedido pelo credor no ato do pagamento, em
 * reais: sai do valor que a conta bancária paga, sem mexer no valor devido da
 * parcela. Omitido ou zero, o pagamento é exatamente o de antes.
 *
 * `motivo` é a justificativa de pagar em data diferente da autorizada. Pagar
 * fora da data deixou de ser recusa e passou a ser exceção auditada: com motivo
 * o banco paga e grava o evento `pagou_fora_da_janela` na trilha da parcela.
 * Obrigatório só nesse caso, e a exigência é conferida aqui também, não só na
 * tela: o cliente pode ser contornado, e pagamento fora da data sem
 * justificativa é exatamente o que a trilha existe para não deixar acontecer.
 */
export async function pagarParcela(
  id: string,
  contaBancariaId: string,
  dataPagamento: string,
  desconto = 0,
  motivo?: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para registrar pagamentos" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Parcela inválida" };

  const contaValida = idSchema.safeParse(contaBancariaId);
  if (!contaValida.success) return { erro: "Selecione a conta bancária" };

  const dataValida = dataSchema.safeParse(dataPagamento);
  if (!dataValida.success) return { erro: "Informe a data do pagamento" };

  const descontoValido = descontoSchema.safeParse(desconto);
  if (!descontoValido.success) return { erro: "Desconto inválido" };

  const motivoInformado = (motivo ?? "").trim();
  if (motivoInformado !== "" && !motivoSchema.safeParse(motivoInformado).success) {
    return { erro: "O motivo deve ter no máximo 500 caracteres" };
  }

  const supabase = await createClient();

  // Quem sabe a data autorizada é o banco, não o formulário: confiar na tela
  // deixaria passar pagamento fora da data sem justificativa nenhuma. Leitura
  // separada porque a parcela chega aqui só como id.
  //
  // Parcela que não veio (leitura barrada por RLS, id inexistente) não bloqueia
  // aqui: a `fn_pagar_parcela` faz a MESMA exigência e é a barreira real, então
  // recusar por falta de leitura só trocaria a mensagem certa do banco por uma
  // pior. Esta ação é a do drawer de contas a pagar; o recebimento tem ação
  // própria (`darComoRecebido`) e não tem data autorizada.
  const { data: parcela } = await supabase
    .from("lancamento_parcelas")
    .select("data_programada")
    .eq("id", idValido.data)
    .maybeSingle();

  const dataAutorizada = parcela?.data_programada ?? null;
  if (motivoInformado === "" && foraDaJanela(dataValida.data, dataAutorizada)) {
    return {
      erro: `Este pagamento está fora da data autorizada (${formatarData(dataAutorizada)}): informe o motivo`,
    };
  }

  const { error } = await supabase.rpc("fn_pagar_parcela", {
    p_parcela_id: idValido.data,
    p_conta_id: contaValida.data,
    p_data_pagamento: dataValida.data,
    p_desconto: descontoValido.data,
    // Chave ausente quando não há motivo, para o parâmetro cair no default do
    // banco: mandar string vazia daria no mesmo, mas ausente é o que o
    // pagamento na data exata sempre foi.
    ...(motivoInformado === "" ? {} : { p_motivo: motivoInformado }),
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

  const idValido = idSchema.safeParse(parcelaId);
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
  fornecedorId: idSchema.optional(),
  contaBancariaId: idSchema.optional(),
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

/**
 * Detalhe completo de uma parcela, para o painel que abre ao clicar na linha.
 *
 * Junta o que estava espalhado em três lugares: os dados da parcela e do
 * lançamento com o rateio por centro de custo (o mesmo carregador do espelho
 * impresso, para a tela e o papel nunca discordarem), os anexos do pagamento e
 * a trilha de eventos.
 *
 * Vale para parcela em qualquer situação, paga ou não: quem clica numa linha da
 * fila a pagar quer saber a mesma coisa de quem clica numa já paga.
 */
export async function detalheDaParcela(
  id: string,
): Promise<DetalheParcela | { erro: string }> {
  try {
    await exigirPermissao(RECURSO, "ver");
  } catch {
    return { erro: "Sem permissão para ver pagamentos" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Parcela inválida" };

  const [espelho] = await buscarPagamentosParaEspelho([idValido.data]);
  if (!espelho) return { erro: "Parcela não encontrada" };

  // Anexos e trilha em paralelo: são leituras independentes. A trilha é do
  // LANÇAMENTO porque os eventos de uma parcela vivem junto com os das irmãs —
  // reparcelamento e alteração de valor só fazem sentido lidos em conjunto.
  const [anexos, trilha] = await Promise.all([
    anexosDoDocumento("pagamento", idValido.data),
    espelho.lancamentoId
      ? trilhaParcelasDoLancamento(espelho.lancamentoId)
      : Promise.resolve([]),
  ]);

  return { espelho, anexos, trilha };
}
