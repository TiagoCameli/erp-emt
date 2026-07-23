import "server-only";

import {
  eventosDoAuditLog,
  type EventoTrilha,
  type RegistroAuditLog,
} from "@/components/canonicos";
import { createClient } from "@/lib/supabase/server";
import { resolverNomesAuditLog } from "@/lib/trilha-nomes";
import type {
  StatusLancamento,
  StatusParcela,
  TipoLancamento,
} from "@/modules/financeiro/_shared/formato";

/** Filtros e paginação da listagem de lançamentos. */
export interface ListarLancamentosParams {
  pagina: number;
  tamanho: number;
  tipo?: TipoLancamento;
  status?: StatusLancamento;
}

/** Linha da listagem de lançamentos. */
export interface LancamentoLista {
  id: string;
  numero: string | null;
  tipo: TipoLancamento;
  origem: string;
  descricao: string;
  categoriaNome: string | null;
  fornecedorNome: string | null;
  valor: number;
  dataVencimento: string | null;
  status: StatusLancamento;
  qtdParcelas: number;
}

/** Resultado paginado da listagem. */
export interface LancamentosPagina {
  itens: LancamentoLista[];
  total: number;
}

/** Parcela do lançamento, com o nome da conta resolvido. */
export interface ParcelaLancamento {
  id: string;
  numeroParcela: number;
  valor: number;
  dataVencimento: string | null;
  status: StatusParcela;
  contaBancariaId: string | null;
  contaBancariaNome: string | null;
  dataPagamento: string | null;
}

/** Rateio do lançamento, com o nome do centro de custo resolvido. */
export interface RateioLancamento {
  id: string;
  centroCustoId: string;
  centroCustoNome: string;
  centroCustoCodigo: string | null;
  valor: number;
}

/** Lançamento completo para o detalhe e a edição. */
export interface LancamentoDetalhe {
  id: string;
  numero: string | null;
  tipo: TipoLancamento;
  origem: string;
  origemId: string | null;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  categoriaId: string | null;
  categoriaNome: string | null;
  descricao: string;
  valor: number;
  status: StatusLancamento;
  competencia: string | null;
  dataEmissao: string;
  dataVencimento: string | null;
  parcelas: ParcelaLancamento[];
  rateios: RateioLancamento[];
}

/** Opção de categoria financeira para o select. */
export interface CategoriaOpcao {
  id: string;
  nome: string;
  tipo: string;
}

/** Opção de fornecedor para o select. */
export interface FornecedorOpcao {
  id: string;
  nome: string;
}

/** Opção de centro de custo para o select do rateio. */
export interface CentroCustoOpcao {
  id: string;
  nome: string;
  codigo: string | null;
}

/** Nome de exibição do fornecedor: fantasia quando existe, senão razão social. */
function nomeFornecedor(fornecedor: {
  razao_social: string;
  nome_fantasia: string | null;
}): string {
  return fornecedor.nome_fantasia ?? fornecedor.razao_social;
}

/**
 * Lista os lançamentos com paginação server-side (count exato), o nome da
 * categoria e do fornecedor resolvidos e a contagem de parcelas. Aceita
 * filtro por tipo e por status.
 */
export async function listarLancamentos(
  params: ListarLancamentosParams,
): Promise<LancamentosPagina> {
  const supabase = await createClient();

  const pagina = Math.max(0, params.pagina);
  const tamanho = Math.max(1, params.tamanho);
  const de = pagina * tamanho;
  const ate = de + tamanho - 1;

  let consulta = supabase
    .from("lancamentos")
    .select(
      `id, numero, tipo, origem, descricao, valor, data_vencimento, status,
       categorias_financeiras(nome),
       fornecedores(razao_social, nome_fantasia),
       lancamento_parcelas(count)`,
      { count: "exact" },
    )
    .order("data_emissao", { ascending: false })
    .order("created_at", { ascending: false })
    .range(de, ate);

  if (params.tipo) consulta = consulta.eq("tipo", params.tipo);
  if (params.status) consulta = consulta.eq("status", params.status);

  const { data, error, count } = await consulta;

  if (error) {
    throw new Error("Não foi possível carregar os lançamentos");
  }

  const itens: LancamentoLista[] = (data ?? []).map((lancamento) => {
    const parcelas = lancamento.lancamento_parcelas as
      | { count: number }[]
      | null;
    return {
      id: lancamento.id,
      numero: lancamento.numero,
      tipo: lancamento.tipo as TipoLancamento,
      origem: lancamento.origem,
      descricao: lancamento.descricao,
      categoriaNome: lancamento.categorias_financeiras?.nome ?? null,
      fornecedorNome: lancamento.fornecedores
        ? nomeFornecedor(lancamento.fornecedores)
        : null,
      valor: lancamento.valor,
      dataVencimento: lancamento.data_vencimento,
      status: lancamento.status as StatusLancamento,
      qtdParcelas: parcelas?.[0]?.count ?? 0,
    };
  });

  return { itens, total: count ?? 0 };
}

/**
 * Lançamento completo para o detalhe: cabeçalho com nomes resolvidos, parcelas
 * ordenadas (com o nome da conta) e rateios (com o nome do centro de custo).
 * Retorna null se não encontrar.
 */
export async function buscarLancamento(
  id: string,
): Promise<LancamentoDetalhe | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lancamentos")
    .select(
      `id, numero, tipo, origem, origem_id, fornecedor_id, categoria_id,
       descricao, valor, status, competencia, data_emissao, data_vencimento,
       categorias_financeiras(nome),
       fornecedores(razao_social, nome_fantasia),
       lancamento_parcelas(
         id, numero_parcela, valor, data_vencimento, status,
         conta_bancaria_id, data_pagamento,
         contas_bancarias(nome)
       ),
       lancamento_rateios(
         id, centro_custo_id, valor,
         centros_custo(nome, codigo)
       )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const parcelas: ParcelaLancamento[] = (data.lancamento_parcelas ?? [])
    .map((parcela) => ({
      id: parcela.id,
      numeroParcela: parcela.numero_parcela,
      valor: parcela.valor,
      dataVencimento: parcela.data_vencimento,
      status: parcela.status as StatusParcela,
      contaBancariaId: parcela.conta_bancaria_id,
      contaBancariaNome: parcela.contas_bancarias?.nome ?? null,
      dataPagamento: parcela.data_pagamento,
    }))
    .sort((a, b) => a.numeroParcela - b.numeroParcela);

  const rateios: RateioLancamento[] = (data.lancamento_rateios ?? []).map(
    (rateio) => ({
      id: rateio.id,
      centroCustoId: rateio.centro_custo_id,
      centroCustoNome: rateio.centros_custo?.nome ?? "-",
      centroCustoCodigo: rateio.centros_custo?.codigo ?? null,
      valor: rateio.valor,
    }),
  );

  return {
    id: data.id,
    numero: data.numero,
    tipo: data.tipo as TipoLancamento,
    origem: data.origem,
    origemId: data.origem_id,
    fornecedorId: data.fornecedor_id,
    fornecedorNome: data.fornecedores ? nomeFornecedor(data.fornecedores) : null,
    categoriaId: data.categoria_id,
    categoriaNome: data.categorias_financeiras?.nome ?? null,
    descricao: data.descricao,
    valor: data.valor,
    status: data.status as StatusLancamento,
    competencia: data.competencia,
    dataEmissao: data.data_emissao,
    dataVencimento: data.data_vencimento,
    parcelas,
    rateios,
  };
}

/** Categorias financeiras ativas para o select, em ordem alfabética. */
export async function listarCategorias(): Promise<CategoriaOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categorias_financeiras")
    .select("id, nome, tipo")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as categorias");
  }

  return (data ?? []).map((categoria) => ({
    id: categoria.id,
    nome: categoria.nome,
    tipo: categoria.tipo,
  }));
}

/** Fornecedores ativos para o select, em ordem alfabética. */
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

/** Centros de custo ativos para o rateio, em ordem de código. */
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

/**
 * Trilha de auditoria do lançamento: lê o audit_log só do próprio lançamento
 * (cabeçalho), sem parcelas nem rateios, pra não duplicar "Lançamento criado"
 * por parcela/rateio. Resolve os nomes dos usuários via RPC e converte para
 * eventos do componente Trilha.
 */
export async function trilhaLancamento(id: string): Promise<EventoTrilha[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("audit_log")
    .select(
      "id, tabela, registro_id, acao, usuario_id, dados_antes, dados_depois, criado_em",
    )
    .eq("tabela", "lancamentos")
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
    const { data: usuarios } = await supabase.rpc("nomes_usuarios_auditoria", {
      p_ids: idsUsuarios,
    });
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
  return eventosDoAuditLog(registros, { nomes, entidade: "Lançamento", genero: "m" });
}
