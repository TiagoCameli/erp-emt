import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Linha da listagem de planilhas contratuais (uma por obra). */
export interface PlanilhaLista {
  id: string;
  nome: string;
  observacao: string | null;
  ativo: boolean;
  obraId: string;
  obraNome: string;
  obraLote: string | null;
  /** Quantidade de itens contratuais na planilha. */
  totalItens: number;
  /** Soma de quantidade_contratada * preco_unitario de todos os itens. */
  valorContratual: number;
}

/** Item contratual com unidade, medido acumulado, saldo e valor. */
export interface ItemLista {
  id: string;
  codigo: string | null;
  descricao: string;
  unidadeId: string | null;
  unidadeSigla: string | null;
  quantidadeContratada: number;
  precoUnitario: number;
  ordem: number;
  /** Soma das quantidades medidas em medições aprovadas. */
  medidoAcumulado: number;
  /** quantidade_contratada - medidoAcumulado. */
  saldo: number;
  /** quantidade_contratada * preco_unitario. */
  valor: number;
}

/** Cabeçalho da planilha de uma obra, sem os itens. */
export interface PlanilhaCabecalho {
  id: string;
  nome: string;
  observacao: string | null;
  ativo: boolean;
  obraId: string;
  obraNome: string;
  obraLote: string | null;
}

interface PlanilhaRow {
  id: string;
  nome: string;
  observacao: string | null;
  ativo: boolean;
  obra_id: string;
  obras: { nome: string; lote: string | null } | null;
}

/**
 * Lista todas as planilhas contratuais, com a obra (nome e lote), a contagem
 * de itens e o valor contratual total. Faz uma só busca dos itens e agrega em
 * memória, sem N+1.
 */
export async function listarPlanilhas(): Promise<PlanilhaLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("planilhas_contratuais")
    .select("id, nome, observacao, ativo, obra_id, obras(nome, lote)")
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as planilhas contratuais");
  }

  const planilhas = (data ?? []) as PlanilhaRow[];

  const { data: itens, error: erroItens } = await supabase
    .from("planilha_itens")
    .select("planilha_id, quantidade_contratada, preco_unitario");

  if (erroItens) {
    throw new Error("Não foi possível carregar os itens das planilhas");
  }

  const totalPorPlanilha = new Map<string, number>();
  const valorPorPlanilha = new Map<string, number>();
  for (const item of itens ?? []) {
    totalPorPlanilha.set(
      item.planilha_id,
      (totalPorPlanilha.get(item.planilha_id) ?? 0) + 1,
    );
    valorPorPlanilha.set(
      item.planilha_id,
      (valorPorPlanilha.get(item.planilha_id) ?? 0) +
        item.quantidade_contratada * item.preco_unitario,
    );
  }

  return planilhas.map((planilha) => ({
    id: planilha.id,
    nome: planilha.nome,
    observacao: planilha.observacao,
    ativo: planilha.ativo,
    obraId: planilha.obra_id,
    obraNome: planilha.obras?.nome ?? "Obra removida",
    obraLote: planilha.obras?.lote ?? null,
    totalItens: totalPorPlanilha.get(planilha.id) ?? 0,
    valorContratual: valorPorPlanilha.get(planilha.id) ?? 0,
  }));
}

/** Busca o cabeçalho da planilha de uma planilha pelo id. */
export async function buscarPlanilha(
  planilhaId: string,
): Promise<PlanilhaCabecalho | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("planilhas_contratuais")
    .select("id, nome, observacao, ativo, obra_id, obras(nome, lote)")
    .eq("id", planilhaId)
    .maybeSingle();

  if (error) {
    throw new Error("Não foi possível carregar a planilha contratual");
  }
  if (!data) return null;

  const planilha = data as PlanilhaRow;
  return {
    id: planilha.id,
    nome: planilha.nome,
    observacao: planilha.observacao,
    ativo: planilha.ativo,
    obraId: planilha.obra_id,
    obraNome: planilha.obras?.nome ?? "Obra removida",
    obraLote: planilha.obras?.lote ?? null,
  };
}

interface ItemRow {
  id: string;
  codigo: string | null;
  descricao: string;
  unidade_id: string | null;
  quantidade_contratada: number;
  preco_unitario: number;
  ordem: number;
  unidades_medida: { sigla: string } | null;
}

/**
 * Lista os itens de uma planilha, com a unidade (sigla), o acumulado medido em
 * medições aprovadas, o saldo (contratada - medido) e o valor (contratada *
 * preço). O medido é agregado por item num Map, sem N+1.
 */
export async function listarItens(planilhaId: string): Promise<ItemLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("planilha_itens")
    .select(
      "id, codigo, descricao, unidade_id, quantidade_contratada, preco_unitario, ordem, unidades_medida(sigla)",
    )
    .eq("planilha_id", planilhaId)
    .order("ordem")
    .order("created_at");

  if (error) {
    throw new Error("Não foi possível carregar os itens da planilha");
  }

  const itens = (data ?? []) as ItemRow[];
  if (itens.length === 0) return [];

  // Acumulado medido por item: soma das quantidades de medicao_itens cujas
  // medições estão aprovadas. Uma busca só, agregada em memória.
  const idsItens = itens.map((item) => item.id);
  const { data: medidos, error: erroMedidos } = await supabase
    .from("medicao_itens")
    .select("planilha_item_id, quantidade, medicoes!inner(status)")
    .in("planilha_item_id", idsItens)
    .eq("medicoes.status", "aprovada");

  if (erroMedidos) {
    throw new Error("Não foi possível carregar o medido acumulado");
  }

  const medidoPorItem = new Map<string, number>();
  for (const medido of medidos ?? []) {
    medidoPorItem.set(
      medido.planilha_item_id,
      (medidoPorItem.get(medido.planilha_item_id) ?? 0) + medido.quantidade,
    );
  }

  return itens.map((item) => {
    const medidoAcumulado = medidoPorItem.get(item.id) ?? 0;
    return {
      id: item.id,
      codigo: item.codigo,
      descricao: item.descricao,
      unidadeId: item.unidade_id,
      unidadeSigla: item.unidades_medida?.sigla ?? null,
      quantidadeContratada: item.quantidade_contratada,
      precoUnitario: item.preco_unitario,
      ordem: item.ordem,
      medidoAcumulado,
      saldo: item.quantidade_contratada - medidoAcumulado,
      valor: item.quantidade_contratada * item.preco_unitario,
    };
  });
}
