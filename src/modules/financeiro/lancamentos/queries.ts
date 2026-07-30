import "server-only";

import {
  eventosDoAuditLog,
  type EventoTrilha,
  type RegistroAuditLog,
} from "@/components/canonicos";
import { createClient } from "@/lib/supabase/server";
import { resolverNomesAuditLog } from "@/lib/trilha-nomes";
import type { OrigemDataProgramada } from "@/modules/financeiro/_shared/janela-pagamento";
import {
  tipoFormaPagamento,
  type TipoFormaPagamento,
} from "@/modules/_shared/forma-pagamento";
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
  busca?: string;
  /** Mês de referência exato (yyyy-MM-01). */
  mesCompetencia?: string;
  /**
   * Só lançamentos com alguma parcela em revisão. É filtro de status de
   * PARCELA numa lista de LANÇAMENTOS, então não entra no `status` acima: vem
   * por uma consulta dos ids e um `in`, que é previsível. O conjunto é pequeno
   * por natureza (é fila de trabalho, não histórico).
   */
  emRevisao?: boolean;
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
  /** O fato: data da compra ou do documento. */
  dataCompra: string;
  /** Mês de referência (dia 1): em que mês o custo entra. */
  mesCompetencia: string;
  /** Data de sistema, imutável. */
  criadoEm: string;
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
  /** Data em que o pagamento está autorizado (definida na aprovação). */
  dataProgramada: string | null;
  /** De onde veio a data: vencimento (fallback), aprovacao ou reprogramacao. */
  dataProgramadaOrigem: OrigemDataProgramada | null;
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
  /** Mês de referência (dia 1). Obrigatório: define em que mês o custo entra. */
  mesCompetencia: string;
  /** O fato: data da compra (herdada da OC) ou do documento. */
  dataCompra: string;
  /** Data de sistema (created_at), imutável: a tela mostra como texto. */
  criadoEm: string;
  dataVencimento: string | null;
  parcelas: ParcelaLancamento[];
  rateios: RateioLancamento[];
  /**
   * Condição de pagamento da ordem de origem (só quando origem='oc'). Serve ao
   * "Gerar pela condição" na hora de definir as parcelas aqui: o lançamento em
   * si não tem condição, ela vive na OC.
   */
  condicaoPagamentoId: string | null;
  condicaoPagamentoDescricao: string | null;
  /** Forma de pagamento e o tipo dela, que decide o caminho do pagamento. */
  formaPagamentoId: string | null;
  formaPagamentoNome: string | null;
  formaPagamentoTipo: TipoFormaPagamento | null;
  /**
   * Número da OC de origem (só quando origem='oc'), para o aviso apontar o
   * documento em que a nota fiscal é registrada.
   */
  origemNumero: string | null;
  /** Se a nota fiscal da OC de origem já foi registrada. */
  notaRegistrada: boolean;
}

/** Opção de forma de pagamento ativa para o select do lançamento. */
export interface FormaPagamentoOpcao {
  id: string;
  nome: string;
  tipo: TipoFormaPagamento;
}

/**
 * Formas de pagamento ativas. Consulta própria do financeiro em vez de
 * importar a de compras: cada módulo lê o que precisa, sem depender do outro.
 */
export async function listarFormasPagamento(): Promise<FormaPagamentoOpcao[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("formas_pagamento")
    .select("id, nome, tipo")
    .eq("ativo", true)
    .order("nome");
  if (error) throw new Error("Não foi possível carregar as formas de pagamento");
  return (data ?? []).map((forma) => ({
    id: forma.id,
    nome: forma.nome,
    tipo: tipoFormaPagamento(forma.tipo),
  }));
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

  let idsEmRevisao: string[] | null = null;
  if (params.emRevisao) {
    const { data: parcelas } = await supabase
      .from("lancamento_parcelas")
      .select("lancamento_id")
      .eq("status", "em_revisao");
    idsEmRevisao = [
      ...new Set((parcelas ?? []).map((parcela) => parcela.lancamento_id)),
    ];
    // Nenhum lançamento em revisão: devolve vazio sem ir buscar a lista toda.
    if (idsEmRevisao.length === 0) {
      return { itens: [], total: 0 };
    }
  }

  let consulta = supabase
    .from("lancamentos")
    .select(
      `id, numero, tipo, origem, descricao, valor, data_vencimento, status,
       data_compra, mes_competencia, created_at,
       categorias_financeiras(nome),
       fornecedores(razao_social, nome_fantasia),
       lancamento_parcelas(count)`,
      { count: "exact" },
    )
    .order("data_compra", { ascending: false })
    .order("created_at", { ascending: false })
    .range(de, ate);

  if (idsEmRevisao) consulta = consulta.in("id", idsEmRevisao);
  if (params.tipo) consulta = consulta.eq("tipo", params.tipo);
  if (params.status) consulta = consulta.eq("status", params.status);
  if (params.mesCompetencia) {
    consulta = consulta.eq("mes_competencia", params.mesCompetencia);
  }
  if (params.busca?.trim()) {
    const padrao = `%${params.busca.replace(/[,()"'\\]/g, "").trim()}%`;
    consulta = consulta.or(`numero.ilike.${padrao},descricao.ilike.${padrao}`);
  }

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
      dataCompra: lancamento.data_compra,
      mesCompetencia: lancamento.mes_competencia,
      criadoEm: lancamento.created_at,
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
       forma_pagamento_id,
       descricao, valor, status, mes_competencia, data_compra, created_at,
       data_vencimento,
       categorias_financeiras(nome),
       formas_pagamento(nome, tipo),
       fornecedores(razao_social, nome_fantasia),
       lancamento_parcelas(
         id, numero_parcela, valor, data_vencimento, status,
         data_programada, data_programada_origem,
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
      dataProgramada: parcela.data_programada,
      dataProgramadaOrigem:
        (parcela.data_programada_origem as OrigemDataProgramada | null) ?? null,
      contaBancariaId: parcela.conta_bancaria_id,
      contaBancariaNome: parcela.contas_bancarias?.nome ?? null,
      dataPagamento: parcela.data_pagamento,
    }))
    .sort((a, b) => a.numeroParcela - b.numeroParcela);

  // Condição de pagamento, número e nota da OC de origem: o lançamento não
  // guarda condição, e o aviso de lançamento incompleto precisa apontar o
  // documento certo.
  let condicaoPagamentoId: string | null = null;
  let condicaoPagamentoDescricao: string | null = null;
  let origemNumero: string | null = null;
  let notaRegistrada = false;
  if (data.origem === "oc" && data.origem_id) {
    const [{ data: ordem }, { count }] = await Promise.all([
      supabase
        .from("ordens_compra")
        .select("numero, condicao_pagamento_id, condicoes_pagamento(descricao)")
        .eq("id", data.origem_id)
        .maybeSingle(),
      supabase
        .from("recebimentos")
        .select("id", { count: "exact", head: true })
        .eq("ordem_compra_id", data.origem_id),
    ]);
    condicaoPagamentoId = ordem?.condicao_pagamento_id ?? null;
    condicaoPagamentoDescricao = ordem?.condicoes_pagamento?.descricao ?? null;
    origemNumero = ordem?.numero ?? null;
    notaRegistrada = (count ?? 0) > 0;
  }

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
    mesCompetencia: data.mes_competencia,
    dataCompra: data.data_compra,
    criadoEm: data.created_at,
    dataVencimento: data.data_vencimento,
    parcelas,
    rateios,
    condicaoPagamentoId,
    condicaoPagamentoDescricao,
    formaPagamentoId: data.forma_pagamento_id,
    formaPagamentoNome: data.formas_pagamento?.nome ?? null,
    formaPagamentoTipo: data.formas_pagamento
      ? tipoFormaPagamento(data.formas_pagamento.tipo)
      : null,
    origemNumero,
    notaRegistrada,
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
