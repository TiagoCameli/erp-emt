import "server-only";

import type { EventoTrilha } from "@/components/canonicos/trilha";
import { createClient } from "@/lib/supabase/server";
import {
  aplicarFiltrosPagas,
  padraoBusca,
} from "@/modules/financeiro/pagamentos/filtros-pagas";
import {
  nomesDoRateio,
  rotuloCentroCusto,
} from "@/modules/financeiro/_shared/centro-de-custo";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import {
  movimentoPorContaEmCentavos,
  saldoAtualDaConta,
} from "@/modules/financeiro/contas-bancarias/saldo";
import {
  ROTULO_BANCO,
  STATUS_PARCELA_ABERTA,
  type BancoConta,
  type StatusParcela,
} from "@/modules/financeiro/_shared/formato";
import type { OrigemDataProgramada } from "@/modules/financeiro/_shared/janela-pagamento";
import {
  eventoParcelaParaTrilha,
  type ParcelaEvento,
  type TipoParcelaEvento,
} from "@/modules/financeiro/pagamentos/eventos";

/** Parcela a pagar já aprovada, pronta para registrar o pagamento. */
export interface ParcelaAprovada {
  id: string;
  lancamentoId: string;
  lancamentoNumero: string | null;
  numeroParcela: number;
  descricao: string;
  /** Categoria financeira do lançamento, exibida junto da descrição. */
  categoriaNome: string | null;
  fornecedorNome: string;
  /**
   * Fornecedor e conta bancária como id, para os filtros da fila. Opcionais
   * porque a interface também é o contrato de entrada do drawer de pagamento, e
   * quem só quer abrir o drawer (aba Programados) não tem esses ids em mão.
   */
  fornecedorId?: string | null;
  contaBancariaId?: string | null;
  dataVencimento: string | null;
  /**
   * Observação do lançamento — no lançamento nascido de OC é a observação que
   * Compras escreveu na ordem, copiada na aprovação.
   *
   * Vem para a fila, e não só para o drawer, porque é aqui que ela é lida: a
   * observação carrega chave PIX, CNPJ e data combinada de pagamento, e quem
   * paga varre dezenas de linhas sem abrir o detalhe de cada uma.
   *
   * Opcional porque esta interface também é o contrato de entrada do drawer de
   * pagamento, e quem abre o drawer pela aba Programados não carrega o campo.
   */
  observacoes?: string | null;
  /** Data em que o pagamento está autorizado. É ela que a trava do banco usa. */
  dataProgramada: string | null;
  dataProgramadaOrigem: OrigemDataProgramada | null;
  valor: number;
  aprovadoEm: string | null;
  /**
   * Situação da parcela na fila a pagar: `pendente`, `em_revisao` ou
   * `aprovado`.
   *
   * A aba mostra as três — quem paga precisa enxergar o que ainda não foi
   * aprovado para saber o que vem pela frente —, e só `aprovado` ganha botão de
   * pagar, porque `fn_pagar_parcela` recusa as outras duas. Opcional porque
   * esta interface também é o contrato de entrada do drawer de pagamento, e
   * quem abre o drawer pela aba Programados não carrega este campo.
   */
  status?: StatusParcela;
  /**
   * Centro de custo do lançamento: o nome quando é um, "N centros de custo"
   * quando rateia. Regra compartilhada em `_shared/centro-de-custo.ts` para
   * Pagamentos, Recebimentos e Lançamentos nunca discordarem sobre a mesma
   * linha. Opcional porque esta interface também é o contrato de entrada do
   * drawer de pagamento, e quem abre pela aba Programados não carrega o campo.
   */
  centroCustoRotulo?: string | null;
  centroCustoNomes?: string;
}

/** Parcela já paga, para o histórico. */
export interface ParcelaPaga {
  id: string;
  lancamentoNumero: string | null;
  numeroParcela: number;
  descricao: string;
  /** Categoria financeira do lançamento, exibida junto da descrição. */
  categoriaNome: string | null;
  fornecedorNome: string;
  contaNome: string;
  dataPagamento: string | null;
  /** Valor devido da parcela. O desconto não o reescreve. */
  valor: number;
  /** Desconto concedido no pagamento. Zero quando não houve. */
  desconto: number;
  /**
   * Juros e multa pagos no atraso. Zero quando não houve.
   *
   * Necessário porque a aba "Pagas" exibe valor, desconto e líquido na mesma
   * linha. Sem este campo, a tela mostra três números que não somam
   * (valor − desconto ≠ líquido), mentindo sobre o que saiu da conta.
   */
  juros: number;
  /**
   * Tarifa bancária, cartório, protesto: despesa cobrada junto com a parcela
   * que não é juros nem multa. Zero quando não houve.
   *
   * Está aqui pelo mesmo motivo de `juros`: a aba "Pagas" exibe a composição
   * na mesma linha, e sem este campo os números não somam
   * (valor − desconto + juros ≠ líquido), mentindo sobre o que saiu da conta.
   */
  outrasDespesas: number;
  /** valor − desconto + juros + outras despesas: o que saiu da conta. */
  valorLiquido: number;
  /** Centro de custo do lançamento, pela regra de `_shared/centro-de-custo.ts`. */
  centroCustoRotulo: string | null;
  centroCustoNomes?: string;
}

/**
 * Filtros do histórico de pagamentos. Todos vão ao banco: a paginação da aba
 * "Pagas" é server-side, e filtrar só a página carregada faria a tela mentir
 * sobre quantos pagamentos existem.
 */
export interface FiltrosParcelasPagas {
  /** Número do lançamento, descrição ou nome do fornecedor. */
  busca?: string;
  /**
   * Fornecedores e contas escolhidos. Lista VAZIA é "todos" — o filtro só entra
   * na consulta quando há escolha. O teto de itens é o de `listas-na-url`:
   * o `in` viaja na URL do PostgREST e lista grande vira HTTP 400 por tamanho.
   */
  fornecedorIds?: string[];
  contaBancariaIds?: string[];
  /** Faixa de valor da parcela, em reais (comparação gte/lte no banco). */
  valorDe?: number;
  valorAte?: number;
  /** Períodos em yyyy-MM-dd; ponta vazia significa sem limite naquele lado. */
  vencimentoDe?: string;
  vencimentoAte?: string;
  programadaDe?: string;
  programadaAte?: string;
  pagamentoDe?: string;
  pagamentoAte?: string;
}

/** Histórico paginado de pagamentos. */
export interface ParcelasPagasPagina {
  itens: ParcelaPaga[];
  total: number;
}

/** Opção de conta bancária ativa para o select do pagamento. */
export interface ContaBancariaOpcao {
  id: string;
  nome: string;
  banco: string;
  /**
   * Saldo atual, em reais: saldo inicial mais o movimento das parcelas já pagas
   * nesta conta. Mesma conta que `fn_pagar_parcela` faz antes de aceitar o
   * pagamento — e ela RECUSA quando o saldo não cobre.
   *
   * Vai para a tela para o pagamento em lote poder dizer, ANTES de tentar,
   * quanto sobra depois: sem isto o operador marca vinte parcelas, manda pagar,
   * e descobre pelo erro do banco na décima que a conta acabou.
   */
  saldoAtual: number;
}

/**
 * O rateio do embed no formato que `rotuloCentroCusto` espera.
 *
 * Existe porque as duas listagens (a pagar e pagas) leem o MESMO embed e tinham
 * que montar o mesmo array de duas formas diferentes.
 */
function rateiosDoEmbed(
  lancamento: { lancamento_rateios?: { centros_custo: { nome: string } | null }[] | null } | null,
): { centroNome: string | null }[] {
  return (lancamento?.lancamento_rateios ?? []).map((rateio) => ({
    centroNome: rateio.centros_custo?.nome ?? null,
  }));
}

/** Nome de exibição do fornecedor: fantasia quando existe, senão razão social. */
function nomeFornecedor(
  fornecedor: { razao_social: string; nome_fantasia: string | null } | null,
): string {
  if (!fornecedor) return "-";
  return fornecedor.nome_fantasia ?? fornecedor.razao_social;
}

/** Rótulo da conta: nome + banco (ex: "Conta movimento - Sicredi"). */
function rotuloConta(nome: string, banco: string): string {
  const rotuloBanco = ROTULO_BANCO[banco as BancoConta] ?? banco;
  return `${nome} - ${rotuloBanco}`;
}

/** Linha crua da fila a pagar, como o PostgREST devolve. */
interface LinhaAPagar {
  id: string;
  numero_parcela: number;
  valor: number;
  status: string;
  data_vencimento: string | null;
  data_programada: string | null;
  data_programada_origem: string | null;
  aprovado_em: string | null;
  lancamento_id: string;
  conta_bancaria_id: string | null;
  lancamentos: {
    numero: string | null;
    descricao: string | null;
    tipo: string;
    fornecedor_id: string | null;
    observacoes: string | null;
    categorias_financeiras: { nome: string } | null;
    fornecedores: { razao_social: string; nome_fantasia: string | null } | null;
    lancamento_rateios: { centros_custo: { nome: string } | null }[] | null;
  } | null;
}

/** Colunas da fila a pagar. Uma constante só, porque a query é montada em lotes. */
const SELECT_A_PAGAR = `id, numero_parcela, valor, status, data_vencimento,
   data_programada, data_programada_origem, aprovado_em, lancamento_id,
   conta_bancaria_id,
   lancamentos!inner(
     numero, descricao, tipo, fornecedor_id, observacoes,
     categorias_financeiras(nome),
     fornecedores(razao_social, nome_fantasia),
     lancamento_rateios(centros_custo(nome))
   )`;

/**
 * Parcelas EM ABERTO de lançamentos a pagar: aprovadas, pendentes e em revisão.
 *
 * Mostra as não aprovadas junto com as aprovadas (pedido do Tiago, 19/08/2026)
 * porque quem paga precisa enxergar o que vem pela frente, não só o que já
 * passou pela aprovação. Quem decide o que é "em aberto" é
 * `STATUS_PARCELA_ABERTA`, e não uma lista digitada aqui: status novo entra
 * sozinho, sem esta consulta e o resumo do topo passarem a discordar.
 *
 * Só `tipo = a_pagar` (a_receber baixa em contas a receber) e lançamento não
 * cancelado: parcela de lançamento cancelado listada como "a pagar" é convite
 * para pagar o que não existe, e o banco recusaria de qualquer jeito.
 *
 * Traz TODAS as linhas (paginando acima do teto de mil do PostgREST) porque os
 * cards do topo somam o conjunto inteiro e a seleção precisa atravessar as
 * páginas da tabela: somar só a página carregada faria o card mentir sobre
 * quanto a empresa deve. São ~900 linhas hoje.
 */
export async function listarParcelasAPagar(): Promise<ParcelaAprovada[]> {
  const supabase = await createClient();

  const { linhas, erro } = await todasAsLinhas<LinhaAPagar>((de, ate) =>
    supabase
      .from("lancamento_parcelas")
      .select(SELECT_A_PAGAR)
      .in("status", STATUS_PARCELA_ABERTA)
      .eq("lancamentos.tipo", "a_pagar")
      .neq("lancamentos.status", "cancelado")
      .order("data_vencimento", { ascending: true, nullsFirst: false })
      // Desempate obrigatório: sem ele, vencimentos iguais (e são muitos, a
      // carga trouxe parcelas em bloco) mudam de ordem entre uma faixa e a
      // seguinte, repetindo linha numa página e perdendo em outra.
      .order("id", { ascending: true })
      .range(de, ate)
      .returns<LinhaAPagar[]>(),
  );

  if (erro) {
    throw new Error("Não foi possível carregar as parcelas a pagar");
  }

  return linhas.map((parcela) => ({
    id: parcela.id,
    lancamentoId: parcela.lancamento_id,
    lancamentoNumero: parcela.lancamentos?.numero ?? null,
    numeroParcela: parcela.numero_parcela,
    descricao: parcela.lancamentos?.descricao ?? "-",
    observacoes: parcela.lancamentos?.observacoes ?? null,
    categoriaNome: parcela.lancamentos?.categorias_financeiras?.nome ?? null,
    centroCustoRotulo: rotuloCentroCusto(rateiosDoEmbed(parcela.lancamentos)),
    centroCustoNomes: nomesDoRateio(rateiosDoEmbed(parcela.lancamentos)),
    fornecedorId: parcela.lancamentos?.fornecedor_id ?? null,
    fornecedorNome: nomeFornecedor(parcela.lancamentos?.fornecedores ?? null),
    contaBancariaId: parcela.conta_bancaria_id,
    dataVencimento: parcela.data_vencimento,
    dataProgramada: parcela.data_programada,
    dataProgramadaOrigem:
      (parcela.data_programada_origem as OrigemDataProgramada | null) ?? null,
    valor: parcela.valor,
    aprovadoEm: parcela.aprovado_em,
    status: parcela.status as StatusParcela,
  }));
}

/** Máximo de fornecedores resolvidos por nome numa busca (limite do filtro in). */
const MAX_FORNECEDORES_BUSCA = 50;


/**
 * Ids de fornecedores cujo nome bate com o padrão. A busca do histórico precisa
 * achar por fornecedor, e o or() do PostgREST não mistura colunas de tabelas
 * diferentes: os ids entram como mais um termo do or() em cima de lancamentos.
 */
async function idsFornecedoresPorNome(
  supabase: Awaited<ReturnType<typeof createClient>>,
  padrao: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("fornecedores")
    .select("id")
    .or(`razao_social.ilike.${padrao},nome_fantasia.ilike.${padrao}`)
    .limit(MAX_FORNECEDORES_BUSCA);
  return (data ?? []).map((fornecedor) => fornecedor.id);
}

/**
 * O mínimo que uma consulta precisa expor para receber os filtros do histórico.
 *
 * Existe para a MESMA aplicação de filtros servir à listagem paginada e à soma
 * do total: dois lugares montando os mesmos nove filtros divergiriam no
 * primeiro filtro novo, e o rodapé passaria a somar um conjunto diferente do
 * que a tabela mostra — do jeito mais silencioso possível, porque os dois
 * números continuariam plausíveis.
 */

/** Ids de fornecedor que a busca do filtro alcança. Vazio quando não há busca. */
async function fornecedoresDaBusca(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filtros: FiltrosParcelasPagas,
): Promise<string[]> {
  const termo = filtros.busca?.trim() ?? "";
  if (termo === "") return [];
  return idsFornecedoresPorNome(supabase, padraoBusca(termo));
}

/**
 * Quanto SAIU DA CONTA no recorte do histórico: soma de `valor_liquido`.
 *
 * Líquido, e não `valor`, porque é o que o extrato do banco mostra — e é o
 * mesmo número do cartão "Pago no mês" do Painel (`fn_rel_gestao_financeiro_resumo`
 * também soma o líquido). Clicar no cartão e cair numa tela que soma diferente
 * seria trocar uma pergunta respondida por uma dúvida.
 *
 * Soma no servidor sobre TODAS as linhas do filtro (paginando acima do teto de
 * mil do PostgREST), nunca sobre a página carregada: a tabela é paginada, e
 * somar as 25 linhas da tela chamaria de "total" um pedaço.
 */
export async function somaDasParcelasPagas(
  filtros: FiltrosParcelasPagas = {},
): Promise<number> {
  const supabase = await createClient();

  const idsFornecedores = await fornecedoresDaBusca(supabase, filtros);

  const { linhas, erro } = await todasAsLinhas<{ valor_liquido: number }>(
    (de, ate) =>
      aplicarFiltrosPagas(
        supabase
          .from("lancamento_parcelas")
          .select("valor_liquido, lancamentos!inner(fornecedor_id)")
          .eq("status", "pago")
          .eq("lancamentos.tipo", "a_pagar")
          .neq("lancamentos.status", "cancelado"),
        filtros,
        idsFornecedores,
      )
        // Desempate: sem ele, linhas com o mesmo `data_pagamento` (e são
        // milhares, vindas da carga) mudam de ordem entre uma faixa e a
        // seguinte, e a soma conta linha repetida e perde outra.
        .order("id", { ascending: true })
        .range(de, ate)
        .returns<{ valor_liquido: number }[]>(),
  );

  if (erro) {
    throw new Error("Não foi possível somar o histórico de pagamentos");
  }

  return linhas.reduce((soma, linha) => soma + Number(linha.valor_liquido), 0);
}

/**
 * Histórico paginado de parcelas pagas, mais recentes primeiro. Resolve a
 * conta bancária do pagamento e o fornecedor do lançamento via join, e aplica
 * todos os filtros no banco.
 */
export async function listarParcelasPagas({
  pagina,
  tamanho,
  filtros = {},
}: {
  pagina: number;
  tamanho: number;
  filtros?: FiltrosParcelasPagas;
}): Promise<ParcelasPagasPagina> {
  const supabase = await createClient();

  const de = pagina * tamanho;
  const ate = de + tamanho - 1;

  let consulta = supabase
    .from("lancamento_parcelas")
    .select(
      `id, numero_parcela, valor, desconto, juros, outras_despesas,
       valor_liquido, data_pagamento,
       contas_bancarias(nome, banco),
       lancamentos!inner(
         numero, descricao,
         categorias_financeiras(nome),
         fornecedores(razao_social, nome_fantasia),
         lancamento_rateios(centros_custo(nome))
       )`,
      { count: "exact" },
    )
    .eq("status", "pago")
    // Recebimento baixado NÃO é pagamento: `a_receber` tem tela própria (contas
    // a receber) e entra aqui como dinheiro que saiu, invertendo o sinal do
    // histórico. Lançamento cancelado também sai, pelo mesmo critério das
    // fn_rel_* e do cartão "Pago no mês" do Painel — que é o número que esta
    // aba tem que reproduzir quando se chega nela pelo cartão.
    //
    // Hoje não muda nenhuma linha (não existe recebimento baixado nem
    // cancelado com parcela paga, medido em 19/08/2026): a trava é para o dia
    // em que existir.
    .eq("lancamentos.tipo", "a_pagar")
    .neq("lancamentos.status", "cancelado")
    .order("data_pagamento", { ascending: false, nullsFirst: false })
    .order("pago_em", { ascending: false, nullsFirst: false })
    .range(de, ate);

  consulta = aplicarFiltrosPagas(
    consulta,
    filtros,
    await fornecedoresDaBusca(supabase, filtros),
  );

  const { data, error, count } = await consulta;

  if (error) {
    throw new Error("Não foi possível carregar o histórico de pagamentos");
  }

  const itens: ParcelaPaga[] = (data ?? []).map((parcela) => ({
    id: parcela.id,
    lancamentoNumero: parcela.lancamentos?.numero ?? null,
    numeroParcela: parcela.numero_parcela,
    descricao: parcela.lancamentos?.descricao ?? "-",
    categoriaNome: parcela.lancamentos?.categorias_financeiras?.nome ?? null,
    centroCustoRotulo: rotuloCentroCusto(rateiosDoEmbed(parcela.lancamentos)),
    centroCustoNomes: nomesDoRateio(rateiosDoEmbed(parcela.lancamentos)),
    fornecedorNome: nomeFornecedor(parcela.lancamentos?.fornecedores ?? null),
    contaNome: parcela.contas_bancarias
      ? rotuloConta(parcela.contas_bancarias.nome, parcela.contas_bancarias.banco)
      : "-",
    dataPagamento: parcela.data_pagamento,
    valor: parcela.valor,
    desconto: parcela.desconto ?? 0,
    juros: Number(parcela.juros ?? 0),
    outrasDespesas: Number(parcela.outras_despesas ?? 0),
    valorLiquido: parcela.valor_liquido ?? parcela.valor,
  }));

  return { itens, total: count ?? 0 };
}

/** Contas bancárias ativas para o select do pagamento, em ordem alfabética. */
export async function listarContasBancarias(): Promise<ContaBancariaOpcao[]> {
  const supabase = await createClient();

  // O saldo vem da mesma RPC que a tela de contas bancárias usa, e a aritmética
  // em centavos mora em contas-bancarias/saldo.ts, que tem teste: dois cálculos
  // de saldo divergiriam no primeiro arredondamento.
  const [contasResultado, movimentosResultado] = await Promise.all([
    supabase
      .from("contas_bancarias")
      .select("id, nome, banco, saldo_inicial")
      .eq("ativo", true)
      .order("nome"),
    supabase.rpc("fn_rel_posicao_bancaria"),
  ]);

  if (contasResultado.error) {
    throw new Error("Não foi possível carregar as contas bancárias");
  }
  if (movimentosResultado.error) {
    throw new Error("Não foi possível calcular o saldo das contas");
  }

  const movimentoCentavos = movimentoPorContaEmCentavos(
    (movimentosResultado.data ?? []).map((linha) => ({
      contaBancariaId: linha.conta_bancaria_id,
      tipo: linha.tipo,
      total: linha.total,
    })),
  );

  return (contasResultado.data ?? []).map((conta) => ({
    id: conta.id,
    nome: conta.nome,
    banco: conta.banco,
    saldoAtual: saldoAtualDaConta(
      conta.saldo_inicial,
      movimentoCentavos.get(conta.id) ?? 0,
    ),
  }));
}

/**
 * Trilha das parcelas do lançamento: lê `parcela_eventos` das parcelas
 * daquele lançamento numa leitura só (embed de `lancamento_parcelas` para o
 * número da parcela e o filtro pelo lançamento), resolve o nome do autor em
 * lote via `nomes_usuarios_financeiro` e converte cada linha para o
 * `EventoTrilha` do componente canônico, mais recente primeiro.
 *
 * `nomes_usuarios_financeiro` (não `nomes_usuarios_auditoria`) de propósito:
 * é gated na mesma permissão de quem já pode ver o lançamento/a fila de
 * aprovação, não na de auditoria/lixeira — Financeiro e Gestor não têm essa
 * segunda, e veriam "Sistema" em vez do nome de quem aprovou/reprogramou.
 */
export async function trilhaParcelasDoLancamento(
  lancamentoId: string,
): Promise<EventoTrilha[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("parcela_eventos")
    .select(
      `id, tipo, motivo, data_de, data_para, valor_de, valor_para,
       created_at, created_by,
       lancamento_parcelas!inner(numero_parcela, lancamento_id)`,
    )
    .eq("lancamento_parcelas.lancamento_id", lancamentoId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error || !data) return [];

  const idsUsuarios = [
    ...new Set(
      data
        .map((linha) => linha.created_by)
        .filter((id): id is string => id !== null),
    ),
  ];

  const nomesPorId = new Map<string, string>();
  if (idsUsuarios.length > 0) {
    const { data: usuarios } = await supabase.rpc("nomes_usuarios_financeiro", {
      p_ids: idsUsuarios,
    });
    for (const usuario of usuarios ?? []) {
      nomesPorId.set(usuario.id, usuario.nome);
    }
  }

  return data.map((linha) => {
    const evento: ParcelaEvento = {
      id: linha.id,
      tipo: linha.tipo as TipoParcelaEvento,
      motivo: linha.motivo,
      dataDe: linha.data_de,
      dataPara: linha.data_para,
      valorDe: linha.valor_de,
      valorPara: linha.valor_para,
      criadoEm: linha.created_at,
      usuarioNome:
        linha.created_by === null
          ? "Sistema"
          : (nomesPorId.get(linha.created_by) ?? "Sistema"),
    };
    return eventoParcelaParaTrilha(
      evento,
      linha.lancamento_parcelas?.numero_parcela ?? 0,
    );
  });
}
