import "server-only";

import {
  eventosDoAuditLog,
  type EventoTrilha,
  type RegistroAuditLog,
} from "@/components/canonicos";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import { createClient } from "@/lib/supabase/server";
import { resolverNomesAuditLog } from "@/lib/trilha-nomes";
import type { TipoFormaPagamento } from "@/modules/_shared/forma-pagamento";
import type { StatusOC } from "@/modules/compras/_shared/formato";
import {
  idsFornecedoresPorNome,
  padraoBusca,
} from "@/modules/compras/_shared/lista";

/** Client de servidor (mesmo tipo que `createClient()` de `@/lib/supabase/server` devolve). */
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Filtros e paginação da listagem de ordens de compra. */
export interface ListarOrdensParams {
  pagina: number;
  tamanho: number;
  status?: StatusOC;
  busca?: string;
  /** Filtro por fornecedor. */
  fornecedorId?: string;
  /** Período da data da compra (inclusive), yyyy-mm-dd. */
  de?: string;
  ate?: string;
  /** Mês de referência exato (yyyy-mm-01). */
  mesCompetencia?: string;
}

/**
 * Linha da listagem de ordens de compra. Os campos depois de `mesCompetencia` são
 * colunas opcionais da tabela: nascem escondidas e o usuário liga no menu
 * "Colunas". Vêm no mesmo select (join barato), sem consulta extra por linha.
 */
export interface OrdemLista {
  id: string;
  numero: string | null;
  fornecedorNome: string;
  valorTotal: number;
  status: string;
  /** O fato: quando a compra aconteceu. */
  dataCompra: string;
  /** Mês de referência (dia 1), que define em que mês o custo entra. */
  mesCompetencia: string;
  condicaoPagamentoDescricao: string | null;
  formaPagamentoNome: string | null;
  cotacaoNumero: string | null;
  /** Data de sistema, imutável. */
  criadoEm: string;
  criadoPorNome: string | null;
  /**
   * OC aprovada cujo lançamento já está pago e que ainda não tem nota fiscal
   * registrada (caso do cartão de crédito). Serve ao aviso na lista.
   */
  quitadaSemNota: boolean;
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
  numero: string | null;
  status: string;
  valor: number;
  dataVencimento: string | null;
}

/** Parcela definida na OC (tabela oc_parcelas). */
export interface OrdemParcela {
  numeroParcela: number;
  dataVencimento: string;
  valor: number;
}

/** OC completa para a tela de detalhe. */
export interface OrdemDetalhe {
  id: string;
  numero: string | null;
  fornecedorId: string;
  fornecedorNome: string;
  condicaoPagamentoId: string | null;
  condicaoPagamentoDescricao: string | null;
  formaPagamentoId: string | null;
  cotacaoId: string | null;
  cotacaoNumero: string | null;
  valorTotal: number;
  status: string;
  motivoRejeicao: string | null;
  dataCompra: string;
  mesCompetencia: string;
  /** Data de sistema (created_at), imutável: a tela mostra como texto. */
  criadoEm: string;
  observacoes: string | null;
  itens: OrdemItem[];
  /** Vazio quando a OC não tem parcelas definidas (serão definidas no lançamento). */
  parcelas: OrdemParcela[];
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

/**
 * Prefill de uma OC gerada a partir de uma cotação finalizada: fornecedor
 * vencedor, condição/forma de pagamento dele e os itens que ele cotou. Não
 * traz centro de custo (a cotação não tem): o usuário atribui na tela antes
 * de criar a OC.
 */
export interface PrefillOrdemCotacao {
  cotacaoId: string;
  cotacaoNumero: string | null;
  fornecedorId: string;
  condicaoPagamentoId: string | null;
  formaPagamentoId: string | null;
  itens: { insumoId: string; quantidade: number; precoUnitario: number }[];
}

/** Opção de condição de pagamento ativa para o select da OC. */
export interface CondicaoPagamentoOpcao {
  id: string;
  descricao: string;
}

/**
 * Opção de forma de pagamento (método) ativa para o select da OC. Carrega o
 * `tipo` porque é ele que decide o caminho do pagamento, e a tela avisa isso
 * antes de salvar.
 */
export interface FormaPagamentoOpcao {
  id: string;
  nome: string;
  tipo: TipoFormaPagamento;
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
 * Nomes dos usuários que criaram os registros, pela RPC de auditoria
 * (security definer): a tabela `usuarios` não é legível por quem só tem
 * permissão de Compras. Uma chamada por página, não por linha.
 */
async function nomesDosCriadores(
  supabase: SupabaseServerClient,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((id): id is string => id !== null))];
  const nomes = new Map<string, string>();
  if (unicos.length === 0) return nomes;

  const { data } = await supabase.rpc("nomes_usuarios_auditoria", {
    p_ids: unicos,
  });
  for (const usuario of data ?? []) nomes.set(usuario.id, usuario.nome);
  return nomes;
}

/**
 * Das OCs aprovadas, quais já estão quitadas sem nota fiscal registrada. É o
 * caso do cartão de crédito: o lançamento nasce pago na aprovação e a OC segue
 * 'aprovado' até a nota chegar. Sem esse aviso na lista, a nota some no fim do
 * mês. `lancamentos.origem_id` é polimórfico (não é FK), então não dá para
 * embutir no select da OC: vem em uma consulta a mais, só com os ids da página.
 */
async function ordensQuitadasSemNota(
  supabase: SupabaseServerClient,
  ids: string[],
): Promise<Set<string>> {
  const quitadas = new Set<string>();
  if (ids.length === 0) return quitadas;

  const { data } = await supabase
    .from("lancamentos")
    .select("origem_id")
    .eq("origem", "oc")
    .eq("status", "pago")
    .in("origem_id", ids);

  for (const lancamento of data ?? []) {
    if (lancamento.origem_id) quitadas.add(lancamento.origem_id);
  }
  return quitadas;
}

/**
 * Lista as ordens de compra com paginação server-side (range + count exact) e
 * o nome do fornecedor resolvido (join). Aceita filtro por status, fornecedor,
 * período de emissão e busca por número da OC ou nome do fornecedor. O
 * valor_total vem do banco (trigger), nunca recalculado no app.
 *
 * O select também traz condição e forma de pagamento, cotação de origem e
 * criação: são as colunas opcionais da tabela, todas por join no mesmo
 * round-trip.
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
      `id, numero, valor_total, status, data_compra, mes_competencia, created_at, created_by,
       fornecedores(razao_social, nome_fantasia),
       condicoes_pagamento(descricao),
       formas_pagamento(nome),
       cotacoes(numero)`,
      { count: "exact" },
    )
    .order("data_compra", { ascending: false })
    .order("created_at", { ascending: false })
    .range(de, ate);

  if (params.status) consulta = consulta.eq("status", params.status);
  if (params.fornecedorId) {
    consulta = consulta.eq("fornecedor_id", params.fornecedorId);
  }
  if (params.de) consulta = consulta.gte("data_compra", params.de);
  if (params.ate) consulta = consulta.lte("data_compra", params.ate);
  if (params.mesCompetencia) {
    consulta = consulta.eq("mes_competencia", params.mesCompetencia);
  }

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

  const linhas = data ?? [];
  const [nomesCriadores, quitadasSemNota] = await Promise.all([
    nomesDosCriadores(
      supabase,
      linhas.map((ordem) => ordem.created_by),
    ),
    ordensQuitadasSemNota(
      supabase,
      linhas.filter((ordem) => ordem.status === "aprovado").map((o) => o.id),
    ),
  ]);

  const itens: OrdemLista[] = linhas.map((ordem) => ({
    id: ordem.id,
    numero: ordem.numero,
    fornecedorNome: ordem.fornecedores
      ? nomeFornecedor(ordem.fornecedores)
      : "-",
    valorTotal: ordem.valor_total,
    status: ordem.status,
    dataCompra: ordem.data_compra,
    mesCompetencia: ordem.mes_competencia,
    condicaoPagamentoDescricao: ordem.condicoes_pagamento?.descricao ?? null,
    formaPagamentoNome: ordem.formas_pagamento?.nome ?? null,
    cotacaoNumero: ordem.cotacoes?.numero ?? null,
    criadoEm: ordem.created_at,
    criadoPorNome: ordem.created_by
      ? (nomesCriadores.get(ordem.created_by) ?? null)
      : null,
    quitadaSemNota: quitadasSemNota.has(ordem.id),
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
      `id, numero, fornecedor_id, condicao_pagamento_id, forma_pagamento_id, cotacao_id,
       valor_total, status, motivo_rejeicao, data_compra, mes_competencia,
       created_at, observacoes,
       fornecedores(razao_social, nome_fantasia),
       cotacoes(numero),
       condicoes_pagamento(descricao),
       oc_itens(
         id, insumo_id, quantidade, preco_unitario, centro_custo_id,
         insumos(nome, unidades_medida(sigla)),
         centros_custo(nome, codigo)
       ),
       oc_parcelas(numero_parcela, data_vencimento, valor)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !ordem) return null;

  const { data: lancamento } = await supabase
    .from("lancamentos")
    .select("id, numero, status, valor, data_vencimento")
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
    formaPagamentoId: ordem.forma_pagamento_id,
    cotacaoId: ordem.cotacao_id,
    cotacaoNumero: ordem.cotacoes?.numero ?? null,
    valorTotal: ordem.valor_total,
    status: ordem.status,
    motivoRejeicao: ordem.motivo_rejeicao,
    dataCompra: ordem.data_compra,
    mesCompetencia: ordem.mes_competencia,
    criadoEm: ordem.created_at,
    observacoes: ordem.observacoes,
    itens,
    parcelas: (ordem.oc_parcelas ?? [])
      .map((parcela) => ({
        numeroParcela: parcela.numero_parcela,
        dataVencimento: parcela.data_vencimento,
        valor: parcela.valor,
      }))
      .sort((a, b) => a.numeroParcela - b.numeroParcela),
    lancamento: lancamento
      ? {
          id: lancamento.id,
          numero: lancamento.numero,
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

/**
 * Monta o prefill da OC a partir de uma cotação FINALIZADA: acha a linha do
 * fornecedor vencedor em cotacao_fornecedores (a coluna vencedor_fornecedor_id
 * da cotação guarda o fornecedores.id, então casamos por cotacao_id +
 * fornecedor_id) e traz a condição/forma de pagamento dele e os itens que ele
 * cotou. Retorna null se a cotação não existe, não está finalizada, não tem
 * vencedor definido ou o vencedor não tem linha na cotação. É a única origem
 * de cotação de uma OC: o formulário não deixa mais escolher cotação à mão.
 */
export async function montarPrefillDaCotacao(
  cotacaoId: string,
): Promise<PrefillOrdemCotacao | null> {
  const supabase = await createClient();

  const { data: cotacao } = await supabase
    .from("cotacoes")
    .select("id, numero, status, vencedor_fornecedor_id")
    .eq("id", cotacaoId)
    .maybeSingle();

  if (
    !cotacao ||
    cotacao.status !== "finalizada" ||
    !cotacao.vencedor_fornecedor_id
  ) {
    return null;
  }

  const { data: vencedor } = await supabase
    .from("cotacao_fornecedores")
    .select("id, condicao_pagamento_id, forma_pagamento_id")
    .eq("cotacao_id", cotacao.id)
    .eq("fornecedor_id", cotacao.vencedor_fornecedor_id)
    .maybeSingle();

  if (!vencedor) return null;

  const { data: itens } = await supabase
    .from("cotacao_itens")
    .select("insumo_id, quantidade, preco_unitario")
    .eq("cotacao_fornecedor_id", vencedor.id);

  return {
    cotacaoId: cotacao.id,
    cotacaoNumero: cotacao.numero,
    fornecedorId: cotacao.vencedor_fornecedor_id,
    condicaoPagamentoId: vencedor.condicao_pagamento_id,
    formaPagamentoId: vencedor.forma_pagamento_id,
    itens: (itens ?? []).map((item) => ({
      insumoId: item.insumo_id,
      quantidade: item.quantidade,
      precoUnitario: item.preco_unitario,
    })),
  };
}

/** Linha do audit_log de lancamento_parcelas relevante pra um evento de pagamento. */
interface LinhaPagamentoParcela {
  id: number | string;
  usuario_id: string | null;
  dados_antes: RegistroAuditLog["dados_antes"];
  dados_depois: RegistroAuditLog["dados_depois"];
  criado_em: string;
}

/** Lê o campo `status` de um dados_antes/dados_depois do audit_log, se houver. */
function statusDoAuditLog(dados: RegistroAuditLog["dados_depois"]): string | undefined {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) return undefined;
  const status = (dados as Record<string, unknown>).status;
  return typeof status === "string" ? status : undefined;
}

/**
 * Busca os eventos de PAGAMENTO das parcelas de TODOS os lançamentos
 * vinculados à OC (origem='oc'): acha os lançamentos, as parcelas deles, e as
 * linhas do audit_log de lancamento_parcelas em que o status virou 'pago' (e
 * não já estava 'pago' antes, pra não duplicar em updates posteriores).
 *
 * Uma OC pode ter mais de um lançamento com o mesmo origem_id:
 * fn_aprovar_ordem_compra insere um lançamento novo a cada aprovação, e
 * fn_desaprovar_ordem_compra só cancela o antigo (não apaga). No fluxo
 * aprovar → desaprovar → reaprovar, a OC fica com 2+ lançamentos. Por isso
 * não dá pra usar `.maybeSingle()` aqui: buscamos todos e agregamos as
 * parcelas de todos. Um lançamento cancelado (do ciclo de desaprovação) só
 * tem parcelas não pagas, então incluí-lo é seguro — só pagamentos reais
 * viram evento.
 *
 * Sem lançamento ou sem parcela paga, devolve lista vazia.
 */
async function auditLogPagamentosParcelasDaOrdem(
  supabase: SupabaseServerClient,
  ordemId: string,
): Promise<LinhaPagamentoParcela[]> {
  const { data: lancamentos } = await supabase
    .from("lancamentos")
    .select("id")
    .eq("origem", "oc")
    .eq("origem_id", ordemId);

  const idsLancamentos = (lancamentos ?? []).map((lancamento) => lancamento.id);
  if (idsLancamentos.length === 0) return [];

  const { data: parcelas } = await supabase
    .from("lancamento_parcelas")
    .select("id")
    .in("lancamento_id", idsLancamentos);

  const idsParcelas = (parcelas ?? []).map((parcela) => parcela.id);
  if (idsParcelas.length === 0) return [];

  const { data: linhas } = await supabase
    .from("audit_log")
    .select("id, usuario_id, dados_antes, dados_depois, criado_em")
    .eq("tabela", "lancamento_parcelas")
    .eq("acao", "UPDATE")
    .in("registro_id", idsParcelas)
    .order("criado_em", { ascending: false })
    .order("id", { ascending: false });

  return (linhas ?? []).filter((linha) => {
    const statusDepois = statusDoAuditLog(linha.dados_depois);
    const statusAntes = statusDoAuditLog(linha.dados_antes);
    return statusDepois === "pago" && statusAntes !== "pago";
  });
}

/**
 * Trilha de auditoria da OC: lê o audit_log só da própria ordem (cabeçalho),
 * sem os itens, pra não duplicar "Ordem criada" por item, e resolve os nomes
 * dos usuários via RPC (security definer), igual à tela de auditoria.
 * Enriquece com os eventos de pagamento das parcelas do lançamento vinculado
 * (origem='oc'): sem isso, a trilha só mostra a OC virando "Paga" no status,
 * sem detalhar quais parcelas foram quitadas. Devolve tudo ordenado por
 * data desc (o componente Trilha também ordena, mas já entregamos assim).
 */
export async function trilhaOrdem(id: string): Promise<EventoTrilha[]> {
  const supabase = await createClient();

  const [{ data, error }, linhasPagamento] = await Promise.all([
    supabase
      .from("audit_log")
      .select(
        "id, tabela, registro_id, acao, usuario_id, dados_antes, dados_depois, criado_em",
      )
      .eq("tabela", "ordens_compra")
      .eq("registro_id", id)
      .order("criado_em", { ascending: false })
      .order("id", { ascending: false }),
    auditLogPagamentosParcelasDaOrdem(supabase, id),
  ]);

  if (error || !data) return [];

  const idsUsuarios = [
    ...new Set(
      [...data, ...linhasPagamento]
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

  const nomeUsuario = (usuarioId: string | null): string =>
    usuarioId === null ? "Sistema" : (nomesPorId.get(usuarioId) ?? "Sistema");

  const registros: RegistroAuditLog[] = data.map((linha) => ({
    id: linha.id,
    tabela: linha.tabela,
    registro_id: linha.registro_id,
    acao: linha.acao,
    usuario_id: linha.usuario_id,
    usuario_nome: nomeUsuario(linha.usuario_id),
    dados_antes: linha.dados_antes,
    dados_depois: linha.dados_depois,
    criado_em: linha.criado_em,
  }));

  const nomes = await resolverNomesAuditLog(supabase, registros);
  const eventosOrdem = eventosDoAuditLog(registros, {
    nomes,
    entidade: "Ordem",
    genero: "f",
  });

  const eventosPagamento: EventoTrilha[] = linhasPagamento.map((linha) => {
    const depois =
      linha.dados_depois && typeof linha.dados_depois === "object" && !Array.isArray(linha.dados_depois)
        ? (linha.dados_depois as Record<string, unknown>)
        : {};
    const valor = typeof depois.valor === "number" || typeof depois.valor === "string"
      ? depois.valor
      : null;
    const dataVencimento =
      typeof depois.data_vencimento === "string" ? depois.data_vencimento : null;
    return {
      id: `pag-${linha.id}`,
      data: linha.criado_em,
      titulo: "Parcela paga",
      descricao: `${formatarBRL(valor)} · venc ${formatarData(dataVencimento)}`,
      usuario: nomeUsuario(linha.usuario_id),
      tipo: "aprovacao",
    };
  });

  return [...eventosOrdem, ...eventosPagamento].sort(
    (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime(),
  );
}
