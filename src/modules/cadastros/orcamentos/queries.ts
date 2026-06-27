import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  StatusOrcamento,
  TipoItemOrcamento,
} from "@/modules/cadastros/orcamentos/schemas";

/** Linha da listagem de orçamentos, com o nome da obra e a contagem de itens. */
export interface OrcamentoLista {
  id: string;
  obraNome: string | null;
  numero: string | null;
  descricao: string | null;
  custoTotal: number;
  precoTotal: number;
  status: StatusOrcamento;
  totalItens: number;
}

/** Cabeçalho de um orçamento, com o nome da obra resolvido. */
export interface OrcamentoCabecalho {
  id: string;
  obraNome: string | null;
  numero: string | null;
  descricao: string | null;
  origem: string;
  custoTotal: number;
  bdi: number | null;
  precoTotal: number;
  status: StatusOrcamento;
  observacoes: string | null;
}

/** Item da árvore de um orçamento (etapa, subetapa ou item). */
export interface OrcamentoItem {
  id: string;
  parentId: string | null;
  tipo: TipoItemOrcamento;
  indice: string | null;
  codigo: string | null;
  descricao: string;
  unidade: string | null;
  quantidade: number | null;
  custoUnitario: number | null;
  custoTotal: number | null;
  bdi: number | null;
  precoUnitario: number | null;
  precoTotal: number | null;
  ordem: number;
}

/** Cabeçalho + itens de um orçamento, retornados juntos no detalhe. */
export interface OrcamentoDetalhe {
  cabecalho: OrcamentoCabecalho;
  itens: OrcamentoItem[];
}

/**
 * Lista todos os orçamentos com o nome da obra (join em obras) e a contagem
 * de itens (count na relação orcamento_itens). A RLS já filtra o que o usuário
 * pode ver.
 */
export async function listarOrcamentos(): Promise<OrcamentoLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orcamentos")
    .select(
      "id, numero, descricao, custo_total, preco_total, status, obras(nome), orcamento_itens(count)",
    )
    .order("numero");

  if (error) {
    throw new Error("Não foi possível carregar os orçamentos");
  }

  return (data ?? []).map((orcamento) => ({
    id: orcamento.id,
    obraNome: orcamento.obras?.nome ?? null,
    numero: orcamento.numero,
    descricao: orcamento.descricao,
    custoTotal: orcamento.custo_total,
    precoTotal: orcamento.preco_total,
    status: orcamento.status as StatusOrcamento,
    totalItens: orcamento.orcamento_itens?.[0]?.count ?? 0,
  }));
}

/**
 * Retorna o cabeçalho de um orçamento e a lista de itens (todos os campos),
 * ordenados por `ordem`. Retorna null quando o orçamento não existe (ou a RLS
 * o esconde).
 */
export async function obterOrcamento(
  id: string,
): Promise<OrcamentoDetalhe | null> {
  const supabase = await createClient();

  const { data: orcamento, error } = await supabase
    .from("orcamentos")
    .select(
      "id, numero, descricao, origem, custo_total, bdi, preco_total, status, observacoes, obras(nome)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error("Não foi possível carregar o orçamento");
  }

  if (!orcamento) return null;

  const { data: itens, error: erroItens } = await supabase
    .from("orcamento_itens")
    .select(
      "id, parent_id, tipo, indice, codigo, descricao, unidade, quantidade, custo_unitario, custo_total, bdi, preco_unitario, preco_total, ordem",
    )
    .eq("orcamento_id", id)
    .order("ordem");

  if (erroItens) {
    throw new Error("Não foi possível carregar os itens do orçamento");
  }

  return {
    cabecalho: {
      id: orcamento.id,
      obraNome: orcamento.obras?.nome ?? null,
      numero: orcamento.numero,
      descricao: orcamento.descricao,
      origem: orcamento.origem,
      custoTotal: orcamento.custo_total,
      bdi: orcamento.bdi,
      precoTotal: orcamento.preco_total,
      status: orcamento.status as StatusOrcamento,
      observacoes: orcamento.observacoes,
    },
    itens: (itens ?? []).map((item) => ({
      id: item.id,
      parentId: item.parent_id,
      tipo: item.tipo as TipoItemOrcamento,
      indice: item.indice,
      codigo: item.codigo,
      descricao: item.descricao,
      unidade: item.unidade,
      quantidade: item.quantidade,
      custoUnitario: item.custo_unitario,
      custoTotal: item.custo_total,
      bdi: item.bdi,
      precoUnitario: item.preco_unitario,
      precoTotal: item.preco_total,
      ordem: item.ordem,
    })),
  };
}
