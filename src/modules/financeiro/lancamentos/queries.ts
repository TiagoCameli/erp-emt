import "server-only";

import { TZDate } from "@date-fns/tz";

import {
  eventosDoAuditLog,
  type EventoTrilha,
  type RegistroAuditLog,
} from "@/components/canonicos";
import { dataHojeISO, TIMEZONE } from "@/lib/formatadores";
import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { resolverNomesAuditLog } from "@/lib/trilha-nomes";
import { contarAnexosPorDocumento } from "@/modules/_shared/anexos/queries";
import { rotuloDoCartao } from "@/modules/cadastros/cartoes/schemas";
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
  COLUNA_DO_BANCO,
  DIRECAO_PADRAO,
  ORDEM_PADRAO,
  type DirecaoOrdem,
  type OrdemLancamentos,
} from "@/modules/financeiro/lancamentos/ordenacao";
import {
  nomesDoRateio,
  rotuloCentroCusto,
} from "@/modules/financeiro/_shared/centro-de-custo";
import type { Recorte } from "@/modules/financeiro/lancamentos/recorte";
import {
  emLotes,
  LOTE_IDS_POSTGREST,
} from "@/lib/lotes-de-ids";
import {
  lerLancamentosEmPaginas,
  PAGINA_LEITURA,
} from "@/modules/financeiro/lancamentos/leitura-completa";
import {
  dinheiroDasParcelas,
  escolherValorRecorte,
  resumirLancamentos,
  situacaoDeAtraso,
  type ResumoLancamentos,
} from "@/modules/financeiro/lancamentos/resumo";
import {
  paraCentavos,
  paraReais,
} from "@/modules/financeiro/relatorios/calculo";

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
  /**
   * Filtros de MÚLTIPLA escolha. Vazio (ou ausente) = todos.
   *
   * São listas porque o relatório de custo por centro de custo filtra vários de
   * cada um, e o clique numa barra dele abre esta lista: com um valor só, o drill
   * de "três fornecedores" abriria um conjunto maior que a célula clicada.
   */
  fornecedorIds?: string[];
  /** Categorias do custo (categorias_financeiras). */
  categoriaIds?: string[];
  /**
   * Centros de custo do rateio. Cada um vale pela SUBÁRVORE dele. Mora em
   * lancamento_rateios (um lançamento pode ser rateado entre vários centros),
   * então o filtro cai no embed da consulta.
   */
  centroCustoIds?: string[];
  /**
   * Conta bancária de alguma parcela do lançamento (paga ou a pagar). Mora em
   * lancamento_parcelas, então também vira consulta de ids + `in`.
   */
  contaBancariaId?: string;
  formaPagamentoIds?: string[];
  /** Inclui também os lançamentos SEM forma de pagamento informada. */
  semForma?: boolean;
  /**
   * Status LITERAIS aceitos, para o drill dos relatórios.
   *
   * Separado do `status` acima porque os dois querem coisas diferentes: `status`
   * é a situação do dinheiro (o "A pagar" da tela inclui `aprovado` com saldo em
   * aberto) e este é a coluna crua, que é o que o relatório de custo soma.
   */
  statusIn?: string[];
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
   * Faixa de MÊS DE REFERÊNCIA (mes_competencia, yyyy-MM-dd). Irmã do
   * `mesCompetencia`, que é um mês exato: esta é a janela, e existe porque o
   * relatório de centro de custo soma por período ("acumulado da obra no ano") e
   * o clique nele precisa de um destino com a mesma janela.
   */
  competenciaDe?: string;
  competenciaAte?: string;
  /**
   * Meses de referência EXATOS (yyyy-MM-01). Vazio = sem filtro.
   *
   * Existe para o drill do relatório de custo x receita, que deixa escolher meses
   * não contíguos: uma faixa (`competenciaDe`/`Ate`) traria os meses do meio que a
   * célula clicada não somou.
   */
  competenciaIn?: string[];
  /**
   * Tira os cancelados da lista. Os relatórios de custo somam
   * `status <> 'cancelado'`, e o filtro de `status` só sabe escolher UM status,
   * não excluir um.
   */
  semCancelado?: boolean;
  /**
   * Tira os previstos da lista. Irmão do `semCancelado`, para o clique num
   * relatório que está somando sem previsto abrir a MESMA fatia.
   */
  semPrevisto?: boolean;
  /**
   * Só lançamentos que a empresa ainda deve: alguma parcela em aberto (nem paga
   * nem cancelada), e o próprio lançamento não cancelado.
   *
   * É o que o filtro "A pagar" da tela passou a significar. Igualdade de status
   * (`.eq("status","a_pagar")`) trazia 86 lançamentos de R$ 1,90 mi e escondia os
   * 107 `aprovado` com R$ 9,84 mi em aberto — 84% da dívida.
   */
  comSaldoAberto?: boolean;
  /**
   * Fatia de nível de PARCELA recortada por um relatório. Ver
   * `lancamentos/recorte.ts`: ela decide quais lançamentos entram na lista E como
   * o `valorRecorte` de cada um é somado, para o total fechar com a célula que foi
   * clicada no relatório.
   */
  recorte?: Recorte;
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
  /**
   * Coluna da ordenação, escolhida pela pessoa no cabeçalho da tabela. Lista
   * fechada em COLUNA_DO_BANCO: só coluna que existe em `lancamentos`, porque
   * ordenar por join ou por valor calculado no app não tem como acontecer aqui.
   */
  ordem?: OrdemLancamentos;
  direcao?: DirecaoOrdem;
}

/** Linha da listagem de lançamentos. */
export interface LancamentoLista {
  id: string;
  numero: string | null;
  tipo: TipoLancamento;
  origem: string;
  descricao: string;
  categoriaNome: string | null;
  /**
   * Centro de custo para a coluna: o nome quando é um, "N centros de custo"
   * quando o lançamento rateia entre vários. A regra mora em
   * `_shared/centro-de-custo.ts`, compartilhada com Pagamentos e Recebimentos,
   * porque as três telas descrevem o MESMO lançamento e não podem divergir.
   */
  centroCustoRotulo: string | null;
  /** Nomes do rateio para o `title` da célula, quando são de dois a cinco. */
  centroCustoNomes?: string;
  fornecedorNome: string | null;
  /**
   * Quem recebe, quando o lançamento vem do RH (folha, diária, adiantamento).
   * A coluna da tela é uma só: empresa aparece pelo fornecedor, pessoa da folha
   * aparece por aqui. Sem isto o lançamento do RH mostrava "—" na coluna de quem
   * recebe, e o nome só existia no meio da descrição.
   */
  colaboradorNome: string | null;
  valor: number;
  dataVencimento: string | null;
  status: StatusLancamento;
  qtdParcelas: number;
  /** O fato: data da compra ou do documento. */
  dataCompra: string;
  /** Mês de referência (dia 1): em que mês o custo entra. */
  mesCompetencia: string;
  /**
   * Número do documento do fornecedor (nota fiscal, boleto, recibo). No
   * lançamento de origem OC vem copiado da ordem. Não confundir com `numero`,
   * que é o número interno do lançamento.
   */
  numeroDocumento: string | null;
  /** Quantidade de anexos, para a lista sinalizar quem tem documento junto. */
  anexos: number;
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
  /**
   * Quanto DESTE lançamento pertence à fatia que a URL recortou, ou `null` quando
   * não há recorte (e aí o total é o `valor` do documento, como sempre).
   *
   * Existe porque relatório e listagem somam grãos diferentes. O custo por centro
   * de custo soma `lancamento_rateios.valor`, e nos 121 lançamentos rateados entre
   * obras o valor do documento é MAIOR que a parte daquele centro. Sem este campo,
   * clicar numa célula de R$ 3,23 mi abriria uma lista somando R$ 3,29 mi, e quem
   * confere concluiria que um dos dois está errado — e pararia de usar os dois.
   *
   * Zero é fatia de zero, e é diferente de `null`.
   */
  valorRecorte: number | null;
}

/** Um centro de custo do rateio, para a coluna da planilha. */
export interface RateioPlanilha {
  nome: string;
  codigo: string | null;
  valor: number;
}

/**
 * O lançamento como a PLANILHA precisa dele: a linha da lista mais o que a tela
 * não mostra (observações, rateio, forma, condição, conta, documento de origem).
 *
 * Existe separado de `LancamentoLista` de propósito: a listagem é a tela mais
 * usada do módulo e não mostra observação, forma, condição nem conta, então
 * pendurar isso no select dela sairia caro em toda navegação para servir uma
 * exportação que acontece de vez em quando. Quem enriquece é
 * `detalharLancamentosParaPlanilha`, página por página, sobre os ids que a lista
 * já devolveu.
 *
 * O RATEIO saiu desta lista em 22/08/2026: ele passou a ser coluna da tela
 * (pedido do Tiago), e o embed já existia ali para o filtro de centro de custo,
 * então trazer o nome junto custa um join sobre um embed que já vinha.
 */
export interface LancamentoPlanilha extends LancamentoLista {
  observacoes: string | null;
  formaPagamentoNome: string | null;
  condicaoPagamentoDescricao: string | null;
  /**
   * Conta bancária das parcelas. `null` quando nenhuma tem conta escolhida, e o
   * nome quando todas apontam para a mesma. Parcelas em contas diferentes viram
   * `VARIAS_CONTAS`: um nome só ali seria mentira, e a planilha é uma linha por
   * lançamento.
   */
  contaBancariaNome: string | null;
  /** Número do documento de origem (a OC), quando o lançamento vem de um. */
  origemNumero: string | null;
  rateios: RateioPlanilha[];
}

/** O que vai na coluna de conta quando as parcelas usam contas diferentes. */
export const VARIAS_CONTAS = "Várias contas";

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
  /** Juros e multa pagos no atraso. Zero quando não houve. */
  juros: number;
  /** Tarifa, cartório, protesto: despesa que não é juros nem multa. */
  outrasDespesas: number;
  /**
   * valor − desconto + juros + outras despesas: o que saiu da conta bancária.
   *
   * Os três ajustes vêm com ele porque a linha da parcela imprime a composição:
   * sem `juros` e `outrasDespesas`, uma parcela paga com multa aparecia pelo
   * valor devido, sem nenhuma pista de que saiu mais dinheiro da conta.
   */
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
  /** De qual forma esta parcela sai. Nulo no lançamento sem formas declaradas. */
  lancamentoFormaId: string | null;
}

/**
 * Uma forma de pagamento do lançamento, com quanto sai por ela.
 *
 * O lançamento pode ter VÁRIAS (20/08/2026). Uma só é o caso comum, e aí o
 * `forma_pagamento_id` do cabeçalho também guarda ela; com duas ou mais o
 * cabeçalho fica nulo de propósito, porque não existe "a forma" do lançamento.
 */
export interface FormaDoLancamento {
  id: string;
  formaPagamentoId: string;
  formaPagamentoNome: string;
  formaPagamentoTipo: TipoFormaPagamento;
  /** Qual cartão pagou esta parte. Nulo em tudo que não é cartão de crédito. */
  cartaoId: string | null;
  /** "Cartão obra (7712)", já montado: a tela e o formulário leem o mesmo texto. */
  cartaoRotulo: string | null;
  valor: number;
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
  /** Quem recebe, quando o lançamento vem do RH. Ver `colaboradorNome` na lista. */
  colaboradorId: string | null;
  colaboradorNome: string | null;
  /** Quem paga, no a receber. Null no a pagar, que tem fornecedor. */
  clienteId: string | null;
  clienteNome: string | null;
  /**
   * Conta de destino do recebimento, lida da primeira parcela (todas nascem com
   * a mesma). No a pagar é sempre null aqui: lá a conta é por parcela e é
   * escolhida na revisão, então ler uma só mentiria sobre as outras.
   */
  contaBancariaId: string | null;
  contaBancariaNome: string | null;
  categoriaId: string | null;
  categoriaNome: string | null;
  descricao: string;
  /**
   * O que TRANSITA: com retenção, é o líquido (o que entra na conta). Sem
   * retenção, é o valor cheio. É este número que as parcelas somam, que o rateio
   * divide e que move o saldo bancário.
   */
  valor: number;
  /**
   * Valor faturado antes das retenções na fonte. Null = documento sem retenção.
   * A diferença contra `valor` é imposto que o PAGADOR recolheu, não desconto.
   */
  valorBruto: number | null;
  retencaoIss: number;
  retencaoPis: number;
  retencaoCofins: number;
  retencaoCsll: number;
  retencaoIr: number;
  retencaoInss: number;
  retencaoOutras: number;
  status: StatusLancamento;
  /** Mês de referência (dia 1). Obrigatório: define em que mês o custo entra. */
  mesCompetencia: string;
  /** O fato: data da compra (herdada da OC) ou do documento. */
  dataCompra: string;
  /** Data de sistema (created_at), imutável: a tela mostra como texto. */
  criadoEm: string;
  dataVencimento: string | null;
  /**
   * Número do documento do fornecedor (nota fiscal, boleto, recibo). Editável no
   * lançamento avulso; no de origem OC vem da ordem e é somente-leitura aqui.
   *
   * No a receber é o documento que gerou o direito de receber (nota, medição,
   * contrato) e é OBRIGATÓRIO: é o que amarra o recebimento ao papel.
   */
  numeroDocumento: string | null;
  /** Texto livre do lançamento. Só aparece no detalhe, nunca na lista. */
  observacoes: string | null;
  /**
   * Marca de dívida: empréstimo, financiamento ou consórcio. É uma dimensão à
   * parte de categoria e centro de custo, e alimenta o relatório de
   * créditos.
   */
  eDivida: boolean;
  parcelas: ParcelaLancamento[];
  rateios: RateioLancamento[];
  /**
   * As formas de pagamento e quanto sai por cada uma. Vazio = lançamento que não
   * declara forma (caminho antigo), e aí quem manda é `formaPagamentoId`.
   */
  formas: FormaDoLancamento[];
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

/** Opção de cliente para o select de "quem está pagando" do recebimento. */
export interface ClienteOpcao {
  id: string;
  nome: string;
}

// Centro de custo vive em `_shared`: a mesma consulta e o mesmo tipo estavam
// duplicados aqui e em outro módulo, e agora a hierarquia (pai e tipo) entrou
// neles para a escolha em dois passos. Duas cópias divergiriam na primeira
// mudança.
export {
  listarCentrosCusto,
  type CentroCustoOpcao,
} from "@/modules/_shared/centro-custo/queries";

/** Nome de exibição do fornecedor: fantasia quando existe, senão razão social. */
function nomeFornecedor(fornecedor: {
  razao_social: string;
  nome_fantasia: string | null;
}): string {
  return fornecedor.nome_fantasia ?? fornecedor.razao_social;
}

/**
 * Nome de exibição do cliente: fantasia quando existe, senão o nome. Mesma regra
 * do fornecedor, porque na tela os dois ocupam o mesmo lugar (quem está do outro
 * lado do dinheiro) e ler um pelo fantasia e o outro pelo nome faria a mesma
 * empresa aparecer com dois nomes em telas vizinhas.
 */
function nomeCliente(cliente: {
  nome: string;
  nome_fantasia: string | null;
}): string {
  return cliente.nome_fantasia ?? cliente.nome;
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

/**
 * A subárvore de um centro de custo: ele mesmo e todos os descendentes.
 *
 * Filtrar por centro é filtrar a subárvore, não o nó: escolher a obra tem que
 * trazer as etapas dela, e escolher o centro de manutenção tem que trazer o
 * custo de cada equipamento (que é etapa dele). É o mesmo recorte que o
 * relatório de custo por centro usa — `fn_rel_custo_centro_custo` agrupa na
 * raiz —, e se os dois divergissem, clicar num centro do relatório abriria uma
 * lista que soma MENOS que o número clicado, sem nada na tela dizendo isso.
 *
 * Lida UMA vez e passada adiante de propósito: o filtro da listagem e o recorte
 * de valor precisam do mesmo conjunto, e duas leituras poderiam ler conjuntos
 * diferentes no dia em que alguém mexesse num dos dois lugares.
 */
export async function subarvoreDosCentros(
  supabase: ClienteSupabase,
  centroCustoIds: string[],
): Promise<string[]> {
  // A união das subárvores é um SUBCONJUNTO da tabela de centros de custo (74
  // linhas em 20/08/2026), então ela não estoura a URL do `in` por mais centros
  // que a pessoa marque — diferente da lista de LANÇAMENTOS do centro, que chega
  // a 1.871 no Escritório Central e mata a requisição.
  const arvores = await Promise.all(
    centroCustoIds.map(async (centroCustoId) => {
      const { data, error } = await supabase.rpc("fn_centro_custo_subarvore", {
        p_centro: centroCustoId,
      });
      // Erro não pode virar lista vazia, pelo mesmo motivo do `lerEmPaginas`: a
      // tela mostraria "nenhum lançamento" para um filtro que não chegou a ser
      // aplicado.
      if (error) throw new Error("Não foi possível aplicar o filtro");
      return (data ?? []).map((linha) => linha.id);
    }),
  );
  // Dedup porque duas escolhas podem se sobrepor (a obra e uma etapa dela): id
  // repetido no `in` não muda o resultado, mas engorda a URL de graça.
  return [...new Set(arvores.flat())];
}

/**
 * Valor rateado na subárvore do centro, por lançamento: é o RECORTE do filtro de
 * centro de custo (o `valorRecorte` de cada linha).
 *
 * Só o valor, não o filtro. O filtro de centro mora na consulta da listagem, num
 * embed — ver `listarLancamentos`. Já foi as duas coisas, e as chaves deste mapa
 * iam para a interseção de ids: com 1.871 lançamentos no Escritório Central isso
 * virava uma URL de 69 KB no `in.(...)` e a requisição morria sem nem chegar ao
 * servidor.
 */
async function valoresPorCentroCusto(
  supabase: ClienteSupabase,
  idsDaArvore: string[],
): Promise<Map<string, number>> {
  // Soma em vez de sobrescrever: nada no banco impede o mesmo lançamento de ter
  // duas linhas de rateio no mesmo centro — e nem em dois centros da mesma
  // árvore (um lançamento rateado entre dois equipamentos da manutenção) —, e
  // sobrescrever perderia uma delas.
  const porLancamento = new Map<string, number>();

  // O centro de custo do lançamento vive no rateio, nunca na tabela mãe: um
  // lançamento pode ser dividido entre várias obras.
  for (const lote of emLotes(idsDaArvore, LOTE_IDS_POSTGREST)) {
    const rateios = await lerEmPaginas((de, ate) =>
      supabase
        .from("lancamento_rateios")
        .select("lancamento_id, valor")
        .in("centro_custo_id", lote)
        .order("lancamento_id")
        .order("id")
        .range(de, ate),
    );

    for (const rateio of rateios) {
      const atual = porLancamento.get(rateio.lancamento_id) ?? 0;
      porLancamento.set(
        rateio.lancamento_id,
        paraReais(paraCentavos(atual) + paraCentavos(rateio.valor)),
      );
    }
  }
  return porLancamento;
}

/**
 * Ids dos lançamentos com alguma parcela EM ABERTO: o que a empresa ainda deve.
 *
 * Reusa `STATUS_PARCELA_ABERTA`, a mesma lista que o filtro de atraso e o cartão
 * "Em aberto" usam. Se esta função tivesse a própria definição de "aberto", o
 * filtro traria um conjunto e o cartão somaria outro.
 */
async function idsComSaldoAberto(
  supabase: ClienteSupabase,
): Promise<string[]> {
  const parcelas = await lerEmPaginas((de, ate) =>
    supabase
      .from("lancamento_parcelas")
      .select("lancamento_id")
      .in("status", STATUS_PARCELA_ABERTA)
      .order("lancamento_id")
      .order("id")
      .range(de, ate),
  );
  return [...new Set(parcelas.map((parcela) => parcela.lancamento_id))];
}

/**
 * Valor na FATIA, por lançamento, para o recorte de nível de parcela.
 *
 * Vai pela RPC, e não por uma classificação escrita aqui, porque a faixa do aging
 * e o mês do fluxo de caixa são regra do banco (`fn_rel_aging`,
 * `fn_rel_fluxo_caixa`). Uma segunda cópia em TypeScript divergiria, e o sintoma
 * seria uma lista somando diferente da célula que foi clicada, sem erro nenhum.
 *
 * `contaBancariaId` entra na chamada de propósito quando a fatia é `conta_paga`:
 * sem ela, um lançamento com parcelas pagas em DUAS contas somaria as duas na
 * fatia de uma só, e o total da lista passaria da célula da posição bancária.
 */
async function valoresDoRecorte(
  supabase: ClienteSupabase,
  recorte: Recorte,
  contaBancariaId?: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc("fn_lancamentos_do_recorte", {
    p_tipo_recorte: recorte.tipo,
    // `undefined` e não `null`: os parâmetros da RPC são opcionais com default
    // null no banco, e é assim que os tipos gerados os descrevem.
    p_faixa: recorte.tipo === "aging" ? recorte.faixa : undefined,
    p_tipo_lancamento:
      recorte.tipo === "aging" ? recorte.tipoLancamento : undefined,
    p_mes: recorte.tipo === "fluxo" ? recorte.mes : undefined,
    p_realizado: recorte.tipo === "fluxo" ? recorte.realizado : undefined,
    p_conta: recorte.tipo === "conta_paga" ? contaBancariaId : undefined,
  });

  if (error) {
    // A mensagem do banco vai junto: sem ela a falha chega como "não foi
    // possível" e descobrir o motivo vira adivinhação.
    throw new Error(`Não foi possível ler o recorte: ${error.message}`);
  }

  return new Map(
    (data ?? []).map((linha) => [
      linha.lancamento_id,
      paraReais(paraCentavos(linha.valor_no_recorte)),
    ]),
  );
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

  const ordem = params.ordem ?? ORDEM_PADRAO;
  const direcao = params.direcao ?? DIRECAO_PADRAO;
  const pagina = Math.max(0, params.pagina);
  const tamanho = Math.max(1, params.tamanho);
  const de = pagina * tamanho;
  const ate = de + tamanho - 1;

  // Filtros que moram na PARCELA viram lista de ids. Não dá para filtrar pelo
  // join embutido no select: `lancamento_parcelas` é o que alimenta a coluna
  // "Revisão" e o cálculo de dinheiro da linha, e filtrar o embed esconderia
  // parcelas da conta.
  //
  // O rateio é o oposto e por isso saiu daqui: o embed
  // `lancamento_rateios(centro_custo_id)` existe SÓ para filtrar, ninguém lê o
  // valor dele, então filtrá-lo não mexe em nenhum número da tela. E precisava
  // sair: a lista de ids do centro viaja na query string, e o Escritório Central
  // tem 1.871 lançamentos.
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
  if (params.comSaldoAberto) {
    listasDeIds.push(await idsComSaldoAberto(supabase));
  }
  // O centro é FILTRO e RECORTE, mas os dois entram por caminhos diferentes: o
  // filtro vai no embed da consulta (mais abaixo) e o recorte vira o
  // `valorRecorte` de cada linha. A subárvore é lida uma vez e serve aos dois,
  // para nunca filtrar por um conjunto e somar por outro.
  //
  // As chaves deste mapa NÃO podem voltar para `listasDeIds`: o `in.(...)` viaja
  // na query string, e o Escritório Central tem 1.871 lançamentos — 69 KB de URL,
  // que morre antes de chegar ao servidor (medido: 1.115 ids dão HTTP 400, 1.753
  // dão 520 e 1.871 não completam a requisição).
  const subarvoreCentro = params.centroCustoIds?.length
    ? await subarvoreDosCentros(supabase, params.centroCustoIds)
    : null;
  const valoresCentro = subarvoreCentro?.length
    ? await valoresPorCentroCusto(supabase, subarvoreCentro)
    : null;
  // O recorte de parcela também é filtro E medida, pelo mesmo motivo do centro.
  const valoresRecorte = params.recorte
    ? await valoresDoRecorte(supabase, params.recorte, params.contaBancariaId)
    : null;
  if (valoresRecorte) {
    listasDeIds.push([...valoresRecorte.keys()]);
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
      `id, numero, numero_documento, tipo, origem, descricao, valor,
       data_vencimento, status, data_compra, mes_competencia, created_at,
       categorias_financeiras(nome),
       fornecedores(razao_social, nome_fantasia),
       colaboradores(nome),
       lancamento_parcelas(
         status, conta_bancaria_id, valor, valor_liquido, desconto,
         data_vencimento
       ),
       lancamento_rateios(centro_custo_id, centros_custo(nome))`,
      { count: "exact" },
    )
    // Ordem escolhida pela pessoa, no SERVIDOR: sobre o filtro inteiro, não
    // sobre a página carregada. A coluna vem de COLUNA_DO_BANCO, lista fechada,
    // então nada cru da URL chega no `order`.
    .order(COLUNA_DO_BANCO[ordem], { ascending: direcao === "asc" })
    // Segundo critério, sempre: com muitos lançamentos no mesmo dia (e no mesmo
    // status, no mesmo tipo), a coluna escolhida sozinha empata demais. Acompanha
    // a direção escolhida para a lista não ficar com metade da ordem invertida.
    .order("created_at", { ascending: direcao === "asc" })
    // Desempate por id, que é único: sem ele a ordem de lançamentos com a MESMA
    // data de compra e o mesmo created_at fica a critério do Postgres, e pode
    // sair diferente entre uma página e a seguinte — a página 2 repete uma linha
    // e some com outra. Não é hipótese: a carga do Mais Controle gravou milhares
    // de lançamentos na mesma transação, então created_at empatado é o normal
    // aqui. Vale para a paginação da tela e para a leitura completa da
    // exportação, que percorre página por página.
    //
    // Com ordenação escolhida pela pessoa isto fica MAIS importante, não menos:
    // ordenar por status ou por tipo empata milhares de linhas de uma vez.
    .order("id", { ascending: false })
    .range(de, ate);

  if (idsFiltrados) consulta = consulta.in("id", idsFiltrados);
  // Centro de custo vive no RATEIO, não no lançamento: o filtro cai no embed e o
  // `lancamento_rateios=not.is.null` é o que descarta o lançamento sem nenhum
  // rateio batendo — mesmo efeito de um `!inner`, o mesmo par que a listagem de
  // ordens de compra usa para filtrar por centro pelo item.
  //
  // Aqui, e não na interseção de ids, porque só a subárvore viaja na URL (61 ids
  // no maior caso hoje) em vez dos lançamentos do centro (1.871 no Escritório
  // Central, 69 KB, requisição morta). O embed é subconsulta lateral
  // independente, então filtrá-lo não mexe no `count: "exact"` nem multiplica a
  // linha do lançamento.
  if (subarvoreCentro) {
    // Centro que não existe mais (ou sem nenhum id) não pode virar "sem filtro":
    // a resposta certa é lista vazia, não a lista inteira.
    if (subarvoreCentro.length === 0) return { itens: [], total: 0 };
    consulta = consulta
      .in("lancamento_rateios.centro_custo_id", subarvoreCentro)
      .not("lancamento_rateios", "is", null);
  }
  if (params.tipo) consulta = consulta.eq("tipo", params.tipo);
  if (params.status) consulta = consulta.eq("status", params.status);
  if (params.mesCompetencia) {
    consulta = consulta.eq("mes_competencia", params.mesCompetencia);
  }
  // `in` e não `eq` porque estes filtros são de múltipla escolha. Um id só cai no
  // mesmo resultado do `eq` de antes, e a lista viaja na URL do PostgREST: por
  // isso o teto de 50 do contrato (uuid ocupa 37 caracteres ali).
  if (params.fornecedorIds?.length) {
    consulta = consulta.in("fornecedor_id", params.fornecedorIds);
  }
  if (params.categoriaIds?.length) {
    consulta = consulta.in("categoria_id", params.categoriaIds);
  }
  // Forma é a única com duas pernas, e `in` não casa nulo: "sem forma informada"
  // (880 lançamentos, R$ 13,4 mi) só entra por `is.null`, então as duas viram um
  // `or` só. Dois `or` na mesma consulta (este e o da busca) o PostgREST aceita:
  // conferido contra a API do projeto, cada um vira uma condição AND-ada.
  if (params.formaPagamentoIds?.length || params.semForma) {
    const pernas: string[] = [];
    if (params.formaPagamentoIds?.length) {
      pernas.push(`forma_pagamento_id.in.(${params.formaPagamentoIds.join(",")})`);
    }
    if (params.semForma) pernas.push("forma_pagamento_id.is.null");
    consulta = consulta.or(pernas.join(","));
  }
  if (params.statusIn?.length) {
    consulta = consulta.in("status", params.statusIn);
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
  if (params.competenciaIn?.length) {
    consulta = consulta.in("mes_competencia", params.competenciaIn);
  }
  if (params.competenciaDe) {
    consulta = consulta.gte("mes_competencia", params.competenciaDe);
  }
  if (params.competenciaAte) {
    consulta = consulta.lte("mes_competencia", params.competenciaAte);
  }
  // `neq` e não um `status` positivo: os relatórios de custo excluem UM status e
  // aceitam todos os outros, o que o filtro de status (um valor só) não expressa.
  if (params.semCancelado) consulta = consulta.neq("status", "cancelado");
  if (params.semPrevisto) consulta = consulta.neq("status", "previsto");
  // Lançamento cancelado não é dívida, mesmo que as parcelas dele tenham ficado
  // em aberto: sem isto o filtro "A pagar" mostraria o que foi desfeito.
  if (params.comSaldoAberto) consulta = consulta.neq("status", "cancelado");
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
    // O número do documento entra junto: quem tem o boleto na mão procura pelo
    // número dele, não pelo número interno do lançamento.
    consulta = consulta.or(
      `numero.ilike.${padrao},numero_documento.ilike.${padrao},descricao.ilike.${padrao}`,
    );
  }

  const { data, error, count } = await consulta;

  if (error) {
    throw new Error("Não foi possível carregar os lançamentos");
  }

  // Contagem de anexos da PÁGINA, não da base inteira: uma consulta a mais por
  // listagem, com os ids que já vieram.
  const anexosPorLancamento = await contarAnexosPorDocumento(
    "lancamento",
    (data ?? []).map((lancamento) => lancamento.id),
  );

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

    const rateiosDaLinha = (lancamento.lancamento_rateios ?? []).map(
      (rateio) => ({ centroNome: rateio.centros_custo?.nome ?? null }),
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
      centroCustoRotulo: rotuloCentroCusto(rateiosDaLinha),
      centroCustoNomes: nomesDoRateio(rateiosDaLinha),
      fornecedorNome: lancamento.fornecedores
        ? nomeFornecedor(lancamento.fornecedores)
        : null,
      colaboradorNome: lancamento.colaboradores?.nome ?? null,
      valor: lancamento.valor,
      dataVencimento: lancamento.data_vencimento,
      status: lancamento.status as StatusLancamento,
      qtdParcelas: parcelas.length,
      dataCompra: lancamento.data_compra,
      mesCompetencia: lancamento.mes_competencia,
      numeroDocumento: lancamento.numero_documento,
      anexos: anexosPorLancamento[lancamento.id] ?? 0,
      criadoEm: lancamento.created_at,
      valorRecorte: escolherValorRecorte(
        valoresCentro?.get(lancamento.id) ?? null,
        valoresRecorte?.get(lancamento.id) ?? null,
      ),
    };
  });

  return { itens, total: count ?? 0 };
}

/** O que a planilha acrescenta a uma linha da lista. */
type DetalhePlanilha = Pick<
  LancamentoPlanilha,
  | "observacoes"
  | "formaPagamentoNome"
  | "condicaoPagamentoDescricao"
  | "contaBancariaNome"
  | "origemNumero"
  | "rateios"
>;

/**
 * Busca, para um punhado de lançamentos, o que a listagem não traz: observações,
 * rateio com centro de custo, forma e condição de pagamento, conta bancária das
 * parcelas e número da OC de origem.
 *
 * Recebe os ids de UMA página da exportação, não a exportação inteira: o teto é
 * 25.000 lançamentos, e um `in` com 25 mil uuids é uma query que o Postgres
 * aceita mas ninguém quer depurar. Quem chama enriquece página por página.
 *
 * A condição de pagamento de lançamento vindo de OC vive na ordem, não no
 * lançamento (é o documento de origem que manda nela), então ela é lida das duas
 * fontes: a do próprio lançamento quando existe, senão a da OC.
 */
export async function detalharLancamentosParaPlanilha(
  ids: string[],
): Promise<Map<string, DetalhePlanilha>> {
  const detalhes = new Map<string, DetalhePlanilha>();
  if (ids.length === 0) return detalhes;

  const supabase = await createClient();

  // Em lotes porque `in` é query string de um GET: 1000 uuids dão 37 KB de URL e
  // o PostgREST devolve 400 antes de olhar permissão (ver LOTE_IDS_POSTGREST).
  const linhas: LinhaDetalhePlanilha[] = [];
  for (const lote of emLotes(ids, LOTE_IDS_POSTGREST)) {
    const { data, error } = await supabase
      .from("lancamentos")
      .select(
        `id, observacoes, origem, origem_id,
         formas_pagamento(nome),
         condicoes_pagamento(descricao),
         lancamento_parcelas(conta_bancaria_id, contas_bancarias(nome)),
         lancamento_rateios(valor, centros_custo(nome, codigo))`,
      )
      .in("id", lote);

    if (error) {
      // A mensagem do banco vai junto de propósito: sem ela, a falha chega no log
      // como "não foi possível" e descobrir o motivo vira adivinhação. Foi o que
      // aconteceu com o 400 de URL longa.
      throw new Error(
        `Não foi possível carregar o detalhe para a planilha: ${error.message}`,
      );
    }
    linhas.push(...(data ?? []));
  }

  const numeroOc = await numerosDeOcDosLancamentos(supabase, linhas);

  for (const linha of linhas) {
    const parcelas = linha.lancamento_parcelas ?? [];
    const nomesDeConta = new Set(
      parcelas
        .map((parcela) => parcela.contas_bancarias?.nome)
        .filter((nome): nome is string => typeof nome === "string"),
    );

    detalhes.set(linha.id, {
      observacoes: linha.observacoes,
      formaPagamentoNome: linha.formas_pagamento?.nome ?? null,
      condicaoPagamentoDescricao:
        linha.condicoes_pagamento?.descricao ?? null,
      contaBancariaNome:
        nomesDeConta.size === 0
          ? null
          : nomesDeConta.size === 1
            ? [...nomesDeConta][0]
            : VARIAS_CONTAS,
      origemNumero:
        linha.origem === "oc" && linha.origem_id
          ? (numeroOc.get(linha.origem_id) ?? null)
          : null,
      rateios: (linha.lancamento_rateios ?? []).map((rateio) => ({
        nome: rateio.centros_custo?.nome ?? "Sem centro de custo",
        codigo: rateio.centros_custo?.codigo ?? null,
        valor: rateio.valor,
      })),
    });
  }

  return detalhes;
}

/** Uma linha crua do select do detalhe, como o PostgREST devolve. */
type LinhaDetalhePlanilha = {
  id: string;
  observacoes: string | null;
  origem: string;
  origem_id: string | null;
  formas_pagamento: { nome: string } | null;
  condicoes_pagamento: { descricao: string } | null;
  lancamento_parcelas: {
    conta_bancaria_id: string | null;
    contas_bancarias: { nome: string } | null;
  }[];
  lancamento_rateios: {
    valor: number;
    centros_custo: { nome: string; codigo: string | null } | null;
  }[];
};

/** Número da OC de cada lançamento que vem de ordem de compra. */
async function numerosDeOcDosLancamentos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  linhas: { origem: string; origem_id: string | null }[],
): Promise<Map<string, string>> {
  const idsOc = [
    ...new Set(
      linhas
        .filter((linha) => linha.origem === "oc" && linha.origem_id)
        .map((linha) => linha.origem_id as string),
    ),
  ];
  const numeros = new Map<string, string>();
  if (idsOc.length === 0) return numeros;

  const { data } = await supabase
    .from("ordens_compra")
    .select("id, numero")
    .in("id", idsOc);

  for (const ordem of data ?? []) {
    if (ordem.numero) numeros.set(ordem.id, ordem.numero);
  }
  return numeros;
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
      `id, numero, numero_documento, tipo, origem, origem_id, fornecedor_id,
       colaborador_id,
       cliente_id, categoria_id, forma_pagamento_id, condicao_pagamento_id,
       descricao, observacoes, e_divida, valor, status, mes_competencia, data_compra,
       created_at, data_vencimento,
       valor_bruto, retencao_iss, retencao_pis, retencao_cofins,
       retencao_csll, retencao_ir, retencao_inss, retencao_outras,
       categorias_financeiras(nome),
       condicoes_pagamento(descricao),
       formas_pagamento(nome, tipo),
       fornecedores(razao_social, nome_fantasia),
       colaboradores(nome),
       clientes(nome, nome_fantasia),
       lancamento_formas(
         id, valor, forma_pagamento_id, cartao_id,
         formas_pagamento(nome, tipo),
         cartoes_credito(nome, ultimos_digitos)
       ),
       lancamento_parcelas(
         id, numero_parcela, valor, desconto, juros, outras_despesas,
         valor_liquido,
         data_vencimento, status, lancamento_forma_id,
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
      juros: parcela.juros ?? 0,
      outrasDespesas: parcela.outras_despesas ?? 0,
      valorLiquido: parcela.valor_liquido ?? parcela.valor,
      dataVencimento: parcela.data_vencimento,
      status: parcela.status as StatusParcela,
      dataProgramada: parcela.data_programada,
      dataProgramadaOrigem:
        (parcela.data_programada_origem as OrigemDataProgramada | null) ?? null,
      contaBancariaId: parcela.conta_bancaria_id,
      contaBancariaNome: parcela.contas_bancarias?.nome ?? null,
      dataPagamento: parcela.data_pagamento,
      lancamentoFormaId: parcela.lancamento_forma_id,
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

  // Ordenadas por valor decrescente: a forma que leva mais dinheiro aparece
  // primeiro, que e como a pessoa le a divisao ("a maior parte sai no boleto").
  const formas: FormaDoLancamento[] = (data.lancamento_formas ?? [])
    .map((forma) => ({
      id: forma.id,
      formaPagamentoId: forma.forma_pagamento_id,
      formaPagamentoNome: forma.formas_pagamento?.nome ?? "-",
      formaPagamentoTipo: tipoFormaPagamento(forma.formas_pagamento?.tipo),
      cartaoId: forma.cartao_id,
      cartaoRotulo: forma.cartoes_credito
        ? rotuloDoCartao({
            nome: forma.cartoes_credito.nome,
            ultimosDigitos: forma.cartoes_credito.ultimos_digitos,
          })
        : null,
      valor: forma.valor,
    }))
    .sort((a, b) => b.valor - a.valor);

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
    colaboradorId: data.colaborador_id,
    colaboradorNome: data.colaboradores?.nome ?? null,
    clienteId: data.cliente_id,
    clienteNome: data.clientes ? nomeCliente(data.clientes) : null,
    // Conta em que o dinheiro entra, no a receber: mora na parcela, e todas as
    // parcelas de um recebível nascem com a mesma. Ler da primeira é o que o
    // formulário precisa para reabrir com o campo preenchido. No a pagar fica
    // null de propósito: lá cada parcela tem a sua conta, escolhida na revisão,
    // e mostrar a da primeira como se fosse do lançamento mentiria.
    contaBancariaId:
      data.tipo === "a_receber" ? (parcelas[0]?.contaBancariaId ?? null) : null,
    contaBancariaNome:
      data.tipo === "a_receber"
        ? (parcelas[0]?.contaBancariaNome ?? null)
        : null,
    categoriaId: data.categoria_id,
    categoriaNome: data.categorias_financeiras?.nome ?? null,
    descricao: data.descricao,
    valor: data.valor,
    valorBruto: data.valor_bruto,
    retencaoIss: data.retencao_iss,
    retencaoPis: data.retencao_pis,
    retencaoCofins: data.retencao_cofins,
    retencaoCsll: data.retencao_csll,
    retencaoIr: data.retencao_ir,
    retencaoInss: data.retencao_inss,
    retencaoOutras: data.retencao_outras,
    status: data.status as StatusLancamento,
    mesCompetencia: data.mes_competencia,
    dataCompra: data.data_compra,
    criadoEm: data.created_at,
    dataVencimento: data.data_vencimento,
    numeroDocumento: data.numero_documento,
    observacoes: data.observacoes,
    eDivida: data.e_divida,
    parcelas,
    rateios,
    formas,
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

  /**
   * Lê em PÁGINAS, não numa tacada.
   *
   * Esta lista alimenta o Combobox de fornecedor do formulário de lançamento, do
   * filtro da listagem e do relatório de custo por centro de custo — e o
   * PostgREST corta em 1.000 linhas SEM ERRO. Medido em 15/08/2026: 939
   * fornecedores, 938 ativos. Faltam 62 cadastros para o corte começar, e ele é
   * invisível: o fornecedor some do seletor mesmo digitando o nome, porque a
   * busca da tela roda sobre o que chegou. O desfecho previsível é alguém
   * cadastrar um duplicado "porque não estava na lista".
   *
   * Mesmo defeito que já mordeu em 1.000 dos 3.349 insumos da ordem de compra e
   * no saldo das contas bancárias.
   */
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("fornecedores")
      .select("id, razao_social, nome_fantasia")
      .eq("ativo", true)
      .order("razao_social")
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

/**
 * Clientes ativos para o seletor de "quem está pagando" do recebimento.
 *
 * Lê em PÁGINAS pelo mesmo motivo de listarFornecedores: o PostgREST corta em
 * 1.000 linhas sem erro nenhum, e cliente que some do seletor faz alguém
 * cadastrar duplicado. Hoje a base tem poucos clientes; quem cresce é a base,
 * não este arquivo.
 */
export async function listarClientes(): Promise<ClienteOpcao[]> {
  const supabase = await createClient();

  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("clientes")
      .select("id, nome, nome_fantasia")
      .eq("ativo", true)
      .order("nome")
      .range(de, ate),
  );

  if (erro) {
    throw new Error("Não foi possível carregar os clientes");
  }

  return linhas.map((cliente) => ({
    id: cliente.id,
    nome: nomeCliente(cliente),
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
    // nomes_usuarios_auditoria é gated em administracao.auditoria/lixeira, que
    // Financeiro e Gestor não têm: mostrava "Sistema" pra quem realmente usa
    // esta tela. nomes_usuarios_financeiro é gated na mesma permissão de
    // quem vê o lançamento (financeiro.lancamentos/aprovacao-pagamentos).
    const { data: usuarios } = await supabase.rpc("nomes_usuarios_financeiro", {
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
