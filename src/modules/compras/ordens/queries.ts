import "server-only";

import {
  eventosDoAuditLog,
  type EventoTrilha,
  type RegistroAuditLog,
} from "@/components/canonicos";
import { createClient } from "@/lib/supabase/server";
import { resolverNomesAuditLog } from "@/lib/trilha-nomes";
import type { StatusOC } from "@/modules/compras/_shared/formato";
import {
  idsFornecedoresPorNome,
  padraoBusca,
} from "@/modules/compras/_shared/lista";

/** Filtros e paginação da listagem de ordens de compra. */
export interface ListarOrdensParams {
  pagina: number;
  tamanho: number;
  status?: StatusOC;
  busca?: string;
}

/** Linha da listagem de ordens de compra. */
export interface OrdemLista {
  id: string;
  numero: string | null;
  fornecedorNome: string;
  valorTotal: number;
  status: string;
  dataEmissao: string;
}

/** Resultado paginado da listagem de ordens de compra. */
export interface OrdensPagina {
  itens: OrdemLista[];
  total: number;
}

/** Item de uma OC, com os nomes resolvidos via join. */
export interface OrdemItem {
  id: string;
  insumoId: string;
  insumoNome: string;
  unidade: string | null;
  quantidade: number;
  precoUnitario: number;
  subtotal: number;
  centroCustoId: string;
  centroCustoNome: string;
}

/** Lançamento financeiro vinculado à OC (origem='oc'). Read-only nas telas. */
export interface LancamentoVinculado {
  id: string;
  status: string;
  valor: number;
  dataVencimento: string | null;
}

/** OC completa para a tela de detalhe. */
export interface OrdemDetalhe {
  id: string;
  numero: string | null;
  fornecedorId: string;
  fornecedorNome: string;
  condicaoPagamentoId: string | null;
  condicaoPagamentoDescricao: string | null;
  cotacaoId: string | null;
  cotacaoNumero: string | null;
  valorTotal: number;
  status: string;
  motivoRejeicao: string | null;
  dataEmissao: string;
  observacoes: string | null;
  itens: OrdemItem[];
  lancamento: LancamentoVinculado | null;
}

/** Opção de fornecedor para o select. */
export interface FornecedorOpcao {
  id: string;
  nome: string;
}

/** Opção de insumo para o select, com a unidade para exibir na linha. */
export interface InsumoOpcao {
  id: string;
  nome: string;
  unidade: string | null;
}

/** Opção de centro de custo para o select. */
export interface CentroCustoOpcao {
  id: string;
  nome: string;
  codigo: string | null;
}

/** Opção de cotação finalizada para vincular à OC. */
export interface CotacaoOpcao {
  id: string;
  numero: string | null;
}

/** Opção de condição de pagamento ativa para o select da OC. */
export interface CondicaoPagamentoOpcao {
  id: string;
  descricao: string;
}

/** Parcela de uma condição de pagamento, para a prévia do recebimento. */
export interface ParcelaCondicaoOpcao {
  diasOffset: number;
  percentual: number;
}

/** Nome de exibição do fornecedor: fantasia quando existe, senão razão social. */
function nomeFornecedor(fornecedor: {
  razao_social: string;
  nome_fantasia: string | null;
}): string {
  return fornecedor.nome_fantasia ?? fornecedor.razao_social;
}

/**
 * Lista as ordens de compra com paginação server-side (range + count exact) e
 * o nome do fornecedor resolvido (join). Aceita filtro por status e busca por
 * número da OC ou nome do fornecedor. O valor_total vem do banco (trigger),
 * nunca recalculado no app.
 */
export async function listarOrdens(
  params: ListarOrdensParams,
): Promise<OrdensPagina> {
  const supabase = await createClient();

  const pagina = Math.max(0, params.pagina);
  const tamanho = Math.max(1, params.tamanho);
  const de = pagina * tamanho;
  const ate = de + tamanho - 1;

  let consulta = supabase
    .from("ordens_compra")
    .select(
      "id, numero, valor_total, status, data_emissao, fornecedores(razao_social, nome_fantasia)",
      { count: "exact" },
    )
    .order("data_emissao", { ascending: false })
    .order("created_at", { ascending: false })
    .range(de, ate);

  if (params.status) consulta = consulta.eq("status", params.status);

  if (params.busca) {
    const padrao = padraoBusca(params.busca);
    const idsFornecedores = await idsFornecedoresPorNome(supabase, padrao);
    const clausulas = [`numero.ilike.${padrao}`];
    if (idsFornecedores.length > 0) {
      clausulas.push(`fornecedor_id.in.(${idsFornecedores.join(",")})`);
    }
    consulta = consulta.or(clausulas.join(","));
  }

  const { data, error, count } = await consulta;

  if (error) {
    throw new Error("Não foi possível carregar as ordens de compra");
  }

  const itens: OrdemLista[] = (data ?? []).map((ordem) => ({
    id: ordem.id,
    numero: ordem.numero,
    fornecedorNome: ordem.fornecedores
      ? nomeFornecedor(ordem.fornecedores)
      : "-",
    valorTotal: ordem.valor_total,
    status: ordem.status,
    dataEmissao: ordem.data_emissao,
  }));

  return { itens, total: count ?? 0 };
}

/**
 * OC completa para o detalhe: dados, itens com nomes resolvidos e o
 * lançamento financeiro vinculado (origem='oc'). Retorna null se não achar.
 */
export async function buscarOrdem(id: string): Promise<OrdemDetalhe | null> {
  const supabase = await createClient();

  const { data: ordem, error } = await supabase
    .from("ordens_compra")
    .select(
      `id, numero, fornecedor_id, condicao_pagamento_id, cotacao_id,
       valor_total, status, motivo_rejeicao, data_emissao, observacoes,
       fornecedores(razao_social, nome_fantasia),
       cotacoes(numero),
       condicoes_pagamento(descricao),
       oc_itens(
         id, insumo_id, quantidade, preco_unitario, centro_custo_id,
         insumos(nome, unidades_medida(sigla)),
         centros_custo(nome, codigo)
       )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !ordem) return null;

  const { data: lancamento } = await supabase
    .from("lancamentos")
    .select("id, status, valor, data_vencimento")
    .eq("origem", "oc")
    .eq("origem_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const itens: OrdemItem[] = (ordem.oc_itens ?? []).map((item) => ({
    id: item.id,
    insumoId: item.insumo_id,
    insumoNome: item.insumos?.nome ?? "-",
    unidade: item.insumos?.unidades_medida?.sigla ?? null,
    quantidade: item.quantidade,
    precoUnitario: item.preco_unitario,
    subtotal: item.quantidade * item.preco_unitario,
    centroCustoId: item.centro_custo_id,
    centroCustoNome: item.centros_custo?.nome ?? "-",
  }));

  return {
    id: ordem.id,
    numero: ordem.numero,
    fornecedorId: ordem.fornecedor_id,
    fornecedorNome: ordem.fornecedores
      ? nomeFornecedor(ordem.fornecedores)
      : "-",
    condicaoPagamentoId: ordem.condicao_pagamento_id,
    condicaoPagamentoDescricao: ordem.condicoes_pagamento?.descricao ?? null,
    cotacaoId: ordem.cotacao_id,
    cotacaoNumero: ordem.cotacoes?.numero ?? null,
    valorTotal: ordem.valor_total,
    status: ordem.status,
    motivoRejeicao: ordem.motivo_rejeicao,
    dataEmissao: ordem.data_emissao,
    observacoes: ordem.observacoes,
    itens,
    lancamento: lancamento
      ? {
          id: lancamento.id,
          status: lancamento.status,
          valor: lancamento.valor,
          dataVencimento: lancamento.data_vencimento,
        }
      : null,
  };
}

/** Fornecedores ativos para o select da OC, em ordem alfabética. */
export async function listarFornecedores(): Promise<FornecedorOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("fornecedores")
    .select("id, razao_social, nome_fantasia")
    .eq("ativo", true)
    .order("razao_social");

  if (error) {
    throw new Error("Não foi possível carregar os fornecedores");
  }

  return (data ?? []).map((fornecedor) => ({
    id: fornecedor.id,
    nome: nomeFornecedor(fornecedor),
  }));
}

/** Insumos ativos para o select dos itens, com a sigla da unidade. */
export async function listarInsumos(): Promise<InsumoOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("insumos")
    .select("id, nome, unidades_medida(sigla)")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os insumos");
  }

  return (data ?? []).map((insumo) => ({
    id: insumo.id,
    nome: insumo.nome,
    unidade: insumo.unidades_medida?.sigla ?? null,
  }));
}

/** Centros de custo ativos para o select dos itens, em ordem de código. */
export async function listarCentrosCusto(): Promise<CentroCustoOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("centros_custo")
    .select("id, nome, codigo")
    .eq("ativo", true)
    .order("codigo", { ascending: true, nullsFirst: false })
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os centros de custo");
  }

  return (data ?? []).map((centro) => ({
    id: centro.id,
    nome: centro.nome,
    codigo: centro.codigo,
  }));
}

/** Condições de pagamento ativas para o select da OC, em ordem alfabética. */
export async function listarCondicoesPagamento(): Promise<
  CondicaoPagamentoOpcao[]
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("condicoes_pagamento")
    .select("id, descricao")
    .eq("ativo", true)
    .order("descricao", { ascending: true });

  if (error) {
    throw new Error("Não foi possível carregar as condições de pagamento");
  }

  return (data ?? []).map((condicao) => ({
    id: condicao.id,
    descricao: condicao.descricao,
  }));
}

/**
 * Parcelas de uma condição de pagamento (dias + percentual), em ordem de
 * vencimento. Usada na prévia do diálogo de recebimento: as mesmas
 * dias_offset/percentual que fn_registrar_recebimento usa pra gerar as
 * lancamento_parcelas.
 */
export async function listarParcelasCondicao(
  condicaoPagamentoId: string,
): Promise<ParcelaCondicaoOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("condicao_parcelas")
    .select("dias_offset, percentual")
    .eq("condicao_id", condicaoPagamentoId)
    .order("numero", { ascending: true });

  if (error) {
    throw new Error(
      "Não foi possível carregar as parcelas da condição de pagamento",
    );
  }

  return (data ?? []).map((parcela) => ({
    diasOffset: parcela.dias_offset,
    percentual: parcela.percentual,
  }));
}

/** Cotações finalizadas para vincular à OC, mais recentes primeiro. */
export async function listarCotacoesFinalizadas(): Promise<CotacaoOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cotacoes")
    .select("id, numero")
    .eq("status", "finalizada")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Não foi possível carregar as cotações");
  }

  return (data ?? []).map((cotacao) => ({
    id: cotacao.id,
    numero: cotacao.numero,
  }));
}

/**
 * Trilha de auditoria da OC: lê o audit_log só da própria ordem (cabeçalho),
 * sem os itens, pra não duplicar "Ordem criada" por item, e resolve os nomes
 * dos usuários via RPC (security definer), igual à tela de auditoria.
 * Converte para eventos do componente Trilha.
 */
export async function trilhaOrdem(id: string): Promise<EventoTrilha[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("audit_log")
    .select(
      "id, tabela, registro_id, acao, usuario_id, dados_antes, dados_depois, criado_em",
    )
    .eq("tabela", "ordens_compra")
    .eq("registro_id", id)
    .order("criado_em", { ascending: false })
    .order("id", { ascending: false });

  if (error || !data) return [];

  const idsUsuarios = [
    ...new Set(
      data
        .map((linha) => linha.usuario_id)
        .filter((usuarioId): usuarioId is string => usuarioId !== null),
    ),
  ];

  const nomesPorId = new Map<string, string>();
  if (idsUsuarios.length > 0) {
    const { data: usuarios } = await supabase.rpc(
      "nomes_usuarios_auditoria",
      { p_ids: idsUsuarios },
    );
    for (const usuario of usuarios ?? []) {
      nomesPorId.set(usuario.id, usuario.nome);
    }
  }

  const registros: RegistroAuditLog[] = data.map((linha) => ({
    id: linha.id,
    tabela: linha.tabela,
    registro_id: linha.registro_id,
    acao: linha.acao,
    usuario_id: linha.usuario_id,
    usuario_nome:
      linha.usuario_id === null
        ? "Sistema"
        : (nomesPorId.get(linha.usuario_id) ?? "Sistema"),
    dados_antes: linha.dados_antes,
    dados_depois: linha.dados_depois,
    criado_em: linha.criado_em,
  }));

  const nomes = await resolverNomesAuditLog(supabase, registros);
  return eventosDoAuditLog(registros, { nomes, entidade: "Ordem", genero: "f" });
}
