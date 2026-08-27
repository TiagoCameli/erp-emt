import "server-only";

import {
  eventosDoAuditLog,
  type EventoTrilha,
  type RegistroAuditLog,
} from "@/components/canonicos";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { resolverNomesAuditLog } from "@/lib/trilha-nomes";
import { contarAnexosPorDocumento } from "@/modules/_shared/anexos/queries";
import type { TipoFormaPagamento } from "@/modules/_shared/forma-pagamento";
import type { StatusOC } from "@/modules/compras/_shared/formato";
import type { AjustesDaOrdem } from "@/modules/compras/ordens/calculo";
import { rotuloDoCartao } from "@/modules/cadastros/cartoes/schemas";
import { ehParcelaAberta } from "@/modules/financeiro/_shared/formato";
import {
  idsFornecedoresPorNome,
  inicioDoDiaISO,
  padraoBusca,
} from "@/modules/compras/_shared/lista";
import type {
  FiltroAutoriaOC,
  FiltroNotaOC,
  FiltroOrigemOC,
} from "@/modules/compras/ordens/filtros";

/** Client de servidor (mesmo tipo que `createClient()` de `@/lib/supabase/server` devolve). */
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Filtros e paginação da listagem de ordens de compra. Todos os filtros são
 * aplicados no banco: a paginação é server-side, então filtrar só a página
 * carregada mostraria "3 resultados" quando existem trezentos.
 */
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
  /** Categoria financeira do custo. */
  categoriaId?: string;
  /** Forma de pagamento (o método: PIX, boleto, cartão...). */
  formaPagamentoId?: string;
  /** Condição de pagamento (o prazo: à vista, 30/60...). */
  condicaoPagamentoId?: string;
  /** Faixa de valor total da OC, em reais (inclusive nas duas pontas). */
  valorDe?: number;
  valorAte?: number;
  /** Período de criação no sistema (created_at), yyyy-mm-dd. */
  criadaDe?: string;
  criadaAte?: string;
  /** Centro de custo de algum item da OC. */
  centroCustoId?: string;
  /** Insumo comprado em algum item da OC. */
  insumoId?: string;
  /** OC com ou sem nota fiscal registrada (recebimento). */
  nota?: FiltroNotaOC;
  /** OC gerada de cotação ou emitida direto. */
  origem?: FiltroOrigemOC;
  /** Recorte por autoria. Só vale junto com `usuarioLogadoId`. */
  autoria?: FiltroAutoriaOC;
  /** Quem está olhando a lista, para o filtro de autoria. */
  usuarioLogadoId?: string;
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
  /** O que foi comprado, em uma linha. Nulo nas OCs anteriores ao campo. */
  descricao: string | null;
  /** Nome da categoria financeira do custo, resolvido por join. */
  categoriaNome: string | null;
  valorTotal: number;
  status: string;
  /** O fato: quando a compra aconteceu. */
  dataCompra: string;
  /** Mês de referência (dia 1), que define em que mês o custo entra. */
  mesCompetencia: string;
  condicaoPagamentoDescricao: string | null;
  /**
   * Como a ordem é paga. Com uma forma, o nome dela; com DUAS ou mais, "2
   * formas", porque o `forma_pagamento_id` do cabeçalho é nulo de propósito
   * nesse caso e a célula vazia diria "sem forma" para uma ordem que tem duas.
   */
  formaPagamentoNome: string | null;
  cotacaoNumero: string | null;
  /**
   * Número do documento do fornecedor (nota fiscal, boleto, recibo). Digitado
   * desde a criação; o recebimento confirma e sobrescreve. Não confundir com
   * `numero`, que é o número da OC no sistema.
   */
  numeroDocumento: string | null;
  /** Quantidade de anexos, para a lista sinalizar quem tem documento junto. */
  anexos: number;
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
  /**
   * Insumo sem categoria de custo (categoria financeira) no cadastro.
   *
   * `fn_aprovar_ordem_compra` recusa a OC inteira quando isto é verdade em
   * qualquer item — e o campo não vive na OC, vive no cadastro do insumo.
   * Sem este sinal a tela só avisava no clique de Aprovar, sem dizer QUAL item
   * estava travando.
   */
  semCategoriaCusto: boolean;
}

/** Lançamento financeiro vinculado à OC (origem='oc'). Read-only nas telas. */
export interface LancamentoVinculado {
  id: string;
  numero: string | null;
  status: string;
  valor: number;
  dataVencimento: string | null;
  /**
   * Quanto ainda falta pagar, somado pelas PARCELAS.
   *
   * O selo de status precisa disto: um lançamento `aprovado` com saldo aberto
   * tem que ler "A pagar", e não "Aprovado" em verde — que é como a tela dizia
   * que R$ 9,8 milhões de dívida estavam resolvidos.
   */
  aberto: number;
}

/** Parcela definida na OC (tabela oc_parcelas). */
export interface OrdemParcela {
  numeroParcela: number;
  dataVencimento: string;
  valor: number;
  /** De qual forma esta parcela sai. Nulo na ordem sem formas declaradas. */
  formaPagamentoId: string | null;
}

/**
 * Uma forma de pagamento da ordem, com quanto sai por ela.
 *
 * A ordem pode ter VÁRIAS (20/08/2026). Com uma só, o `formaPagamentoId` do
 * cabeçalho também guarda ela; com duas ou mais o cabeçalho fica nulo, porque
 * não existe "a forma" da ordem.
 */
export interface OrdemForma {
  id: string;
  formaPagamentoId: string;
  formaPagamentoNome: string;
  /** Qual cartão pagou esta parte. Nulo em tudo que não é cartão de crédito. */
  cartaoId: string | null;
  /** "Cartão obra (7712)", já montado: a tela e o espelho leem o mesmo texto. */
  cartaoRotulo: string | null;
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
  /** O que foi comprado, em uma linha. Nulo nas OCs anteriores ao campo. */
  descricao: string | null;
  categoriaId: string | null;
  categoriaNome: string | null;
  valorTotal: number;
  /**
   * Ajustes do rodapé da OC. Zero em tudo que a tela cria; diferentes de zero
   * nas ordens vindas do Mais Controle. O `valorTotal` já vem do banco com eles
   * embutidos — quem soma é a trigger, nunca o app.
   */
  ajustes: AjustesDaOrdem;
  status: string;
  motivoRejeicao: string | null;
  dataCompra: string;
  mesCompetencia: string;
  /** Data de sistema (created_at), imutável: a tela mostra como texto. */
  criadoEm: string;
  /**
   * Número do documento do fornecedor (nota fiscal, boleto, recibo). Editável
   * enquanto a OC está em rascunho ou pendente; depois disso quem grava é o
   * recebimento.
   */
  numeroDocumento: string | null;
  observacoes: string | null;
  itens: OrdemItem[];
  /** Vazio quando a OC não tem parcelas definidas (serão definidas no lançamento). */
  parcelas: OrdemParcela[];
  /** As formas de pagamento e quanto sai por cada uma. */
  formas: OrdemForma[];
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

// Centro de custo vive em `_shared`: a mesma consulta e o mesmo tipo estavam
// duplicados aqui e em outro módulo, e agora a hierarquia (pai e tipo) entrou
// neles para a escolha em dois passos. Duas cópias divergiriam na primeira
// mudança.
export {
  listarCentrosCusto,
  type CentroCustoOpcao,
} from "@/modules/_shared/centro-custo/queries";

/**
 * Prefill de uma OC gerada a partir de uma cotação finalizada: fornecedor
 * vencedor, condição/forma de pagamento dele, descrição e categoria do custo já
 * classificadas na cotação, e os itens que ele cotou. Não traz centro de custo
 * (a cotação não tem): o usuário atribui na tela antes de criar a OC.
 */
export interface PrefillOrdemCotacao {
  cotacaoId: string;
  cotacaoNumero: string | null;
  fornecedorId: string;
  condicaoPagamentoId: string | null;
  formaPagamentoId: string | null;
  /** Descrição da cotação: a compra é a mesma, não faz sentido redigitar. */
  descricao: string | null;
  categoriaId: string | null;
  itens: { insumoId: string; quantidade: number; precoUnitario: number }[];
}

/**
 * Opção de categoria financeira para o select da OC. Declarada aqui, e não
 * importada de Financeiro, para Compras não depender de outro módulo.
 */
export interface CategoriaOpcao {
  id: string;
  nome: string;
}

/**
 * Condição de pagamento vem do catálogo compartilhado: a lista da OC é
 * exatamente a mesma da cotação e do lançamento avulso, por construção.
 */
export type { CondicaoPagamentoOpcao } from "@/modules/_shared/condicao-pagamento/regras";
export { listarCondicoesPagamento } from "@/modules/_shared/condicao-pagamento/queries";

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
 * o nome do fornecedor resolvido (join). Todos os filtros de
 * `ListarOrdensParams` são aplicados aqui, no banco. O valor_total vem do banco
 * (trigger), nunca recalculado no app.
 *
 * O select também traz condição e forma de pagamento, cotação de origem e
 * criação: são as colunas opcionais da tabela, todas por join no mesmo
 * round-trip. O número do documento é coluna da própria OC.
 *
 * `oc_itens` e `recebimentos` entram no select sempre, mesmo sem filtro ligado,
 * porque o PostgREST só aceita filtrar por um relacionamento que está no select
 * (`oc_itens.centro_custo_id=eq...`, `recebimentos=is.null`). São embeds à
 * esquerda e minúsculos, então não escondem nem duplicam linha: OC sem item
 * continua aparecendo. Trocar o select conforme o filtro faria a inferência de
 * tipo do supabase-js cair, e a lista da página tem 25 linhas.
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
      `id, numero, numero_documento, descricao, valor_total, status, data_compra,
       mes_competencia, created_at, created_by,
       fornecedores(razao_social, nome_fantasia),
       categorias_financeiras(nome),
       condicoes_pagamento(descricao),
       formas_pagamento(nome),
       cotacoes(numero),
       recebimentos(id),
       oc_formas(id),
       oc_itens(id)`,
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
  if (params.categoriaId) {
    consulta = consulta.eq("categoria_id", params.categoriaId);
  }
  if (params.formaPagamentoId) {
    consulta = consulta.eq("forma_pagamento_id", params.formaPagamentoId);
  }
  if (params.condicaoPagamentoId) {
    consulta = consulta.eq("condicao_pagamento_id", params.condicaoPagamentoId);
  }
  if (params.valorDe !== undefined) {
    consulta = consulta.gte("valor_total", params.valorDe);
  }
  if (params.valorAte !== undefined) {
    consulta = consulta.lte("valor_total", params.valorAte);
  }
  // created_at é timestamptz: o dia do usuário começa às 05:00 UTC (Rio Branco),
  // então a ponta final é `lt` da meia-noite do dia seguinte.
  if (params.criadaDe) {
    consulta = consulta.gte("created_at", inicioDoDiaISO(params.criadaDe));
  }
  if (params.criadaAte) {
    consulta = consulta.lt("created_at", inicioDoDiaISO(params.criadaAte, 1));
  }
  // Centro de custo e insumo vivem no item, não na OC: o filtro cai no embed e o
  // `oc_itens=not.is.null` é o que descarta a OC sem nenhum item batendo (mesmo
  // efeito de um !inner, sem precisar mudar o select).
  if (params.centroCustoId) {
    consulta = consulta.eq("oc_itens.centro_custo_id", params.centroCustoId);
  }
  if (params.insumoId) {
    consulta = consulta.eq("oc_itens.insumo_id", params.insumoId);
  }
  if (params.centroCustoId || params.insumoId) {
    consulta = consulta.not("oc_itens", "is", null);
  }
  // recebimentos tem unique(ordem_compra_id): o embed é 1-para-1, então nulo
  // significa exatamente "nota fiscal ainda não registrada".
  if (params.nota === "com") {
    consulta = consulta.not("recebimentos", "is", null);
  }
  if (params.nota === "sem") consulta = consulta.is("recebimentos", null);
  if (params.origem === "cotacao") {
    consulta = consulta.not("cotacao_id", "is", null);
  }
  if (params.origem === "direta") consulta = consulta.is("cotacao_id", null);
  if (params.autoria === "minhas" && params.usuarioLogadoId) {
    consulta = consulta.eq("created_by", params.usuarioLogadoId);
  }

  if (params.busca) {
    const padrao = padraoBusca(params.busca);
    const idsFornecedores = await idsFornecedoresPorNome(supabase, padrao);
    // O número do documento entra na busca junto com o da OC: quem tem a nota
    // na mão procura pelo número dela, não pelo número que o sistema deu.
    const clausulas = [
      `numero.ilike.${padrao}`,
      `numero_documento.ilike.${padrao}`,
    ];
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
  const [nomesCriadores, quitadasSemNota, anexosPorOrdem] = await Promise.all([
    nomesDosCriadores(
      supabase,
      linhas.map((ordem) => ordem.created_by),
    ),
    ordensQuitadasSemNota(
      supabase,
      linhas.filter((ordem) => ordem.status === "aprovado").map((o) => o.id),
    ),
    contarAnexosPorDocumento(
      "ordem_compra",
      linhas.map((ordem) => ordem.id),
    ),
  ]);

  const itens: OrdemLista[] = linhas.map((ordem) => ({
    id: ordem.id,
    numero: ordem.numero,
    fornecedorNome: ordem.fornecedores
      ? nomeFornecedor(ordem.fornecedores)
      : "-",
    descricao: ordem.descricao,
    categoriaNome: ordem.categorias_financeiras?.nome ?? null,
    valorTotal: ordem.valor_total,
    status: ordem.status,
    dataCompra: ordem.data_compra,
    mesCompetencia: ordem.mes_competencia,
    condicaoPagamentoDescricao: ordem.condicoes_pagamento?.descricao ?? null,
    formaPagamentoNome:
      ordem.formas_pagamento?.nome ??
      ((ordem.oc_formas?.length ?? 0) > 1
        ? `${ordem.oc_formas.length} formas`
        : null),
    cotacaoNumero: ordem.cotacoes?.numero ?? null,
    numeroDocumento: ordem.numero_documento,
    anexos: anexosPorOrdem[ordem.id] ?? 0,
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
       categoria_id, descricao,
       valor_total, frete, outras_despesas, impostos, desconto,
       status, motivo_rejeicao, data_compra, mes_competencia,
       created_at, numero_documento, observacoes,
       fornecedores(razao_social, nome_fantasia),
       categorias_financeiras(nome),
       cotacoes(numero),
       condicoes_pagamento(descricao),
       oc_itens(
         id, insumo_id, quantidade, preco_unitario, centro_custo_id,
         insumos(nome, categoria_financeira_id, unidades_medida(sigla)),
         centros_custo(nome, codigo)
       ),
       oc_parcelas(numero_parcela, data_vencimento, valor, oc_forma_id),
       oc_formas(id, valor, forma_pagamento_id, cartao_id, formas_pagamento(nome), cartoes_credito(nome, ultimos_digitos))`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !ordem) return null;

  const { data: lancamento } = await supabase
    .from("lancamentos")
    // As parcelas entram para o selo de status saber se ainda há saldo: sem
    // isso, um lançamento aprovado e não pago aparece aqui como resolvido.
    .select(
      "id, numero, status, valor, data_vencimento, lancamento_parcelas(status, valor)",
    )
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
    semCategoriaCusto: item.insumos?.categoria_financeira_id == null,
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
    descricao: ordem.descricao,
    categoriaId: ordem.categoria_id,
    categoriaNome: ordem.categorias_financeiras?.nome ?? null,
    valorTotal: ordem.valor_total,
    ajustes: {
      frete: ordem.frete,
      outrasDespesas: ordem.outras_despesas,
      impostos: ordem.impostos,
      desconto: ordem.desconto,
    },
    status: ordem.status,
    motivoRejeicao: ordem.motivo_rejeicao,
    dataCompra: ordem.data_compra,
    mesCompetencia: ordem.mes_competencia,
    criadoEm: ordem.created_at,
    numeroDocumento: ordem.numero_documento,
    observacoes: ordem.observacoes,
    itens,
    parcelas: (ordem.oc_parcelas ?? [])
      .map((parcela) => ({
        numeroParcela: parcela.numero_parcela,
        dataVencimento: parcela.data_vencimento,
        valor: parcela.valor,
        // A parcela guarda o id do BLOCO; a tela trabalha com o id da FORMA,
        // que é o que o seletor mostra. A tradução é por aqui.
        formaPagamentoId:
          (ordem.oc_formas ?? []).find(
            (forma) => forma.id === parcela.oc_forma_id,
          )?.forma_pagamento_id ?? null,
      }))
      .sort((a, b) => a.numeroParcela - b.numeroParcela),
    // Maior valor primeiro: é como a pessoa lê a divisão ("a maior parte sai no
    // boleto").
    formas: (ordem.oc_formas ?? [])
      .map((forma) => ({
        id: forma.id,
        formaPagamentoId: forma.forma_pagamento_id,
        formaPagamentoNome: forma.formas_pagamento?.nome ?? "-",
        cartaoId: forma.cartao_id,
        cartaoRotulo: forma.cartoes_credito
          ? rotuloDoCartao({
              nome: forma.cartoes_credito.nome,
              ultimosDigitos: forma.cartoes_credito.ultimos_digitos,
            })
          : null,
        valor: forma.valor,
      }))
      .sort((a, b) => b.valor - a.valor),
    lancamento: lancamento
      ? {
          id: lancamento.id,
          numero: lancamento.numero,
          status: lancamento.status,
          valor: lancamento.valor,
          dataVencimento: lancamento.data_vencimento,
          /** Quanto ainda falta pagar, somado pelas parcelas. */
          aberto: (lancamento.lancamento_parcelas ?? [])
            .filter((parcela) => ehParcelaAberta(parcela.status))
            .reduce((soma, parcela) => soma + parcela.valor, 0),
        }
      : null,
  };
}

/** Fornecedores ativos para o select da OC, em ordem alfabética. */
export async function listarFornecedores(): Promise<FornecedorOpcao[]> {
  const supabase = await createClient();

  // Pagina até o fim, pelo mesmo motivo dos insumos: o PostgREST corta em 1.000
  // sem avisar, e a EMT já tem 942 fornecedores ativos. Ao passar de mil, o
  // fornecedor cortado não apareceria nem digitando (a busca do Combobox roda
  // sobre o que chegou), e a OC dele mostraria o id no lugar do nome.
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("fornecedores")
      .select("id, razao_social, nome_fantasia")
      .eq("ativo", true)
      .order("razao_social")
      .order("id")
      .range(de, ate),
  );

  if (erro) {
    throw new Error("Não foi possível carregar os fornecedores");
  }

  return linhas.map((fornecedor) => ({
    id: fornecedor.id,
    nome: nomeFornecedor(fornecedor),
  }));
}

/** Insumos ativos para o select dos itens, com a sigla da unidade. */
export async function listarInsumos(): Promise<InsumoOpcao[]> {
  const supabase = await createClient();

  // Pagina até o fim: o PostgREST corta em 1.000 e a EMT tem mais de 3 mil
  // insumos ativos. Sem isto, o resto do catálogo não aparece na OC nem
  // digitando, porque a busca do Combobox roda sobre o que chegou.
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("insumos")
      .select("id, nome, unidades_medida(sigla)")
      .eq("ativo", true)
      .order("nome")
      .range(de, ate),
  );

  if (erro) {
    throw new Error("Não foi possível carregar os insumos");
  }

  return linhas.map((insumo) => ({
    id: insumo.id,
    nome: insumo.nome,
    unidade: insumo.unidades_medida?.sigla ?? null,
  }));
}


/**
 * Categorias de despesa ativas para o select da OC, em ordem alfabética. Só
 * tipo 'despesa': uma ordem de compra é sempre custo, então categoria de
 * receita na lista só atrapalharia quem está classificando a compra.
 */
export async function listarCategoriasCusto(): Promise<CategoriaOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categorias_financeiras")
    .select("id, nome")
    .eq("ativo", true)
    .eq("tipo", "despesa")
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as categorias do custo");
  }

  return (data ?? []).map((categoria) => ({
    id: categoria.id,
    nome: categoria.nome,
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
    .select(
      "id, numero, status, vencedor_fornecedor_id, descricao, categoria_id",
    )
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
    descricao: cotacao.descricao,
    categoriaId: cotacao.categoria_id,
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
function statusDoAuditLog(
  dados: RegistroAuditLog["dados_depois"],
): string | undefined {
  if (!dados || typeof dados !== "object" || Array.isArray(dados))
    return undefined;
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
    const { data: usuarios } = await supabase.rpc("nomes_usuarios_auditoria", {
      p_ids: idsUsuarios,
    });
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
      linha.dados_depois &&
      typeof linha.dados_depois === "object" &&
      !Array.isArray(linha.dados_depois)
        ? (linha.dados_depois as Record<string, unknown>)
        : {};
    const valor =
      typeof depois.valor === "number" || typeof depois.valor === "string"
        ? depois.valor
        : null;
    const dataVencimento =
      typeof depois.data_vencimento === "string"
        ? depois.data_vencimento
        : null;
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
