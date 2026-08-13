import "server-only";

import { TZDate } from "@date-fns/tz";

import {
  eventosDoAuditLog,
  type EventoTrilha,
  type RegistroAuditLog,
} from "@/components/canonicos";
import { dataHojeISO, TIMEZONE } from "@/lib/formatadores";
import { createClient } from "@/lib/supabase/server";
import { resolverNomesAuditLog } from "@/lib/trilha-nomes";
import type { OrigemDataProgramada } from "@/modules/financeiro/_shared/janela-pagamento";
import {
  tipoFormaPagamento,
  type TipoFormaPagamento,
} from "@/modules/_shared/forma-pagamento";
import {
  STATUS_PARCELA_ABERTA,
  type StatusLancamento,
  type StatusParcela,
  type TipoLancamento,
} from "@/modules/financeiro/_shared/formato";
import type {
  FiltroAtraso,
  FiltroRevisao,
  OrigemLancamento,
} from "@/modules/financeiro/lancamentos/schemas";
import { LIMITE_LOTE } from "@/modules/financeiro/lancamentos/lote";
import {
  lerLancamentosEmPaginas,
  PAGINA_LEITURA,
} from "@/modules/financeiro/lancamentos/leitura-completa";
import {
  dinheiroDasParcelas,
  resumirLancamentos,
  situacaoDeAtraso,
  type ResumoLancamentos,
} from "@/modules/financeiro/lancamentos/resumo";

/** Cliente Supabase do servidor, para as consultas auxiliares de filtro. */
type ClienteSupabase = Awaited<ReturnType<typeof createClient>>;

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
   * ser rateado entre vários centros), então vira consulta de ids + `in`.
   */
  centroCustoId?: string;
  /**
   * Conta bancária de alguma parcela do lançamento (paga ou a pagar). Mora em
   * lancamento_parcelas, então também vira consulta de ids + `in`.
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
   * parcelas ainda não pagas (sem conta, conta parcial, revisado). É derivado
   * das parcelas, então vira consulta de ids + `in`.
   */
  revisao?: FiltroRevisao;
  /**
   * Situação de atraso, derivada das parcelas em aberto: `vencido` (alguma
   * atrasada) ou `a_vencer` (tem saldo e nada estourou). Também vira consulta de
   * ids + `in`. Não confundir com `vencimentoDe`/`vencimentoAte`, que olham a
   * coluna do cabeçalho do lançamento.
   */
  atraso?: FiltroAtraso;
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
  /**
   * Dinheiro do lançamento repartido pelo estado das PARCELAS, que é onde o
   * pagamento acontece. O `valor` acima é o total do documento; estes três dizem
   * quanto dele já saiu, quanto falta e quanto está atrasado.
   *
   * Existe porque somar por status do lançamento mente: 107 lançamentos da base
   * estão parcialmente pagos (medido em 13/08/2026, R$ 12,36 mi de valor com
   * R$ 2,53 mi já pagos), e pelo status eles contam inteiros como "a pagar".
   */
  /** Soma das parcelas pagas, pelo LÍQUIDO: é o que saiu da conta bancária. */
  valorPago: number;
  /** Soma das parcelas que não estão pagas nem canceladas. */
  valorAberto: number;
  /** Parte do aberto com vencimento anterior a hoje (fuso de Rio Branco). */
  valorVencido: number;
  /** Desconto concedido nas parcelas já pagas. Zero quando não houve. */
  descontoObtido: number;
  /**
   * Estado da revisão do lançamento, derivado da conta bancária das parcelas.
   * Não é um marcador que alguém liga na mão de propósito: selo dizendo
   * "revisado" com a conta vazia seria mentira, e um flag manual sairia de
   * sincronia com o que o banco exige para aprovar.
   *
   * Parcela PAGA conta como resolvida, porque pagar exige conta bancária. Logo
   * lançamento quitado é `revisado`, e é o caso mais resolvido que existe.
   *
   * nao-se-aplica: a receber, ou sem parcela nenhuma.
   */
  revisao: "sem-conta" | "parcial" | "revisado" | "nao-se-aplica";
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
const PAGINA_IDS = 1000;
/** Teto de páginas auxiliares, para uma consulta errada não varrer o banco. */
const MAX_PAGINAS_IDS = 10;

/**
 * Lê uma consulta auxiliar em páginas, até acabar. Filtro que mora em tabela
 * filha (parcela, rateio) precisa da lista completa de lancamento_id, e o
 * PostgREST corta a resposta num teto invisível: sem paginar, o filtro perderia
 * lançamentos sem avisar ninguém.
 */
async function lerEmPaginas<T>(
  consultar: (
    de: number,
    ate: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const linhas: T[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS_IDS; pagina += 1) {
    const inicio = pagina * PAGINA_IDS;
    const { data, error } = await consultar(inicio, inicio + PAGINA_IDS - 1);
    // Erro aqui não pode virar lista vazia: a tela mostraria "nenhum
    // lançamento" para um filtro que na verdade não foi aplicado.
    if (error) throw new Error("Não foi possível aplicar o filtro");
    const lote = data ?? [];
    linhas.push(...lote);
    if (lote.length < PAGINA_IDS) break;
  }
  return linhas;
}

/** Ids de lançamentos com alguma parcela na conta bancária informada. */
async function idsPorContaBancaria(
  supabase: ClienteSupabase,
  contaBancariaId: string,
): Promise<string[]> {
  // Vale parcela paga e a pagar: a pergunta de quem filtra é "o que passou por
  // esta conta", não "o que ainda vai sair dela".
  const parcelas = await lerEmPaginas((de, ate) =>
    supabase
      .from("lancamento_parcelas")
      .select("lancamento_id")
      .eq("conta_bancaria_id", contaBancariaId)
      // Ordem estável (id como desempate) para a paginação não repetir nem
      // pular linha entre uma página e a seguinte.
      .order("lancamento_id")
      .order("id")
      .range(de, ate),
  );
  return [...new Set(parcelas.map((parcela) => parcela.lancamento_id))];
}

/** Ids de lançamentos rateados no centro de custo informado. */
async function idsPorCentroCusto(
  supabase: ClienteSupabase,
  centroCustoId: string,
): Promise<string[]> {
  // O centro de custo do lançamento vive no rateio, nunca na tabela mãe: um
  // lançamento pode ser dividido entre várias obras.
  const rateios = await lerEmPaginas((de, ate) =>
    supabase
      .from("lancamento_rateios")
      .select("lancamento_id")
      .eq("centro_custo_id", centroCustoId)
      .order("lancamento_id")
      .order("id")
      .range(de, ate),
  );
  return [...new Set(rateios.map((rateio) => rateio.lancamento_id))];
}

/**
 * Ids de lançamentos por situação de atraso.
 *
 * Lê SÓ as parcelas em aberto (`STATUS_PARCELA_ABERTA`), e não todas: são 931 de
 * 7.701 na base de hoje, então isto é uma requisição em vez de oito, e nem
 * encosta no teto de páginas do `lerEmPaginas`. Quem está quitado não aparece em
 * nenhum dos dois lados do filtro justamente por não ter parcela aberta nenhuma.
 *
 * A classificação em si é do `situacaoDeAtraso`, o mesmo módulo que alimenta o
 * cartão "Vencido": o filtro não pode trazer um conjunto diferente do número que
 * está escrito em cima dele.
 */
async function idsPorAtraso(
  supabase: ClienteSupabase,
  atraso: FiltroAtraso,
  hojeISO: string,
): Promise<string[]> {
  const parcelas = await lerEmPaginas((de, ate) =>
    supabase
      .from("lancamento_parcelas")
      .select("lancamento_id, status, data_vencimento")
      .in("status", STATUS_PARCELA_ABERTA)
      .order("lancamento_id")
      .order("id")
      .range(de, ate),
  );

  const porLancamento = new Map<
    string,
    Array<{ status: string; dataVencimento: string | null }>
  >();
  for (const parcela of parcelas) {
    const lista = porLancamento.get(parcela.lancamento_id) ?? [];
    lista.push({
      status: parcela.status,
      dataVencimento: parcela.data_vencimento,
    });
    porLancamento.set(parcela.lancamento_id, lista);
  }

  const ids: string[] = [];
  for (const [id, lista] of porLancamento) {
    if (situacaoDeAtraso(lista, hojeISO) === atraso) ids.push(id);
  }
  return ids;
}

/**
 * Ids de lançamentos no estado de revisão pedido. `em_revisao` é status de
 * parcela; os outros três são derivados da conta bancária das parcelas ainda
 * não pagas, com a mesma regra que a coluna "Revisão" da lista usa (por isso
 * só lançamentos a pagar entram: a receber não tem revisão de conta).
 */
async function idsPorRevisao(
  supabase: ClienteSupabase,
  revisao: FiltroRevisao,
): Promise<string[]> {
  if (revisao === "em_revisao") {
    const parcelas = await lerEmPaginas((de, ate) =>
      supabase
        .from("lancamento_parcelas")
        .select("lancamento_id")
        .eq("status", "em_revisao")
        .order("lancamento_id")
        .order("id")
        .range(de, ate),
    );
    return [...new Set(parcelas.map((parcela) => parcela.lancamento_id))];
  }

  // Parcela PAGA entra na conta, e conta como resolvida: pagar exige conta
  // bancária (fn_pagar_parcela recusa sem ela), então parcela paga é o caso mais
  // resolvido que existe. Antes elas eram excluídas pela consulta, e o efeito era
  // o contrário do esperado: lançamento quitado ficava fora do filtro "Revisado" e
  // aparecia com "-" na coluna, como se a pergunta não valesse para ele.
  const parcelas = await lerEmPaginas((de, ate) =>
    supabase
      .from("lancamento_parcelas")
      .select("lancamento_id, conta_bancaria_id, status, lancamentos!inner(tipo)")
      .eq("lancamentos.tipo", "a_pagar")
      .order("lancamento_id")
      .order("id")
      .range(de, ate),
  );

  const contagem = new Map<string, { total: number; comConta: number }>();
  for (const parcela of parcelas) {
    const atual = contagem.get(parcela.lancamento_id) ?? {
      total: 0,
      comConta: 0,
    };
    atual.total += 1;
    if (parcela.status === "pago" || parcela.conta_bancaria_id !== null) {
      atual.comConta += 1;
    }
    contagem.set(parcela.lancamento_id, atual);
  }

  const ids: string[] = [];
  for (const [id, { total, comConta }] of contagem) {
    const estado =
      comConta === 0 ? "sem_conta" : comConta === total ? "revisado" : "parcial";
    // `nao_revisado` é o complemento de `revisado`: sem conta nenhuma ou conta em
    // parte. Lançamento quitado NÃO entra aqui, porque parcela paga conta como
    // resolvida (ver o comentário da contagem acima): quitado é revisado, não
    // pendência.
    const casa =
      revisao === "nao_revisado" ? estado !== "revisado" : estado === revisao;
    if (casa) ids.push(id);
  }
  return ids;
}

/**
 * Interseção das listas de ids vindas dos filtros de tabela filha, para ir ao
 * banco com um `in` só (dois `in` na mesma consulta já seriam AND, mas a lista
 * menor deixa a URL da consulta menor).
 */
function intersecao(listas: string[][]): string[] {
  const [primeira, ...resto] = listas;
  return resto.reduce((acumulado, lista) => {
    const atual = new Set(lista);
    return acumulado.filter((id) => atual.has(id));
  }, primeira);
}

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
 * Lista os lançamentos com paginação server-side (count exato), o nome da
 * categoria e do fornecedor resolvidos e a contagem de parcelas. Todos os
 * filtros de `ListarLancamentosParams` são aplicados no banco.
 */
export async function listarLancamentos(
  params: ListarLancamentosParams,
): Promise<LancamentosPagina> {
  const supabase = await createClient();

  const pagina = Math.max(0, params.pagina);
  const tamanho = Math.max(1, params.tamanho);
  const de = pagina * tamanho;
  const ate = de + tamanho - 1;

  // Filtros que moram em tabela filha (parcela, rateio) viram lista de ids.
  // Não dá para filtrar pelo join embutido no select: ele é o que alimenta a
  // coluna "Revisão", e filtrá-lo esconderia parcelas do cálculo.
  // Uma leitura do relógio para a consulta toda: serve o filtro de atraso e o
  // cálculo por linha. Com duas chamadas de `dataHojeISO()`, uma consulta que
  // virasse a meia-noite filtraria por um dia e classificaria as linhas pelo
  // outro, e o filtro "vencidos" traria linha que a coluna mostra em dia.
  const hojeISO = dataHojeISO();

  const listasDeIds: string[][] = [];
  if (params.revisao) {
    listasDeIds.push(await idsPorRevisao(supabase, params.revisao));
  }
  if (params.atraso) {
    listasDeIds.push(await idsPorAtraso(supabase, params.atraso, hojeISO));
  }
  if (params.contaBancariaId) {
    listasDeIds.push(
      await idsPorContaBancaria(supabase, params.contaBancariaId),
    );
  }
  if (params.centroCustoId) {
    listasDeIds.push(await idsPorCentroCusto(supabase, params.centroCustoId));
  }

  let idsFiltrados: string[] | null = null;
  if (listasDeIds.length > 0) {
    idsFiltrados = intersecao(listasDeIds);
    // Nenhum lançamento no filtro: devolve vazio sem ir buscar a lista toda.
    if (idsFiltrados.length === 0) return { itens: [], total: 0 };
  }

  let consulta = supabase
    .from("lancamentos")
    .select(
      `id, numero, tipo, origem, descricao, valor, data_vencimento, status,
       data_compra, mes_competencia, created_at,
       categorias_financeiras(nome),
       fornecedores(razao_social, nome_fantasia),
       lancamento_parcelas(
         status, conta_bancaria_id, valor, valor_liquido, desconto,
         data_vencimento
       )`,
      { count: "exact" },
    )
    .order("data_compra", { ascending: false })
    .order("created_at", { ascending: false })
    // Desempate por id, que é único: sem ele a ordem de lançamentos com a MESMA
    // data de compra e o mesmo created_at fica a critério do Postgres, e pode
    // sair diferente entre uma página e a seguinte — a página 2 repete uma linha
    // e some com outra. Não é hipótese: a carga do Mais Controle gravou milhares
    // de lançamentos na mesma transação, então created_at empatado é o normal
    // aqui. Vale para a paginação da tela e para a leitura completa da
    // exportação, que percorre página por página.
    .order("id", { ascending: false })
    .range(de, ate);

  if (idsFiltrados) consulta = consulta.in("id", idsFiltrados);
  if (params.tipo) consulta = consulta.eq("tipo", params.tipo);
  if (params.status) consulta = consulta.eq("status", params.status);
  if (params.mesCompetencia) {
    consulta = consulta.eq("mes_competencia", params.mesCompetencia);
  }
  if (params.fornecedorId) {
    consulta = consulta.eq("fornecedor_id", params.fornecedorId);
  }
  if (params.categoriaId) {
    consulta = consulta.eq("categoria_id", params.categoriaId);
  }
  if (params.formaPagamentoId) {
    consulta = consulta.eq("forma_pagamento_id", params.formaPagamentoId);
  }
  if (params.origem) consulta = consulta.eq("origem", params.origem);
  if (params.valorDe !== undefined) {
    consulta = consulta.gte("valor", params.valorDe);
  }
  if (params.valorAte !== undefined) {
    consulta = consulta.lte("valor", params.valorAte);
  }
  if (params.vencimentoDe) {
    consulta = consulta.gte("data_vencimento", params.vencimentoDe);
  }
  if (params.vencimentoAte) {
    consulta = consulta.lte("data_vencimento", params.vencimentoAte);
  }
  if (params.compraDe) consulta = consulta.gte("data_compra", params.compraDe);
  if (params.compraAte) consulta = consulta.lte("data_compra", params.compraAte);
  if (params.criadoDe) {
    consulta = consulta.gte("created_at", inicioDoDiaISO(params.criadoDe));
  }
  if (params.criadoAte) {
    // Fim do dia = meia-noite do dia seguinte, exclusiva: `lte` na data crua
    // deixaria de fora tudo que foi criado depois de 00:00 do último dia.
    consulta = consulta.lt("created_at", inicioDoDiaISO(params.criadoAte, 1));
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
    const parcelas = lancamento.lancamento_parcelas ?? [];
    // Parcela PAGA conta como resolvida: pagar exige conta bancária, então ela é o
    // caso mais resolvido que existe. Antes as pagas eram descartadas aqui, e o
    // lançamento quitado caía em "não se aplica" mostrando "-" na coluna, como se a
    // pergunta não valesse para ele, justamente no caso em que a resposta é o
    // melhor possível. Tem que casar com `idsPorRevisao`, senão o filtro traz um
    // conjunto e a coluna mostra outro.
    const comConta = parcelas.filter(
      (parcela) =>
        parcela.status === "pago" || parcela.conta_bancaria_id !== null,
    ).length;

    const revisao: LancamentoLista["revisao"] =
      lancamento.tipo !== "a_pagar" || parcelas.length === 0
        ? "nao-se-aplica"
        : comConta === 0
          ? "sem-conta"
          : comConta === parcelas.length
            ? "revisado"
            : "parcial";

    const dinheiro = dinheiroDasParcelas(
      parcelas.map((parcela) => ({
        status: parcela.status,
        valor: parcela.valor,
        valorLiquido: parcela.valor_liquido,
        desconto: parcela.desconto,
        dataVencimento: parcela.data_vencimento,
      })),
      hojeISO,
    );

    return {
      revisao,
      ...dinheiro,
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
      qtdParcelas: parcelas.length,
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

/**
 * Teto de linhas lidas para o resumo.
 *
 * Mesmo espírito do teto da exportação, e o mesmo número: passando dele o resumo
 * diz "refine o filtro" em vez de varrer o banco a cada carregamento de tela. Hoje
 * a base inteira (5.848 lançamentos) cabe com folga.
 */
export const LIMITE_RESUMO = 25_000;

/** Resumo do filtro, mais o aviso de quando ele não pôde ser calculado. */
export type ResultadoResumo =
  | { ok: true; resumo: ResumoLancamentos }
  | { ok: false; motivo: "acima-do-teto" | "leitura-incompleta"; total: number };

/**
 * Resumo do conjunto FILTRADO inteiro, para os cartões do cabeçalho.
 *
 * Lê pelo mesmo `listarLancamentos` da tela, em páginas, e soma no
 * `resumirLancamentos`. É a única forma de garantir que o cartão e a lista falem
 * do mesmo conjunto: um `sum()` em SQL seria mais rápido, mas ganharia uma cópia
 * própria dos filtros (incluindo os derivados de parcela e rateio) e divergiria
 * da lista no primeiro filtro novo.
 *
 * Leitura incompleta NÃO virá arredondada para baixo: devolve `ok: false` para a
 * tela dizer que não deu, em vez de mostrar um total de dinheiro menor que o real
 * com cara de certo.
 */
export async function resumoLancamentos(
  params: Omit<ListarLancamentosParams, "pagina" | "tamanho">,
): Promise<ResultadoResumo> {
  const { itens, total } = await lerLancamentosEmPaginas(
    (pagina, tamanho) => listarLancamentos({ ...params, pagina, tamanho }),
    LIMITE_RESUMO,
    PAGINA_LEITURA,
  );

  if (total > LIMITE_RESUMO) {
    return { ok: false, motivo: "acima-do-teto", total };
  }
  if (itens.length < total) {
    return { ok: false, motivo: "leitura-incompleta", total };
  }
  return { ok: true, resumo: resumirLancamentos(itens) };
}
