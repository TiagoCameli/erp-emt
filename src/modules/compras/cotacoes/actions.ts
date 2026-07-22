"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Acao } from "@/config/recursos";
import { erroAcao } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  cotacaoSchema,
  fornecedorCotacaoSchema,
  salvarPrecosSchema,
  type CotacaoInput,
  type FornecedorCotacaoInput,
  type SalvarPrecosInput,
} from "@/modules/compras/cotacoes/schemas";

const RECURSO = "compras.cotacoes" as const;
const ROTA = "/compras/cotacoes";
const TABELA = "cotacoes" as const;

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoCriacao = { ok: true; id: string } | { erro: string };

const uuidSchema = z.uuid();

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
 * Garante que a cotação está aberta antes de qualquer mutação de itens,
 * fornecedores ou cabeçalho. Cotação finalizada ou cancelada é imutável.
 */
async function exigirAberta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cotacaoId: string,
): Promise<{ ok: true } | { erro: string }> {
  const { data, error } = await supabase
    .from(TABELA)
    .select("status")
    .eq("id", cotacaoId)
    .maybeSingle();

  if (error || !data) {
    return erroAcao(
      "compras.cotacoes.exigirAberta",
      error,
      "Cotação não encontrada",
    );
  }
  if (data.status !== "aberta") {
    return { erro: "Só dá para alterar uma cotação aberta" };
  }
  return { ok: true };
}

/**
 * Cria uma cotação aberta avulsa. Grava só o cabeçalho (observações): os
 * insumos a cotar entram pelo mapa do detalhe, já que cotacao_itens exige um
 * fornecedor. RLS cobre o insert.
 */
export async function criarCotacao(
  dados: CotacaoInput,
): Promise<ResultadoCriacao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para criar cotações" };
  }

  const validado = cotacaoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();

  const { data: cotacao, error } = await supabase
    .from(TABELA)
    .insert({
      observacoes: validado.data.observacoes ?? null,
      status: "aberta",
    })
    .select("id")
    .single();

  if (error || !cotacao) {
    return erroAcao(
      "compras.cotacoes.criarCotacao",
      error,
      "Não foi possível criar a cotação. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true, id: cotacao.id };
}

/** Edita o cabeçalho da cotação (observações). Só com a cotação aberta. */
export async function editarCotacao(
  id: string,
  dados: CotacaoInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar cotações" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Cotação inválida" };

  const validado = cotacaoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();

  const aberta = await exigirAberta(supabase, idValido.data);
  if ("erro" in aberta) return aberta;

  const { error } = await supabase
    .from(TABELA)
    .update({
      observacoes: validado.data.observacoes ?? null,
    })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "compras.cotacoes.editarCotacao",
      error,
      "Não foi possível salvar a cotação. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Adiciona um fornecedor à cotação aberta. RLS cobre o insert. */
export async function adicionarFornecedor(
  cotacaoId: string,
  dados: FornecedorCotacaoInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar cotações" };
  }

  const idValido = uuidSchema.safeParse(cotacaoId);
  if (!idValido.success) return { erro: "Cotação inválida" };

  const validado = fornecedorCotacaoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();

  const aberta = await exigirAberta(supabase, idValido.data);
  if ("erro" in aberta) return aberta;

  // Mesmo fornecedor não pode entrar duas vezes na mesma cotação.
  const { data: existente } = await supabase
    .from("cotacao_fornecedores")
    .select("id")
    .eq("cotacao_id", idValido.data)
    .eq("fornecedor_id", validado.data.fornecedorId)
    .maybeSingle();

  if (existente) {
    return { erro: "Esse fornecedor já está na cotação" };
  }

  const { error } = await supabase.from("cotacao_fornecedores").insert({
    cotacao_id: idValido.data,
    fornecedor_id: validado.data.fornecedorId,
    condicao_pagamento: validado.data.condicaoPagamento ?? null,
    prazo_entrega_dias: validado.data.prazoEntregaDias ?? null,
    observacao: validado.data.observacao ?? null,
  });

  if (error) {
    return erroAcao(
      "compras.cotacoes.adicionarFornecedor",
      error,
      "Não foi possível adicionar o fornecedor. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Remove um fornecedor da cotação aberta. Os preços dele (cotacao_itens) caem
 * junto pelo cascade da FK. RLS cobre o delete.
 */
export async function removerFornecedor(
  cotacaoFornecedorId: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar cotações" };
  }

  const idValido = uuidSchema.safeParse(cotacaoFornecedorId);
  if (!idValido.success) return { erro: "Fornecedor da cotação inválido" };

  const supabase = await createClient();

  const { data: vinculo } = await supabase
    .from("cotacao_fornecedores")
    .select("cotacao_id")
    .eq("id", idValido.data)
    .maybeSingle();

  if (!vinculo) return { erro: "Fornecedor da cotação não encontrado" };

  const aberta = await exigirAberta(supabase, vinculo.cotacao_id);
  if ("erro" in aberta) return aberta;

  const { error } = await supabase
    .from("cotacao_fornecedores")
    .delete()
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "compras.cotacoes.removerFornecedor",
      error,
      "Não foi possível remover o fornecedor. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Salva o mapa de preços inteiro: apaga os cotacao_itens da cotação e reinsere
 * os preços informados. Garante que cada fornecedor e cada quantidade venham do
 * próprio mapa e que tudo pertença à cotação aberta. RLS cobre delete e insert.
 */
export async function salvarPrecos(
  cotacaoId: string,
  precos: SalvarPrecosInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar cotações" };
  }

  const idValido = uuidSchema.safeParse(cotacaoId);
  if (!idValido.success) return { erro: "Cotação inválida" };

  const validado = salvarPrecosSchema.safeParse(precos);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Preços inválidos" };
  }

  const supabase = await createClient();

  const aberta = await exigirAberta(supabase, idValido.data);
  if ("erro" in aberta) return aberta;

  // Só aceita fornecedores que pertencem mesmo a esta cotação.
  const { data: vinculos, error: erroVinculos } = await supabase
    .from("cotacao_fornecedores")
    .select("id")
    .eq("cotacao_id", idValido.data);

  if (erroVinculos) {
    return erroAcao(
      "compras.cotacoes.salvarPrecos",
      erroVinculos,
      "Não foi possível validar os fornecedores da cotação",
    );
  }

  const idsValidos = new Set((vinculos ?? []).map((vinculo) => vinculo.id));
  for (const preco of validado.data) {
    if (!idsValidos.has(preco.cotacaoFornecedorId)) {
      return { erro: "Há um fornecedor que não pertence a esta cotação" };
    }
  }

  // Sem transação no supabase-js, guardamos os preços antigos antes de apagar
  // e os restauramos se o insert falhar, para não perder o mapa já lançado.
  const { data: precosAntigos } = await supabase
    .from("cotacao_itens")
    .select(
      "cotacao_id, cotacao_fornecedor_id, insumo_id, quantidade, preco_unitario",
    )
    .eq("cotacao_id", idValido.data);

  const { error: erroDelete } = await supabase
    .from("cotacao_itens")
    .delete()
    .eq("cotacao_id", idValido.data);

  if (erroDelete) {
    return erroAcao(
      "compras.cotacoes.salvarPrecos",
      erroDelete,
      "Não foi possível salvar os preços. Tente novamente",
    );
  }

  if (validado.data.length > 0) {
    const { error: erroInsert } = await supabase.from("cotacao_itens").insert(
      validado.data.map((preco) => ({
        cotacao_id: idValido.data,
        cotacao_fornecedor_id: preco.cotacaoFornecedorId,
        insumo_id: preco.insumoId,
        quantidade: preco.quantidade,
        preco_unitario: preco.precoUnitario,
      })),
    );

    if (erroInsert) {
      // Restaura os preços anteriores para não esvaziar o mapa da cotação.
      if (precosAntigos && precosAntigos.length > 0) {
        await supabase.from("cotacao_itens").insert(precosAntigos);
      }
      return erroAcao(
        "compras.cotacoes.salvarPrecos",
        erroInsert,
        "Não foi possível salvar os preços. Tente novamente",
      );
    }
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Finaliza a cotação escolhendo o fornecedor vencedor. Se o vencedor não for o
 * de menor total cotado, o motivo da seleção passa a ser obrigatório (decisão
 * fora do menor preço precisa ser justificada). RLS cobre o update.
 */
export async function finalizarCotacao(
  id: string,
  vencedorFornecedorId: string,
  motivo: string | undefined,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para finalizar cotações" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Cotação inválida" };

  const vencedorValido = uuidSchema.safeParse(vencedorFornecedorId);
  if (!vencedorValido.success) {
    return { erro: "Selecione o fornecedor vencedor" };
  }

  const supabase = await createClient();

  const aberta = await exigirAberta(supabase, idValido.data);
  if ("erro" in aberta) return aberta;

  // O vencedor precisa ser um fornecedor da cotação. O front manda o id da
  // LINHA (cotacao_fornecedores.id), que é o que a validação e os totais usam;
  // mas a coluna vencedor_fornecedor_id tem FK para fornecedores.id, então na
  // gravação resolvemos a linha para o fornecedor_id dela.
  const { data: fornecedores, error: erroFornecedores } = await supabase
    .from("cotacao_fornecedores")
    .select("id, fornecedor_id")
    .eq("cotacao_id", idValido.data);

  if (erroFornecedores) {
    return erroAcao(
      "compras.cotacoes.finalizarCotacao",
      erroFornecedores,
      "Não foi possível validar os fornecedores da cotação",
    );
  }

  const participanteVencedor = (fornecedores ?? []).find(
    (f) => f.id === vencedorValido.data,
  );
  if (!participanteVencedor) {
    return { erro: "O vencedor precisa ser um fornecedor da cotação" };
  }

  // Total cotado por fornecedor, para checar se o vencedor é o menor preço.
  const { data: itens, error: erroItens } = await supabase
    .from("cotacao_itens")
    .select("cotacao_fornecedor_id, quantidade, preco_unitario")
    .eq("cotacao_id", idValido.data);

  if (erroItens) {
    return erroAcao(
      "compras.cotacoes.finalizarCotacao",
      erroItens,
      "Não foi possível calcular os totais da cotação",
    );
  }

  const totalPorFornecedor = new Map<string, number>();
  for (const item of itens ?? []) {
    totalPorFornecedor.set(
      item.cotacao_fornecedor_id,
      (totalPorFornecedor.get(item.cotacao_fornecedor_id) ?? 0) +
        item.quantidade * item.preco_unitario,
    );
  }

  const totalVencedor = totalPorFornecedor.get(vencedorValido.data) ?? 0;
  if (totalVencedor <= 0) {
    return { erro: "Lance os preços do fornecedor vencedor antes de finalizar" };
  }

  let menorTotal = Number.POSITIVE_INFINITY;
  for (const total of totalPorFornecedor.values()) {
    if (total > 0 && total < menorTotal) menorTotal = total;
  }

  const motivoLimpo = motivo?.trim() ?? "";
  const ehMenorTotal = totalVencedor <= menorTotal;
  if (!ehMenorTotal && motivoLimpo.length === 0) {
    return {
      erro: "O vencedor não é o de menor total. Justifique a escolha no motivo",
    };
  }

  const { error } = await supabase
    .from(TABELA)
    .update({
      status: "finalizada",
      vencedor_fornecedor_id: participanteVencedor.fornecedor_id,
      motivo_selecao: motivoLimpo.length > 0 ? motivoLimpo : null,
    })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "compras.cotacoes.finalizarCotacao",
      error,
      "Não foi possível finalizar a cotação. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Cancela a cotação aberta, guardando o motivo nas observações de seleção. */
export async function cancelarCotacao(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para cancelar cotações" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Cotação inválida" };

  const motivoLimpo = motivo.trim();
  if (motivoLimpo.length === 0) {
    return { erro: "Informe o motivo do cancelamento" };
  }

  const supabase = await createClient();

  const aberta = await exigirAberta(supabase, idValido.data);
  if ("erro" in aberta) return aberta;

  const { error } = await supabase
    .from(TABELA)
    .update({ status: "cancelada", motivo_selecao: motivoLimpo })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "compras.cotacoes.cancelarCotacao",
      error,
      "Não foi possível cancelar a cotação. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}
