import "server-only";

import { TZDate } from "@date-fns/tz";

import {
  eventosDoAuditLog,
  type EventoTrilha,
  type RegistroAuditLog,
} from "@/components/canonicos";
import { TIMEZONE } from "@/lib/formatadores";
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
import type {
  FiltroRevisao,
  OrigemLancamento,
} from "@/modules/financeiro/lancamentos/schemas";
import { LIMITE_LOTE } from "@/modules/financeiro/lancamentos/lote";

/**
 * Filtros e paginação da listagem de lançamentos. Todo filtro aqui é aplicado
 * no banco: a paginação é server-side, e filtrar só a página carregada faria a
 * tela mentir sobre quantos lançamentos existem.
 */
export interface ListarLancamentosParams {
  pagina: number;
  tamanho: number;
  tipo?: TipoLancamento;
  status?: StatusLancamento;
  busca?: string;
  /** Mês de referência exato (yyyy-MM-01). */
  mesCompetencia?: string;
  fornecedorId?: string;
  /** Categoria do custo (categorias_financeiras). */
  categoriaId?: string;
  /**
   * Centro de custo do rateio. Mora em lancamento_rateios (um lançamento pode
   * ser rateado entre vários centros), então o banco resolve por `exists`.
   */
  centroCustoId?: string;
  /**
   * Conta bancária de alguma parcela do lançamento (paga ou a pagar): a
   * pergunta é "o que passou por esta conta", não "o que ainda vai sair dela".
   */
  contaBancariaId?: string;
  formaPagamentoId?: string;
  origem?: OrigemLancamento;
  /** Faixa de valor do lançamento, em reais (comparação gte/lte no banco). */
  valorDe?: number;
  valorAte?: number;
  /** Período de vencimento do lançamento (data_vencimento, yyyy-MM-dd). */
  vencimentoDe?: string;
  vencimentoAte?: string;
  /** Período da data da compra (data_compra, yyyy-MM-dd). */
  compraDe?: string;
  compraAte?: string;
  /**
   * Período de criação (created_at). A coluna é timestamptz, então o dia
   * informado é convertido para o instante certo no fuso de Rio Branco.
   */
  criadoDe?: string;
  criadoAte?: string;
  /**
   * Estado da revisão: parcela em revisão, ou a situação da conta bancária das
   * parcelas ainda não pagas (sem conta, conta parcial, revisado). Derivado das
   * parcelas pela MESMA expressão que preenche o selo da coluna, no banco: é
   * isso que impede filtro e selo de mostrarem conjuntos diferentes.
   */
  revisao?: FiltroRevisao;
}

// A linha e a pagina da listagem moram em `pagina.ts`, junto da leitura do
// que a RPC devolve: quem define o formato e quem o converte no mesmo lugar.
export type {
  LancamentoLista,
  LancamentosPagina,
} from "@/modules/financeiro/lancamentos/pagina";
import {
  lerPagina,
  type LancamentosPagina,
} from "@/modules/financeiro/lancamentos/pagina";

/** Parcela do lançamento, com o nome da conta resolvido. */
export interface ParcelaLancamento {
  id: string;
  numeroParcela: number;
  valor: number;
  /** Desconto concedido no pagamento. Zero quando não houve. */
  desconto: number;
  /** Valor menos desconto: o que saiu da conta bancária. */
  valorLiquido: number;
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
  /** Texto livre do lançamento. Só aparece no detalhe, nunca na lista. */
  observacoes: string | null;
  parcelas: ParcelaLancamento[];
  rateios: RateioLancamento[];
  /**
   * Condição de pagamento que vale para este lançamento, e é o que o "Gerar
   * pela condição" usa. Em lançamento de OC ela vem da ordem de origem (a
   * condição pertence ao documento de origem); em lançamento avulso é a que
   * está gravada no próprio lançamento.
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

/**
 * Condição de pagamento vem do catálogo compartilhado, não de uma consulta
 * própria do Financeiro. O lançamento avulso escolhe da MESMA lista da OC e cria
 * na mesma tabela: era o que o Tiago pediu, e cópia da consulta em cada módulo
 * só garantia isso enquanto ninguém filtrasse diferente num dos lados.
 *
 * Nem Financeiro importa de Compras nem o contrário: os dois leem de `_shared`.
 */
export type { CondicaoPagamentoOpcao } from "@/modules/_shared/condicao-pagamento/regras";
export { listarCondicoesPagamento } from "@/modules/_shared/condicao-pagamento/queries";

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

/** Linhas lidas por página nas consultas auxiliares de filtro. */
/**
 * Instante UTC da meia-noite do dia informado no fuso de exibição (Rio Branco).
 * Filtro de período em coluna `timestamptz` (created_at) precisa disso: o dia do
 * usuário começa às 05:00 UTC. Para coluna `date` (data_compra, data_vencimento)
 * não use: lá a string crua já basta.
 *
 * Duplicado de propósito em relação ao helper de Compras: cada módulo lê o que
 * precisa sem depender do outro.
 */
function inicioDoDiaISO(data: string, deslocamentoDias = 0): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new TZDate(ano, mes - 1, dia + deslocamentoDias, TIMEZONE).toISOString();
}

/**
 * Lista os lançamentos: página, contagem exata e soma do valor filtrado.
 *
 * Uma chamada, um caminho: a RPC `fn_listar_lancamentos` aplica TODOS os
 * filtros no banco. Antes, os filtros de revisão, conta bancária e centro de
 * custo eram resolvidos aqui em lista de ids e mandados num `.in()` dentro da
 * URL. Com 7.253 lançamentos isso passava de 16 KB de cabeçalho e o cliente
 * recusava a requisição (HeadersOverflowError), depois de 11 segundos lendo as
 * 9.244 parcelas em 10 idas ao banco. Nenhum ajuste de tamanho resolvia: a
 * lista de ids cresce com a base.
 */
export async function listarLancamentos(
  params: ListarLancamentosParams,
): Promise<LancamentosPagina> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("fn_listar_lancamentos", {
    p_filtros: {
      tipo: params.tipo ?? null,
      status: params.status ?? null,
      origem: params.origem ?? null,
      revisao: params.revisao ?? null,
      busca: params.busca?.trim() || null,
      mes_competencia: params.mesCompetencia ?? null,
      fornecedor_id: params.fornecedorId ?? null,
      categoria_id: params.categoriaId ?? null,
      forma_pagamento_id: params.formaPagamentoId ?? null,
      centro_custo_id: params.centroCustoId ?? null,
      conta_bancaria_id: params.contaBancariaId ?? null,
      valor_de: params.valorDe ?? null,
      valor_ate: params.valorAte ?? null,
      vencimento_de: params.vencimentoDe ?? null,
      vencimento_ate: params.vencimentoAte ?? null,
      compra_de: params.compraDe ?? null,
      compra_ate: params.compraAte ?? null,
      // A conversão do dia para instante fica aqui: quem sabe onde o dia do
      // usuário começa é a camada de exibição, não o SQL. O `ate` é exclusivo
      // (meia-noite do dia seguinte), senão o último dia entraria só até 00:00.
      criado_de: params.criadoDe ? inicioDoDiaISO(params.criadoDe) : null,
      criado_ate: params.criadoAte ? inicioDoDiaISO(params.criadoAte, 1) : null,
    },
    p_pagina: Math.max(0, params.pagina),
    p_tamanho: Math.max(1, params.tamanho),
  });

  if (error) {
    // `cause` carrega o erro do PostgREST para o log do servidor. Sem ele, a
    // única pista de uma falha em produção é esta frase genérica, que não diz
    // se foi timeout, permissão ou consulta malformada.
    throw new Error("Não foi possível carregar os lançamentos", {
      cause: error,
    });
  }

  return lerPagina(data);
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
       forma_pagamento_id, condicao_pagamento_id,
       descricao, observacoes, valor, status, mes_competencia, data_compra,
       created_at, data_vencimento,
       categorias_financeiras(nome),
       condicoes_pagamento(descricao),
       formas_pagamento(nome, tipo),
       fornecedores(razao_social, nome_fantasia),
       lancamento_parcelas(
         id, numero_parcela, valor, desconto, valor_liquido,
         data_vencimento, status,
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
      desconto: parcela.desconto ?? 0,
      valorLiquido: parcela.valor_liquido ?? parcela.valor,
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

  // Condição de pagamento do lançamento avulso: é a coluna do próprio
  // lançamento. Em lançamento de OC ela é substituída logo abaixo pela da ordem,
  // que é a dona da condição naquele caminho.
  let condicaoPagamentoId: string | null = data.condicao_pagamento_id;
  let condicaoPagamentoDescricao: string | null =
    data.condicoes_pagamento?.descricao ?? null;
  // Número e nota da OC de origem: o aviso de lançamento incompleto precisa
  // apontar o documento certo.
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
    observacoes: data.observacoes,
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

/**
 * Só os ids do conjunto filtrado, para o "selecionar todos do filtro" da tela.
 *
 * Reusa `listarLancamentos` de propósito, em vez de montar uma segunda consulta
 * com os mesmos filtros. Duas montagens de filtro divergem no primeiro filtro
 * novo que alguém acrescenta, e aí o "selecionar todos" passa a marcar um
 * conjunto diferente do que está na tela — que é o pior defeito possível numa
 * ação em massa. O preço é buscar as linhas inteiras e jogar tudo fora menos o
 * id, e é um preço barato: isto roda num clique, não no caminho quente da tela.
 *
 * Busca `LIMITE_LOTE + 1` de propósito: com um a mais que o teto, a tela sabe
 * dizer "o filtro achou mais que o limite, refine" sem precisar contar tudo.
 */
export async function listarIdsLancamentosFiltrados(
  params: Omit<ListarLancamentosParams, "pagina" | "tamanho">,
): Promise<string[]> {
  const pagina = await listarLancamentos({
    ...params,
    pagina: 0,
    tamanho: LIMITE_LOTE + 1,
  });
  return pagina.itens.map((item) => item.id);
}
