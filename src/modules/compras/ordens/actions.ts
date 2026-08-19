"use server";

import { revalidatePath } from "next/cache";

import type { Acao } from "@/config/recursos";
import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  ordemCompraSchema,
  recebimentoSchema,
  type OrdemCompraInput,
  type RecebimentoInput,
} from "@/modules/compras/ordens/schemas";

const RECURSO = "compras.ordens" as const;
const ROTA = "/compras/ordens";
const TABELA = "ordens_compra" as const;

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoCriacao = { ok: true; id: string } | { erro: string };

/** Status em que a OC ainda é editável (sem efeito financeiro). */
const STATUS_EDITAVEIS = new Set(["rascunho", "pendente_aprovacao"]);

/** Converte o throw de exigirPermissao no contrato { erro } das actions. */
async function checarPermissao(acao: Acao): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/** Mapeia um item validado para o formato de coluna (snake_case), sem o id
 * da OC: usado tanto pro insert direto de editarOrdem quanto pro jsonb de
 * itens que fn_criar_ordem_compra recebe. */
function itemParaRegistro(item: OrdemCompraInput["itens"][number]) {
  return {
    insumo_id: item.insumoId,
    quantidade: item.quantidade,
    preco_unitario: item.precoUnitario,
    centro_custo_id: item.centroCustoId,
  };
}

/** Mapeia os itens validados para os registros de oc_itens (com o id da OC). */
function itensParaRegistros(
  ordemCompraId: string,
  itens: OrdemCompraInput["itens"],
) {
  return itens.map((item) => ({
    ordem_compra_id: ordemCompraId,
    ...itemParaRegistro(item),
  }));
}

/** Cabeçalho da OC para insert/update, sem campos de status nem valor_total. */
function cabecalhoParaRegistro(dados: OrdemCompraInput) {
  return {
    fornecedor_id: dados.fornecedorId,
    condicao_pagamento_id: dados.condicaoPagamentoId,
    forma_pagamento_id: dados.formaPagamentoId ?? null,
    cotacao_id: dados.cotacaoId ?? null,
    data_compra: dados.dataCompra,
    mes_competencia: dados.mesCompetencia,
    // A descrição desce para o lançamento gerado na aprovação. A categoria do custo
    // não vem daqui: ela é derivada dos insumos dos itens, pelo trigger
    // trg_categoria_da_oc_pelos_itens, e o rateio por categoria é montado na
    // aprovação (fn_aprovar_ordem_compra).
    descricao: dados.descricao,
    observacoes: dados.observacoes ?? null,
  };
}

/**
 * Cria uma OC em rascunho com seus itens via RPC transacional: cabeçalho,
 * itens e valor_total final são gravados na mesma transação no banco, então
 * a trilha de auditoria registra um único "criado" com o total certo (nunca
 * "criado (total 0)" seguido de "editado"). Ver
 * supabase/migrations/20260722150004_fn_criar_ordem_compra.sql.
 */
/**
 * Parcelas no formato que fn_salvar_parcelas_oc espera. A numeração não vai:
 * quem numera é a função, pela ordem de vencimento.
 */
function parcelasParaRegistro(parcelas: OrdemCompraInput["parcelas"]) {
  return parcelas.map((parcela) => ({
    data_vencimento: parcela.dataVencimento,
    valor: parcela.valor,
  }));
}

/**
 * Grava as parcelas da OC numa chamada só (a função troca todas de uma vez e
 * revalida soma, status e vencimento). Lista vazia limpa: a OC volta a ser
 * "sem parcelas definidas" e o lançamento nascerá sem parcela.
 *
 * Roda DEPOIS do cabeçalho e dos itens, porque a função confere a soma contra
 * o valor_total, que o trigger recalcula a partir dos itens.
 */
async function salvarParcelas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ordemId: string,
  parcelas: OrdemCompraInput["parcelas"],
): Promise<string | null> {
  const { error } = await supabase.rpc("fn_salvar_parcelas_oc", {
    p_oc_id: ordemId,
    p_parcelas: parcelasParaRegistro(parcelas),
  });
  return error
    ? (error.message ?? "Não foi possível salvar as parcelas")
    : null;
}

export async function criarOrdem(
  dados: OrdemCompraInput,
): Promise<ResultadoCriacao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para criar ordens de compra" };
  }

  const validado = ordemCompraSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("fn_criar_ordem_compra", {
    p_cabecalho: cabecalhoParaRegistro(validado.data),
    p_itens: validado.data.itens.map(itemParaRegistro),
  });

  if (error || !id) {
    return erroAcao(
      "compras.ordens.criarOrdem",
      error,
      "Não foi possível salvar a ordem de compra. Tente novamente",
    );
  }

  const erroParcelas = await salvarParcelas(
    supabase,
    id,
    validado.data.parcelas,
  );
  if (erroParcelas) {
    // A OC existe (o RPC de criação é atômico); só as parcelas não entraram.
    // Melhor dizer isso do que fingir que nada foi salvo.
    revalidatePath(ROTA);
    return {
      erro: `A ordem foi criada, mas as parcelas não: ${erroParcelas}. Abra a ordem e ajuste as parcelas.`,
    };
  }

  revalidatePath(ROTA);
  return { ok: true, id };
}

/**
 * Edita a OC e substitui os itens dela. Só em rascunho ou pendente: OC
 * aprovada precisa ser desaprovada antes (regra de ouro 8). Os itens são
 * trocados por inteiro; o trigger recalcula o valor_total.
 */
export async function editarOrdem(
  id: string,
  dados: OrdemCompraInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar ordens de compra" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Ordem de compra inválida" };

  const validado = ordemCompraSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();

  const { data: atual, error: erroBusca } = await supabase
    .from(TABELA)
    .select("status")
    .eq("id", idValido.data)
    .single();

  if (erroBusca || !atual) {
    return erroAcao(
      "compras.ordens.editarOrdem",
      erroBusca,
      "Ordem de compra não encontrada",
    );
  }
  if (!STATUS_EDITAVEIS.has(atual.status)) {
    return {
      erro: "Só dá para editar ordens em rascunho ou pendentes. Desaprove antes de alterar",
    };
  }

  const { error } = await supabase
    .from(TABELA)
    .update(cabecalhoParaRegistro(validado.data))
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "compras.ordens.editarOrdem",
      error,
      "Não foi possível salvar a ordem de compra. Tente novamente",
    );
  }

  // Troca os itens por inteiro: apaga os antigos e insere os novos. Sem
  // transação no supabase-js, guardamos os itens antigos antes de apagar e os
  // restauramos se o insert falhar, para a OC nunca ficar sem nenhum item.
  const { data: itensAntigos } = await supabase
    .from("oc_itens")
    .select(
      "ordem_compra_id, insumo_id, quantidade, preco_unitario, centro_custo_id",
    )
    .eq("ordem_compra_id", idValido.data);

  const { error: erroDelete } = await supabase
    .from("oc_itens")
    .delete()
    .eq("ordem_compra_id", idValido.data);

  if (erroDelete) {
    return erroAcao(
      "compras.ordens.editarOrdem",
      erroDelete,
      "Não foi possível atualizar os itens. Tente novamente",
    );
  }

  const { error: erroItens } = await supabase
    .from("oc_itens")
    .insert(itensParaRegistros(idValido.data, validado.data.itens));

  if (erroItens) {
    // Restaura o estado anterior para não deixar a OC sem itens.
    if (itensAntigos && itensAntigos.length > 0) {
      await supabase.from("oc_itens").insert(itensAntigos);
    }
    return erroAcao(
      "compras.ordens.editarOrdem",
      erroItens,
      "Não foi possível salvar os itens. Tente novamente",
    );
  }

  const erroParcelas = await salvarParcelas(
    supabase,
    idValido.data,
    validado.data.parcelas,
  );
  if (erroParcelas) {
    revalidatePath(ROTA);
    return { erro: `As parcelas não foram salvas: ${erroParcelas}` };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Sugestão de parcelas a partir da condição de pagamento da OC, para o botão
 * "Gerar pela condição". A divisão é feita pela função do banco
 * (fn_parcelas_da_condicao), que é a única implementação dessa matemática no
 * sistema: percentual por parcela, vencimento = data base + dias e a sobra de
 * centavos na última parcela.
 */
export async function sugerirParcelasPelaCondicao(
  condicaoPagamentoId: string,
  total: number,
  dataBase: string,
): Promise<
  { parcelas: { dataVencimento: string; valor: number }[] } | { erro: string }
> {
  if (!(await checarPermissao("ver"))) {
    return { erro: "Sem permissão para ver ordens de compra" };
  }

  const condicaoValida = idSchema.safeParse(condicaoPagamentoId);
  if (!condicaoValida.success) {
    return {
      erro: "Escolha a condição de pagamento antes de gerar as parcelas",
    };
  }
  if (!Number.isFinite(total) || total <= 0) {
    return { erro: "Adicione itens à ordem antes de gerar as parcelas" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataBase)) {
    return { erro: "Informe a data de emissão antes de gerar as parcelas" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_parcelas_da_condicao", {
    p_condicao_id: condicaoValida.data,
    p_valor: total,
    p_data_base: dataBase,
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

/** Atualiza só o status da OC, com a guarda de transição esperada. */
async function transicionarStatus(
  id: string,
  acao: Acao,
  statusEsperado: string,
  novoStatus: string,
  extra: { motivo_rejeicao?: string | null } = {},
): Promise<ResultadoAcao> {
  if (!(await checarPermissao(acao))) {
    return { erro: `Sem permissão para esta ação em ordens de compra` };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Ordem de compra inválida" };

  const supabase = await createClient();
  const { data: atual, error: erroBusca } = await supabase
    .from(TABELA)
    .select("status")
    .eq("id", idValido.data)
    .single();

  if (erroBusca || !atual) {
    return erroAcao(
      "compras.ordens.transicionarStatus",
      erroBusca,
      "Ordem de compra não encontrada",
    );
  }
  if (atual.status !== statusEsperado) {
    return { erro: "A ordem não está no status esperado para esta ação" };
  }

  const { error } = await supabase
    .from(TABELA)
    .update({ status: novoStatus, ...extra })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "compras.ordens.transicionarStatus",
      error,
      "Não foi possível atualizar a ordem de compra. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Envia a OC de rascunho para aprovação. */
export async function enviarParaAprovacao(id: string): Promise<ResultadoAcao> {
  return transicionarStatus(id, "editar", "rascunho", "pendente_aprovacao", {
    motivo_rejeicao: null,
  });
}

/**
 * Aprova a OC via RPC, que gera o lançamento financeiro previsto. Repassa
 * a mensagem de erro do banco direto para o toast.
 */
export async function aprovarOrdem(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Sem permissão para aprovar ordens de compra" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Ordem de compra inválida" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_aprovar_ordem_compra", {
    p_oc_id: idValido.data,
  });

  if (error) {
    return erroAcao(
      "compras.ordens.aprovarOrdem",
      error,
      error.message || "Não foi possível aprovar a ordem de compra",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Registra o recebimento da OC aprovada via RPC: confirma a NF (nº, valor,
 * data), confirma o lançamento previsto -> a_pagar e gera as parcelas do
 * a_pagar pela condição de pagamento da OC (vencimento = data do
 * recebimento + dias_offset da parcela). Reusa a permissão 'aprovar', mesma
 * capacidade que já gera o lançamento previsto na aprovação.
 */
export async function registrarRecebimento(
  id: string,
  dados: RecebimentoInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("aprovar"))) {
    return {
      erro: "Sem permissão para registrar recebimento de ordens de compra",
    };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Ordem de compra inválida" };

  const validado = recebimentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_registrar_recebimento", {
    p_oc_id: idValido.data,
    p_numero_nf: validado.data.numeroNf,
    p_valor_nf: validado.data.valorNf,
    p_data_recebimento: validado.data.dataRecebimento,
  });

  if (error) {
    return erroAcao(
      "compras.ordens.registrarRecebimento",
      error,
      error.message || "Não foi possível registrar o recebimento",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Rejeita a OC pendente, com motivo registrado para a auditoria. */
export async function rejeitarOrdem(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  const motivoLimpo = motivo.trim();
  if (motivoLimpo === "") return { erro: "Informe o motivo da rejeição" };

  return transicionarStatus(id, "aprovar", "pendente_aprovacao", "rejeitado", {
    motivo_rejeicao: motivoLimpo,
  });
}

/**
 * Desaprova a OC via RPC: volta para pendente e cancela o lançamento
 * previsto. Erros de regra vêm da RPC com mensagem clara, repassada ao toast.
 */
export async function desaprovarOrdem(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("desaprovar"))) {
    return { erro: "Sem permissão para desaprovar ordens de compra" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Ordem de compra inválida" };

  const motivoLimpo = motivo.trim();
  if (motivoLimpo === "") return { erro: "Informe o motivo da desaprovação" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_desaprovar_ordem_compra", {
    p_oc_id: idValido.data,
    p_motivo: motivoLimpo,
  });

  if (error) {
    return erroAcao(
      "compras.ordens.desaprovarOrdem",
      error,
      error.message || "Não foi possível desaprovar a ordem de compra",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Cancela a OC via RPC: marca a ordem cancelada e cascateia o cancelamento
 * para o lançamento vinculado (origem='oc') e suas parcelas ainda não pagas
 * (bug #4 do QA: cancelar só a OC deixava o lançamento/parcela ativos e a
 * fila de aprovação de pagamentos, que lê `lancamento_parcelas`, mostrava
 * parcela órfã de OC cancelada). `lancamentos`/`lancamento_parcelas` só têm
 * grant de SELECT para `authenticated` — a cascata só é possível via RPC
 * security definer. Erros de regra vêm da RPC com mensagem clara, repassada
 * ao toast, no mesmo padrão de `desaprovarOrdem`.
 */
export async function cancelarOrdem(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para cancelar ordens de compra" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Ordem de compra inválida" };

  const motivoLimpo = motivo.trim();
  if (motivoLimpo === "") return { erro: "Informe o motivo do cancelamento" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_cancelar_ordem_compra", {
    p_oc_id: idValido.data,
    p_motivo: motivoLimpo,
  });

  if (error) {
    return erroAcao(
      "compras.ordens.cancelarOrdem",
      error,
      error.message ||
        "Não foi possível cancelar a ordem de compra. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Exclui a OC via RPC: a função checa a permissão, barra se houver
 * recebimento ou se o lançamento previsto tiver parcela paga/conciliada
 * (levanta exceção com mensagem amigável) e apaga a OC, os itens e o
 * lançamento previsto na mesma transação. A mensagem de erro do banco já
 * vem amigável, então é repassada direto ao toast.
 */
export async function excluirOrdemCompra(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("excluir"))) {
    return { erro: "Sem permissão para excluir ordens de compra" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Ordem de compra inválida" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_excluir_ordem_compra", {
    p_id: idValido.data,
  });

  if (error) {
    return erroAcao(
      "compras.ordens.excluirOrdemCompra",
      error,
      error.message ||
        "Não foi possível excluir a ordem de compra. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}
