import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { nomeFornecedor } from "@/modules/frete/pagamentos/queries";
import { paraNumeroDoBanco } from "@/modules/manutencao/servicos/formato";

/**
 * Leituras da aba Pedidos de material (`frete.pedidos-material`). Poucos pedidos por ano:
 * vêm inteiros com os itens (`todasAsLinhas`) e a tela filtra em memória, como a origem.
 */

export interface FornecedorOpcao {
  id: string;
  nome: string;
  nomes: string[];
}

/** Fornecedores ativos (a origem oferece `fornecedores.filter(ativo)`), com os dois nomes. */
export async function listarFornecedoresAtivos(): Promise<FornecedorOpcao[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("fornecedores")
      .select("id, razao_social, nome_fantasia")
      .eq("ativo", true)
      .order("razao_social")
      .order("id")
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar os fornecedores");
  return linhas
    .map((f) => ({
      id: f.id,
      nome: nomeFornecedor(f),
      nomes: [f.nome_fantasia ?? "", f.razao_social].filter((n) => n.trim() !== ""),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export interface InsumoOpcao {
  id: string;
  nome: string;
  unidade: string | null;
}

/** Insumos ativos (`insumosAtivos` da origem), com a sigla da unidade. */
export async function listarInsumosAtivos(): Promise<InsumoOpcao[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("insumos")
      .select("id, nome, unidades_medida(sigla)")
      .eq("ativo", true)
      .order("nome")
      .order("id")
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar os materiais");
  return linhas.map((i) => ({ id: i.id, nome: i.nome, unidade: i.unidades_medida?.sigla ?? null }));
}

export interface ItemPedidoLinha {
  insumoId: string;
  insumoNome: string;
  unidade: string | null;
  quantidade: number;
  valorUnitario: number;
}

export interface PedidoLinha {
  id: string;
  data: string;
  fornecedorId: string;
  fornecedorNome: string;
  observacoes: string | null;
  itens: ItemPedidoLinha[];
  /** Σ quantidade × valor unitário. */
  valorTotal: number;
  origem: string;
  criadoEm: string;
  atualizadoEm: string;
  excluidoEm: string | null;
  motivoExclusao: string | null;
}

/** Os lançados, ou (com `excluidos`) só os da lixeira. Itens na ordem gravada. */
export async function listarPedidos(excluidos = false): Promise<PedidoLinha[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("pedidos_material")
      .select(
        "id, data, fornecedor_id, observacoes, origem, created_at, updated_at, excluido_em, motivo_exclusao, fornecedores(razao_social, nome_fantasia), pedido_material_itens(ordem, insumo_id, quantidade, valor_unitario, insumos(nome, unidades_medida(sigla)))",
      )
      .filter("excluido_em", excluidos ? "not.is" : "is", null)
      .order("data", { ascending: false })
      .order("id")
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar os pedidos de material");

  return linhas.map((p) => {
    const itens = [...(p.pedido_material_itens ?? [])]
      .sort((a, b) => a.ordem - b.ordem)
      .map((i) => ({
        insumoId: i.insumo_id,
        insumoNome: i.insumos?.nome ?? "",
        unidade: i.insumos?.unidades_medida?.sigla ?? null,
        quantidade: paraNumeroDoBanco(i.quantidade),
        valorUnitario: paraNumeroDoBanco(i.valor_unitario),
      }));
    return {
      id: p.id,
      data: p.data,
      fornecedorId: p.fornecedor_id,
      fornecedorNome: nomeFornecedor(p.fornecedores),
      observacoes: p.observacoes,
      itens,
      valorTotal: itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0),
      origem: p.origem,
      criadoEm: p.created_at,
      atualizadoEm: p.updated_at,
      excluidoEm: p.excluido_em,
      motivoExclusao: p.motivo_exclusao,
    };
  });
}
