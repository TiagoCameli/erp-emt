import "server-only";

import { aplicarBusca } from "@/lib/busca";
import { emLotes, LOTE_IDS_POSTGREST } from "@/lib/lotes-de-ids";
import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { ORIGEM_APLICACAO } from "@/modules/financeiro/lancamentos/schemas";
import {
  arvoreDeCentrosDeCusto,
  subarvoreDosCentros,
} from "@/modules/financeiro/lancamentos/queries";
import {
  centroEEtapaDoRateio,
  raizIdDoRateio,
} from "@/modules/financeiro/lancamentos/hierarquia-centro";
import type { RecebimentoPlanilha } from "@/modules/financeiro/recebimentos/planilha";
import {
  facetasNoServidor,
  type FacetasPresentes,
} from "@/modules/_shared/filtros-facetados";
import {
  nomesDoRateio,
  rotuloCentroCusto,
} from "@/modules/financeiro/_shared/centro-de-custo";
import {
  ROTULO_BANCO,
  SEM_CENTRO_DE_CUSTO,
  STATUS_PARCELA_ABERTA,
  type BancoConta,
  type StatusParcela,
} from "@/modules/financeiro/_shared/formato";

/**
 * Leitura da aba Financeiro > Recebimentos.
 *
 * Espelha `pagamentos/queries.ts` de propósito, inclusive nos cuidados: a aba "A
 * receber" traz TODAS as linhas (paginando acima do teto de mil do PostgREST)
 * porque os cards do topo somam o conjunto inteiro; a aba "Recebidos" é paginada
 * no banco e por isso TODO filtro dela vai ao banco.
 *
 * Cuidado com o nome: existe uma tabela `recebimentos` no banco, e ela é OUTRA
 * coisa — é o recebimento de MATERIAL de uma ordem de compra (a nota que chega
 * com a mercadoria), do domínio de Compras. Este módulo é recebimento de
 * DINHEIRO: parcelas de lançamentos com `tipo = 'a_receber'`. Nada aqui lê aquela
 * tabela.
 */

/** Parcela a receber, ainda em aberto. */
export interface ParcelaAReceber {
  id: string;
  lancamentoId: string;
  lancamentoNumero: string | null;
  numeroParcela: number;
  descricao: string;
  /** Categoria de receita do lançamento, exibida junto da descrição. */
  categoriaNome: string | null;
  /** Número da nota, medição ou contrato. Obrigatório desde 19/08/2026. */
  numeroDocumento: string | null;
  /** Quem está pagando. */
  clienteId: string | null;
  clienteNome: string;
  /** Conta em que o dinheiro vai entrar, escolhida no lançamento. */
  contaBancariaId: string | null;
  contaBancariaNome: string;
  dataVencimento: string | null;
  valor: number;
  status: StatusParcela;
  /**
   * Centro de custo do lançamento: o nome quando é um, "N centros de custo"
   * quando rateia. Mesma regra de Pagamentos e Lançamentos
   * (`_shared/centro-de-custo.ts`): as três telas falam do mesmo lançamento.
   */
  centroCustoRotulo: string | null;
  centroCustoNomes?: string;
  /** Categoria de receita, para o filtro comparar id e não nome. */
  categoriaId: string | null;
  /** Primeiro dia do mês de competência (yyyy-MM-01), ou null. */
  mesCompetencia: string | null;
  /**
   * TODOS os centros do rateio, para o filtro de centro casar quando a receita
   * é dividida. Mesma regra da fila de Pagamentos.
   */
  centroCustoIds: string[];
}

/** Parcela já recebida, para a aba "Recebidos". */
export interface ParcelaRecebida {
  id: string;
  lancamentoId: string;
  lancamentoNumero: string | null;
  numeroParcela: number;
  descricao: string;
  categoriaNome: string | null;
  numeroDocumento: string | null;
  clienteNome: string;
  contaBancariaNome: string;
  dataVencimento: string | null;
  dataRecebimento: string | null;
  /** Valor devido da parcela. Desconto e juros não o reescrevem. */
  valor: number;
  /** Desconto concedido. Zero quando não houve. */
  desconto: number;
  /** Juros e multa cobrados no atraso. Zero quando não houve. */
  juros: number;
  /** Valor menos desconto mais juros: o que ENTROU na conta bancária. */
  valorLiquido: number;
  /** Centro de custo do lançamento, pela regra de `_shared/centro-de-custo.ts`. */
  centroCustoRotulo: string | null;
  centroCustoNomes?: string;
}

/**
 * Filtros da aba "Recebidos". Todos vão ao banco: a paginação é server-side, e
 * filtrar só a página carregada faria a tela mentir sobre quantos recebimentos
 * existem.
 */
export interface FiltrosRecebidas {
  /** Número do lançamento, número do documento ou descrição. */
  busca?: string;
  clienteId?: string;
  contaBancariaId?: string;
  categoriaId?: string;
  /**
   * Centros de custo efetivos (raízes ou etapas). A consulta expande a
   * SUBÁRVORE de cada um antes de filtrar, com a MESMA função de Lançamentos e
   * Pagamentos (`subarvoreDosCentros`): escolher a obra traz as etapas dela.
   */
  centroCustoIds?: string[];
  /** yyyy-MM-01, primeiro dia do mês de competência do lançamento. */
  mesCompetencia?: string;
  /** Faixa de valor da parcela, em reais (comparação gte/lte no banco). */
  valorDe?: number;
  valorAte?: number;
  /** Períodos em yyyy-MM-dd; ponta vazia é sem limite naquele lado. */
  vencimentoDe?: string;
  vencimentoAte?: string;
  recebimentoDe?: string;
  recebimentoAte?: string;
}

/** Página da aba "Recebidos". */
export interface RecebidasPagina {
  itens: ParcelaRecebida[];
  total: number;
}

/** Opção de categoria de receita para o formulário e o filtro. */
export interface CategoriaReceitaOpcao {
  id: string;
  nome: string;
}

/** Nome de exibição do cliente: fantasia quando existe, senão o nome. */
function nomeCliente(
  cliente: { nome: string; nome_fantasia: string | null } | null,
): string {
  if (!cliente) return "-";
  return cliente.nome_fantasia ?? cliente.nome;
}

/** Rótulo da conta: nome + banco (ex: "Conta movimento - Sicredi"). */
function rotuloConta(nome: string, banco: string): string {
  const rotuloBanco = ROTULO_BANCO[banco as BancoConta] ?? banco;
  return `${nome} - ${rotuloBanco}`;
}

/** Linha crua de parcela a receber, como o PostgREST devolve. */
interface LinhaAReceber {
  id: string;
  numero_parcela: number;
  valor: number;
  status: string;
  data_vencimento: string | null;
  lancamento_id: string;
  conta_bancaria_id: string | null;
  contas_bancarias: { nome: string; banco: string } | null;
  lancamentos: {
    numero: string | null;
    descricao: string | null;
    numero_documento: string | null;
    cliente_id: string | null;
    categoria_id: string | null;
    mes_competencia: string | null;
    categorias_financeiras: { nome: string } | null;
    clientes: { nome: string; nome_fantasia: string | null } | null;
    lancamento_rateios:
      | {
          centro_custo_id: string | null;
          centros_custo: { nome: string } | null;
        }[]
      | null;
  } | null;
}

/** Linha crua de parcela recebida. */
interface LinhaRecebida extends LinhaAReceber {
  data_pagamento: string | null;
  desconto: number | null;
  juros: number | null;
  valor_liquido: number | null;
}

const SELECT_A_RECEBER = `id, numero_parcela, valor, status, data_vencimento,
   lancamento_id, conta_bancaria_id,
   contas_bancarias(nome, banco),
   lancamentos!inner(
     numero, descricao, numero_documento, cliente_id, tipo, status,
     categoria_id, mes_competencia,
     categorias_financeiras(nome),
     clientes(nome, nome_fantasia),
     lancamento_rateios(centro_custo_id, centros_custo(nome))
   )`;

const SELECT_RECEBIDA = `id, numero_parcela, valor, status, data_vencimento,
   data_pagamento, desconto, juros, valor_liquido,
   lancamento_id, conta_bancaria_id,
   contas_bancarias(nome, banco),
   lancamentos!inner(
     numero, descricao, numero_documento, cliente_id, tipo, status, categoria_id,
     mes_competencia,
     categorias_financeiras(nome),
     clientes(nome, nome_fantasia),
     lancamento_rateios(centro_custo_id, centros_custo(nome))
   )`;

/** O rateio do embed no formato que `rotuloCentroCusto` espera. */
function rateiosDoEmbed(
  lancamento: { lancamento_rateios?: { centros_custo: { nome: string } | null }[] | null } | null,
): { centroNome: string | null }[] {
  return (lancamento?.lancamento_rateios ?? []).map((rateio) => ({
    centroNome: rateio.centros_custo?.nome ?? null,
  }));
}

/** Converte o status cru do banco num StatusParcela conhecido. */
function comoStatusParcela(status: string): StatusParcela {
  switch (status) {
    case "pendente":
    case "em_revisao":
    case "aprovado":
    case "pago":
    case "cancelado":
      return status;
    default:
      return "pendente";
  }
}

/** Parte comum da conversão de linha crua para a lista da tela. */
function comum(parcela: LinhaAReceber) {
  return {
    id: parcela.id,
    lancamentoId: parcela.lancamento_id,
    lancamentoNumero: parcela.lancamentos?.numero ?? null,
    numeroParcela: parcela.numero_parcela,
    descricao: parcela.lancamentos?.descricao ?? "-",
    categoriaNome: parcela.lancamentos?.categorias_financeiras?.nome ?? null,
    numeroDocumento: parcela.lancamentos?.numero_documento ?? null,
    clienteNome: nomeCliente(parcela.lancamentos?.clientes ?? null),
    contaBancariaNome: parcela.contas_bancarias
      ? rotuloConta(
          parcela.contas_bancarias.nome,
          parcela.contas_bancarias.banco,
        )
      : "-",
    dataVencimento: parcela.data_vencimento,
    valor: parcela.valor,
    centroCustoRotulo: rotuloCentroCusto(rateiosDoEmbed(parcela.lancamentos)),
    centroCustoNomes: nomesDoRateio(rateiosDoEmbed(parcela.lancamentos)),
  };
}

/**
 * Parcelas EM ABERTO de lançamentos a receber.
 *
 * Quem decide o que é "em aberto" é `STATUS_PARCELA_ABERTA`, e não uma lista
 * digitada aqui: status novo entra sozinho, sem esta consulta e os cards do topo
 * passarem a discordar.
 *
 * Lançamento cancelado fica fora: parcela de lançamento cancelado listada como "a
 * receber" é convite para dar como recebido o que não existe, e `fn_pagar_parcela`
 * recusaria de qualquer jeito.
 *
 * Traz TODAS as linhas porque os cards somam o conjunto inteiro e a seleção
 * atravessa as páginas da tabela: somar só a página carregada faria o card mentir
 * sobre quanto a empresa tem a receber.
 */
export async function listarParcelasAReceber(): Promise<ParcelaAReceber[]> {
  const supabase = await createClient();

  const { linhas, erro } = await todasAsLinhas<LinhaAReceber>((de, ate) =>
    supabase
      .from("lancamento_parcelas")
      .select(SELECT_A_RECEBER)
      .in("status", STATUS_PARCELA_ABERTA)
      .eq("lancamentos.tipo", "a_receber")
      .neq("lancamentos.status", "cancelado")
      // Rendimento de aplicação não é conta a receber (ver ORIGEM_APLICACAO).
      .neq("lancamentos.origem", ORIGEM_APLICACAO)
      .order("data_vencimento", { ascending: true, nullsFirst: false })
      // Desempate obrigatório: sem ele, vencimentos iguais mudam de ordem entre
      // uma faixa e a seguinte, repetindo linha numa página e perdendo em outra.
      .order("id", { ascending: true })
      .range(de, ate)
      .returns<LinhaAReceber[]>(),
  );

  if (erro) {
    throw new Error("Não foi possível carregar as contas a receber");
  }

  return linhas.map((parcela) => ({
    ...comum(parcela),
    clienteId: parcela.lancamentos?.cliente_id ?? null,
    contaBancariaId: parcela.conta_bancaria_id,
    status: comoStatusParcela(parcela.status),
    categoriaId: parcela.lancamentos?.categoria_id ?? null,
    mesCompetencia: parcela.lancamentos?.mes_competencia ?? null,
    // TODOS os centros do rateio, não o primeiro: receita dividida entre duas
    // obras tem de aparecer filtrando por qualquer uma delas.
    centroCustoIds: (parcela.lancamentos?.lancamento_rateios ?? [])
      .map((rateio) => rateio.centro_custo_id)
      .filter((id): id is string => id !== null),
  }));
}

/** O pedaço do builder do PostgREST que os filtros dos recebidos usam. */
interface ConsultaFiltravelRecebidas<T> {
  eq: (coluna: string, valor: string) => T;
  neq: (coluna: string, valor: string) => T;
  gte: (coluna: string, valor: string | number) => T;
  lte: (coluna: string, valor: string | number) => T;
  or: (filtro: string, opcoes?: { referencedTable?: string }) => T;
  in: (coluna: string, valores: readonly string[]) => T;
  not: (coluna: string, operador: string, valor: null) => T;
  like: (coluna: string, padrao: string) => T;
}

/**
 * Aplica os filtros da aba "Recebidos". Serve a lista e as facetas
 * (`facetasRecebidas`), que precisam do MESMO recorte.
 *
 * Síncrona, com a subárvore do centro já resolvida: o builder é "thenable", e uma função async o dispararia no return
 * (ver `aplicarFiltrosPagas`). `subarvore` null é "sem filtro de centro".
 */
function aplicarFiltrosRecebidas<T extends ConsultaFiltravelRecebidas<T>>(
  consultaInicial: T,
  filtros: FiltrosRecebidas,
  subarvore: readonly string[] | null,
): T {
  // Rendimento de aplicação é `a_receber` pago, mas não é recebimento: nenhum
  // cliente pagou. Fica na aba Aplicações (ver ORIGEM_APLICACAO).
  let consulta = consultaInicial.neq("lancamentos.origem", ORIGEM_APLICACAO);
  if (subarvore !== null) {
    // O par de Pagamentos (`aplicarCentroDaSubarvore`): o centro mora no rateio
    // do LANÇAMENTO, dois níveis abaixo da parcela, e filtrar embed não-inner
    // sem o `not is null` só esvazia o embed e deixa a parcela vir.
    consulta = consulta
      .in("lancamentos.lancamento_rateios.centro_custo_id", subarvore)
      .not("lancamentos.lancamento_rateios", "is", null);
  }
  if (filtros.mesCompetencia) {
    consulta = consulta.eq(
      "lancamentos.mes_competencia",
      filtros.mesCompetencia,
    );
  }
  // Busca universal (src/lib/busca.ts) na coluna computada da parcela: valor,
  // datas e conta dela mais o lançamento (documento, descrição, quem pagou,
  // categorias, centros, competência).
  consulta = aplicarBusca(consulta, filtros.busca);

  if (filtros.clienteId) {
    consulta = consulta.eq("lancamentos.cliente_id", filtros.clienteId);
  }
  if (filtros.categoriaId) {
    consulta = consulta.eq("lancamentos.categoria_id", filtros.categoriaId);
  }
  if (filtros.contaBancariaId) {
    consulta = consulta.eq("conta_bancaria_id", filtros.contaBancariaId);
  }
  // Dinheiro é NUMERIC(14,2): comparação por gte/lte, nunca por texto.
  if (filtros.valorDe !== undefined) {
    consulta = consulta.gte("valor", filtros.valorDe);
  }
  if (filtros.valorAte !== undefined) {
    consulta = consulta.lte("valor", filtros.valorAte);
  }
  if (filtros.vencimentoDe) {
    consulta = consulta.gte("data_vencimento", filtros.vencimentoDe);
  }
  if (filtros.vencimentoAte) {
    consulta = consulta.lte("data_vencimento", filtros.vencimentoAte);
  }
  if (filtros.recebimentoDe) {
    consulta = consulta.gte("data_pagamento", filtros.recebimentoDe);
  }
  if (filtros.recebimentoAte) {
    consulta = consulta.lte("data_pagamento", filtros.recebimentoAte);
  }
  return consulta;
}

/** Os filtros de seleção da aba "Recebidos", no id da barra. */
export type FacetaRecebidas = "cliente" | "conta" | "categoria" | "centro";

interface LancamentoDaFaceta {
  cliente_id: string | null;
  categoria_id: string | null;
  lancamento_rateios: { centro_custo_id: string | null }[] | null;
}

interface LinhaFacetaRecebidas {
  conta_bancaria_id: string | null;
  lancamentos: LancamentoDaFaceta | LancamentoDaFaceta[] | null;
}

/**
 * A subárvore do filtro de centro, ou null quando não há filtro.
 *
 * Lista vazia (centro que não existe mais) é diferente de null: a resposta certa
 * é lista vazia, não a lista inteira.
 */
async function subarvoreDoFiltro(
  supabase: Awaited<ReturnType<typeof createClient>>,
  centroCustoIds: readonly string[] | undefined,
): Promise<string[] | null> {
  if (!centroCustoIds || centroCustoIds.length === 0) return null;
  return subarvoreDosCentros(supabase, [...centroCustoIds]);
}

/** Qual parâmetro cada faceta solta quando calcula as próprias opções. */
const PARAMETRO_DA_FACETA: Record<FacetaRecebidas, keyof FiltrosRecebidas> = {
  cliente: "clienteId",
  conta: "contaBancariaId",
  categoria: "categoriaId",
  centro: "centroCustoIds",
};

/**
 * O que existe no histórico de recebidos filtrado, por filtro de seleção (ver
 * `_shared/filtros-facetados`). A aba é paginada no banco, então só o servidor
 * sabe quais pagadores, contas, categorias e centros sobram depois dos outros
 * filtros. O centro volta com o id CRU do rateio (etapa ou equipamento): a tela
 * sobe até a raiz para o primeiro campo e usa o cru para o de etapa.
 * Só as colunas das chaves, sem paginação: recebimento é a menor fatia das
 * parcelas.
 */
export async function facetasRecebidas(
  filtros: FiltrosRecebidas = {},
): Promise<FacetasPresentes<FacetaRecebidas>> {
  const supabase = await createClient();
  const subarvore = await subarvoreDoFiltro(supabase, filtros.centroCustoIds);
  const doLancamento = (linha: LinhaFacetaRecebidas) =>
    linha.lancamentos === null
      ? []
      : Array.isArray(linha.lancamentos)
        ? linha.lancamentos
        : [linha.lancamentos];

  return facetasNoServidor<LinhaFacetaRecebidas, FacetaRecebidas>(
    {
      cliente: {
        ativo: !!filtros.clienteId,
        chave: (linha) => doLancamento(linha).map((l) => l.cliente_id),
      },
      conta: {
        ativo: !!filtros.contaBancariaId,
        chave: (linha) => linha.conta_bancaria_id,
      },
      categoria: {
        ativo: !!filtros.categoriaId,
        chave: (linha) => doLancamento(linha).map((l) => l.categoria_id),
      },
      centro: {
        ativo: subarvore !== null,
        chave: (linha) =>
          doLancamento(linha).flatMap((l) =>
            (l.lancamento_rateios ?? []).map((r) => r.centro_custo_id),
          ),
      },
    },
    async (exceto) => {
      const recorte =
        exceto === null
          ? filtros
          : { ...filtros, [PARAMETRO_DA_FACETA[exceto]]: undefined };
      const subarvoreDoRecorte = exceto === "centro" ? null : subarvore;
      if (subarvoreDoRecorte !== null && subarvoreDoRecorte.length === 0) {
        return [];
      }
      const { linhas, erro } = await todasAsLinhas<LinhaFacetaRecebidas>(
        (de, ate) =>
          aplicarFiltrosRecebidas(
            supabase
              .from("lancamento_parcelas")
              .select(
                `conta_bancaria_id,
                 lancamentos!inner(
                   cliente_id, categoria_id,
                   lancamento_rateios(centro_custo_id)
                 )`,
              )
              .eq("status", "pago")
              .eq("lancamentos.tipo", "a_receber"),
            recorte,
            subarvoreDoRecorte,
          )
            .order("id", { ascending: true })
            .range(de, ate)
            .returns<LinhaFacetaRecebidas[]>(),
      );
      if (erro) {
        throw new Error("Não foi possível carregar os filtros dos recebimentos");
      }
      return linhas;
    },
  );
}

/**
 * Histórico paginado de parcelas recebidas, mais recentes primeiro. Resolve
 * conta, cliente e categoria via join, e aplica TODOS os filtros no banco.
 */
export async function listarParcelasRecebidas({
  pagina,
  tamanho,
  filtros = {},
}: {
  pagina: number;
  tamanho: number;
  filtros?: FiltrosRecebidas;
}): Promise<RecebidasPagina> {
  const supabase = await createClient();

  const de = pagina * tamanho;
  const ate = de + tamanho - 1;

  const subarvore = await subarvoreDoFiltro(supabase, filtros.centroCustoIds);
  // Centro que não existe mais: lista vazia, não a lista inteira.
  if (subarvore !== null && subarvore.length === 0) {
    return { itens: [], total: 0 };
  }
  const consulta = aplicarFiltrosRecebidas(
    supabase
      .from("lancamento_parcelas")
      .select(SELECT_RECEBIDA, { count: "exact" })
      .eq("status", "pago")
      .eq("lancamentos.tipo", "a_receber"),
    filtros,
    subarvore,
  );

  const { data, error, count } = await consulta
    .order("data_pagamento", { ascending: false, nullsFirst: false })
    // Desempate obrigatório: datas de recebimento empatadas mudariam de ordem
    // entre páginas, repetindo linha numa e perdendo em outra.
    .order("id", { ascending: true })
    .range(de, ate)
    .returns<LinhaRecebida[]>();

  if (error) {
    throw new Error("Não foi possível carregar os recebimentos");
  }

  const itens: ParcelaRecebida[] = (data ?? []).map((parcela) => ({
    ...comum(parcela),
    dataRecebimento: parcela.data_pagamento,
    desconto: parcela.desconto ?? 0,
    juros: parcela.juros ?? 0,
    valorLiquido: parcela.valor_liquido ?? parcela.valor,
  }));

  return { itens, total: count ?? 0 };
}

/**
 * Soma, em reais, o que ENTROU nas contas dentro do período, pelo LÍQUIDO.
 *
 * Líquido e não valor da parcela: o card responde "quanto dinheiro entrou", e é o
 * líquido (valor menos desconto mais juros) que bate com o extrato bancário e com
 * a mesma conta que o saldo da conta bancária faz.
 *
 * Lê em páginas porque um mês de recebimentos pode passar de mil parcelas quando
 * o recebível vem parcelado, e o corte do PostgREST é silencioso.
 */
export async function somarRecebidoNoPeriodo(
  de: string,
  ate: string,
): Promise<number> {
  const supabase = await createClient();

  const { linhas, erro } = await todasAsLinhas<{
    valor: number;
    valor_liquido: number | null;
  }>((inicio, fim) =>
    supabase
      .from("lancamento_parcelas")
      .select("valor, valor_liquido, id, lancamentos!inner(tipo, status, origem)")
      .eq("status", "pago")
      .eq("lancamentos.tipo", "a_receber")
      .neq("lancamentos.status", "cancelado")
      // O mesmo recorte da aba Recebidos, que este cartão abre.
      .neq("lancamentos.origem", ORIGEM_APLICACAO)
      .gte("data_pagamento", de)
      .lte("data_pagamento", ate)
      .order("id", { ascending: true })
      .range(inicio, fim),
  );

  // Zero por falha de leitura seria um card afirmando "nada entrou", que é
  // diferente de "não consegui somar": o erro sobe e a página trata.
  if (erro) {
    throw new Error("Não foi possível somar os recebimentos do período");
  }

  // Soma em centavos inteiros para o card não divergir da tabela por
  // arredondamento, igual ao resto do módulo.
  const centavos = linhas.reduce(
    (total, parcela) =>
      total + Math.round(Number(parcela.valor_liquido ?? parcela.valor) * 100),
    0,
  );
  return centavos / 100;
}

/** Uma linha crua do select da planilha, como o PostgREST devolve. */
type LinhaRecebimentoPlanilha = {
  id: string;
  numero_parcela: number;
  status: string;
  valor: number;
  desconto: number | null;
  juros: number | null;
  valor_liquido: number | null;
  data_vencimento: string | null;
  data_pagamento: string | null;
  contas_bancarias: { nome: string; banco: string } | null;
  lancamentos: {
    numero: string | null;
    numero_documento: string | null;
    descricao: string | null;
    mes_competencia: string | null;
    categorias_financeiras: { nome: string } | null;
    clientes: { nome: string; nome_fantasia: string | null } | null;
    lancamento_parcelas: { id: string }[];
    lancamento_rateios: {
      valor: number;
      centros_custo: { id: string; nome: string } | null;
    }[];
  } | null;
};

/**
 * O detalhe das parcelas que a planilha de Recebimentos exporta, por id.
 *
 * Quem escolhe os ids é a action, com os MESMOS filtros da tela; aqui só se lê o
 * que a planilha precisa e que a lista da tela não traz (valor de cada rateio,
 * raiz e etapa do centro, quantas parcelas o lançamento tem). Mesmo desenho de
 * `lerPagamentosParaPlanilha`: em lotes, porque o `in` viaja na URL.
 */
export async function lerRecebimentosParaPlanilha(
  ids: string[],
): Promise<Map<string, RecebimentoPlanilha>> {
  const porId = new Map<string, RecebimentoPlanilha>();
  if (ids.length === 0) return porId;

  const supabase = await createClient();

  const linhas: LinhaRecebimentoPlanilha[] = [];
  for (const lote of emLotes(ids, LOTE_IDS_POSTGREST)) {
    const { data, error } = await supabase
      .from("lancamento_parcelas")
      .select(
        `id, numero_parcela, status, valor, desconto, juros, valor_liquido,
         data_vencimento, data_pagamento,
         contas_bancarias(nome, banco),
         lancamentos!inner(
           numero, numero_documento, descricao, mes_competencia,
           categorias_financeiras(nome),
           clientes(nome, nome_fantasia),
           lancamento_parcelas(id),
           lancamento_rateios(valor, centros_custo(id, nome))
         )`,
      )
      .in("id", lote);

    if (error) {
      throw new Error(
        `Não foi possível carregar os recebimentos para a planilha: ${error.message}`,
      );
    }
    linhas.push(...((data ?? []) as unknown as LinhaRecebimentoPlanilha[]));
  }

  const arvore = await arvoreDeCentrosDeCusto(supabase);

  for (const linha of linhas) {
    const lancamento = linha.lancamentos;
    porId.set(linha.id, {
      id: linha.id,
      lancamentoNumero: lancamento?.numero ?? null,
      numeroDocumento: lancamento?.numero_documento ?? null,
      numeroParcela: linha.numero_parcela,
      totalParcelas: lancamento?.lancamento_parcelas?.length ?? null,
      descricao: lancamento?.descricao ?? "",
      categoriaNome: lancamento?.categorias_financeiras?.nome ?? null,
      // O mesmo nome que a tela mostra (fantasia primeiro).
      clienteNome: nomeCliente(lancamento?.clientes ?? null),
      mesCompetencia: lancamento?.mes_competencia ?? null,
      dataVencimento: linha.data_vencimento,
      dataRecebimento: linha.data_pagamento,
      contaNome: linha.contas_bancarias
        ? rotuloConta(linha.contas_bancarias.nome, linha.contas_bancarias.banco)
        : null,
      status: linha.status,
      valor: linha.valor,
      desconto: linha.desconto ?? 0,
      juros: linha.juros ?? 0,
      valorLiquido: linha.valor_liquido ?? linha.valor,
      rateios: (lancamento?.lancamento_rateios ?? []).map((rateio) => {
        const centro = rateio.centros_custo;
        const nome = centro?.nome ?? SEM_CENTRO_DE_CUSTO;
        const hierarquia = centro
          ? centroEEtapaDoRateio(centro.id, nome, arvore)
          : { raizNome: nome, etapaNome: null };
        return {
          centroId: centro?.id ?? null,
          raizId: centro ? raizIdDoRateio(centro.id, arvore) : null,
          valor: rateio.valor,
          ...hierarquia,
        };
      }),
    });
  }

  return porId;
}

/** Categorias de RECEITA ativas, em ordem alfabética. */
export async function listarCategoriasReceita(): Promise<
  CategoriaReceitaOpcao[]
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categorias_financeiras")
    .select("id, nome")
    .eq("tipo", "receita")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as categorias de receita");
  }

  return (data ?? []).map((categoria) => ({
    id: categoria.id,
    nome: categoria.nome,
  }));
}
