import "server-only";

import { dataHojeISO } from "@/lib/formatadores";
import { createClient } from "@/lib/supabase/server";
import {
  tipoFormaPagamento,
  type TipoFormaPagamento,
} from "@/modules/_shared/forma-pagamento";
import type { StatusParcela } from "@/modules/financeiro/_shared/formato";

/** Um centro de custo do rateio, para a composição no tooltip. */
export interface RateioResumo {
  nome: string;
  valor: number;
}

/**
 * Linha da fila de aprovação de pagamentos: uma parcela pendente de um
 * lançamento do tipo a_pagar, com o lançamento e o fornecedor resolvidos
 * via join. O valor vem do banco, nunca recalculado no app.
 *
 * Traz mais do que a tela mostra por padrão de propósito: as colunas são
 * configuráveis pelo usuário, então o dado precisa estar aqui para ele poder
 * ligar a coluna. É uma consulta por página, não por linha.
 */
export interface ParcelaPendente {
  id: string;
  numeroParcela: number;
  /** Total de parcelas do lançamento, para o rótulo "parcela N de M". */
  totalParcelas: number;
  valor: number;
  dataVencimento: string | null;
  lancamentoId: string;
  lancamentoNumero: string | null;
  lancamentoDescricao: string;
  fornecedorNome: string;
  /** 'oc' | 'cotacao' | 'manual': define se existe documento para linkar. */
  origem: string;
  origemId: string | null;
  origemNumero: string | null;
  categoriaNome: string | null;
  formaPagamentoNome: string | null;
  /**
   * Conta bancária escolhida no lançamento. Nunca é null aqui (sem conta a
   * parcela não entra na fila), mas a coluna do banco é nullable: o tipo
   * acompanha o banco em vez de mentir. Quem aprova pode trocar no modal.
   */
  contaBancariaId: string | null;
  contaBancariaNome: string | null;
  dataCompra: string | null;
  mesCompetencia: string | null;
  /** Só existe depois da aprovação: na fila é sempre null. */
  dataProgramada: string | null;
  rateios: RateioResumo[];
  anexos: number;
  /**
   * Nota fiscal da OC de origem ainda não registrada. Não bloqueia a aprovação
   * (a regra é por forma de pagamento, não pela nota), mas quem aprova precisa
   * ver que está liberando dinheiro de uma compra sem nota.
   */
  semNota: boolean;
}

/** O que está fora da fila por lançamento incompleto, para o estado vazio. */
export interface ParcelasIncompletas {
  parcelas: number;
  valor: number;
  lancamentos: number;
}

/** Contador de um grupo fora da fila (em revisão, aprovado aguardando a data). */
export interface ResumoFora {
  parcelas: number;
  valor: number;
}

/**
 * Onde uma parcela do link de aprovação foi parar quando não está mais na fila.
 *
 * `status` é o da parcela; `naoEncontrada` cobre id que não existe (ou que a RLS
 * não deixa esta pessoa ver), que é diferente de "já foi aprovada".
 */
export interface ParcelaForaDaFila {
  id: string;
  numero: string | null;
  fornecedorNome: string;
  valor: number;
  status: StatusParcela | null;
  naoEncontrada: boolean;
}

/** Nome de exibição do fornecedor: fantasia quando existe, senão razão social. */
function nomeFornecedor(
  fornecedor: { razao_social: string; nome_fantasia: string | null } | null,
): string {
  if (!fornecedor) return "-";
  return fornecedor.nome_fantasia ?? fornecedor.razao_social;
}

/**
 * Lista as parcelas pendentes de aprovação: status='pendente' em parcelas de
 * lançamentos do tipo a_pagar. Ordena por vencimento, do mais antigo para o
 * mais novo, para a fila priorizar o que vence primeiro. O filtro por tipo
 * a_pagar é feito via embed com `!inner` para descartar parcelas de
 * lançamentos a_receber.
 *
 * Também exclui parcelas de lançamento 'previsto' (lançamento incompleto: as
 * parcelas não somam o valor), que o banco recusa pelo mesmo motivo em
 * fn_aprovar_parcela, e parcelas cujo lançamento pai está `cancelado`.
 */
export async function listarParcelasPendentes(): Promise<ParcelaPendente[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lancamento_parcelas")
    .select(
      `id, numero_parcela, valor, data_vencimento, data_programada, lancamento_id,
       conta_bancaria_id,
       contas_bancarias(nome),
       lancamentos!inner(
         numero, descricao, tipo, status, origem, origem_id,
         mes_competencia, data_compra,
         categorias_financeiras(nome),
         formas_pagamento(nome),
         fornecedores(razao_social, nome_fantasia),
         lancamento_rateios(valor, centros_custo(nome))
       )`,
    )
    .eq("status", "pendente")
    .eq("lancamentos.tipo", "a_pagar")
    .neq("lancamentos.status", "cancelado")
    .neq("lancamentos.status", "previsto")
    // Sem conta bancária escolhida o pagamento não entra na fila: a conta é o
    // passo de revisão do lançamento, e o banco recusa aprovar sem ela
    // (fn_aprovar_parcela). Aqui é a mesma trava na consulta.
    .not("conta_bancaria_id", "is", null)
    .order("data_vencimento", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error("Não foi possível carregar os pagamentos para aprovação");
  }

  const linhas = data ?? [];

  const idsOc = linhas.map((parcela) =>
    parcela.lancamentos?.origem === "oc"
      ? (parcela.lancamentos?.origem_id ?? null)
      : null,
  );

  const lancamentoIds = linhas.map((parcela) => parcela.lancamento_id);

  const [semNota, numeroOc, anexosPorLancamento, parcelasPorLancamento] =
    await Promise.all([
      ocsSemNota(supabase, idsOc),
      numerosDeOc(supabase, idsOc),
      contarAnexos(supabase, lancamentoIds),
      contarParcelas(supabase, lancamentoIds),
    ]);

  return linhas.map((parcela) => {
    const lancamento = parcela.lancamentos;
    const origemId = lancamento?.origem_id ?? null;
    return {
      id: parcela.id,
      numeroParcela: parcela.numero_parcela,
      totalParcelas: parcelasPorLancamento.get(parcela.lancamento_id) ?? 1,
      valor: parcela.valor,
      dataVencimento: parcela.data_vencimento,
      dataProgramada: parcela.data_programada,
      lancamentoId: parcela.lancamento_id,
      lancamentoNumero: lancamento?.numero ?? null,
      lancamentoDescricao: lancamento?.descricao ?? "-",
      fornecedorNome: nomeFornecedor(lancamento?.fornecedores ?? null),
      origem: lancamento?.origem ?? "manual",
      origemId,
      origemNumero:
        lancamento?.origem === "oc" && origemId
          ? (numeroOc.get(origemId) ?? null)
          : null,
      categoriaNome: lancamento?.categorias_financeiras?.nome ?? null,
      formaPagamentoNome: lancamento?.formas_pagamento?.nome ?? null,
      contaBancariaId: parcela.conta_bancaria_id,
      contaBancariaNome: parcela.contas_bancarias?.nome ?? null,
      dataCompra: lancamento?.data_compra ?? null,
      mesCompetencia: lancamento?.mes_competencia ?? null,
      rateios: (lancamento?.lancamento_rateios ?? []).map((rateio) => ({
        nome: rateio.centros_custo?.nome ?? "-",
        valor: rateio.valor,
      })),
      anexos: anexosPorLancamento.get(parcela.lancamento_id) ?? 0,
      semNota: Boolean(
        lancamento?.origem === "oc" && origemId && semNota.has(origemId),
      ),
    };
  });
}

/**
 * Das OCs informadas, quais ainda não têm recebimento (nota fiscal) registrado.
 * Uma consulta a mais, só com os ids da fila.
 */
async function ocsSemNota(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: (string | null)[],
): Promise<Set<string>> {
  const unicos = [...new Set(ids.filter((id): id is string => id !== null))];
  if (unicos.length === 0) return new Set();

  const { data } = await supabase
    .from("recebimentos")
    .select("ordem_compra_id")
    .in("ordem_compra_id", unicos);

  const comNota = new Set((data ?? []).map((r) => r.ordem_compra_id));
  return new Set(unicos.filter((id) => !comNota.has(id)));
}

/** Número da OC de origem, para a coluna Origem virar link com rótulo. */
async function numerosDeOc(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((id): id is string => id !== null))];
  if (unicos.length === 0) return new Map();

  const { data } = await supabase
    .from("ordens_compra")
    .select("id, numero")
    .in("id", unicos);

  return new Map(
    (data ?? [])
      .filter((ordem): ordem is { id: string; numero: string } =>
        Boolean(ordem.numero),
      )
      .map((ordem) => [ordem.id, ordem.numero]),
  );
}

/**
 * Quantas parcelas cada lançamento da fila tem, para o rótulo "parcela N de M".
 *
 * Consulta separada em vez de embed aninhado: partindo de lancamento_parcelas,
 * pedir lancamentos(lancamento_parcelas(...)) fecha um ciclo na mesma tabela, e
 * ciclo no PostgREST é convite para ambiguidade de embed. Uma consulta a mais,
 * previsível, vale mais que uma economizada que pode estourar em produção com
 * dado que hoje não existe na fila.
 */
async function contarParcelas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lancamentoIds: string[],
): Promise<Map<string, number>> {
  const unicos = [...new Set(lancamentoIds)];
  if (unicos.length === 0) return new Map();

  const { data } = await supabase
    .from("lancamento_parcelas")
    .select("lancamento_id")
    .in("lancamento_id", unicos);

  const contagem = new Map<string, number>();
  for (const parcela of data ?? []) {
    contagem.set(
      parcela.lancamento_id,
      (contagem.get(parcela.lancamento_id) ?? 0) + 1,
    );
  }
  return contagem;
}

/** Quantos anexos cada lançamento da fila tem (contador da coluna Anexos). */
async function contarAnexos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lancamentoIds: string[],
): Promise<Map<string, number>> {
  const unicos = [...new Set(lancamentoIds)];
  if (unicos.length === 0) return new Map();

  const { data } = await supabase
    .from("anexo_vinculos")
    .select("entidade_id")
    .eq("entidade_tipo", "lancamento")
    .in("entidade_id", unicos);

  const contagem = new Map<string, number>();
  for (const vinculo of data ?? []) {
    contagem.set(
      vinculo.entidade_id,
      (contagem.get(vinculo.entidade_id) ?? 0) + 1,
    );
  }
  return contagem;
}

/**
 * Onde foram parar as parcelas de um link de aprovação que não estão na fila.
 *
 * Só roda quando alguém abre a tela por um link e alguma das parcelas não está
 * mais pendente, que é o caso comum de link que ficou parado no WhatsApp por uns
 * dias. Existe porque "nenhum pagamento encontrado" numa tela de dinheiro faz a
 * pessoa achar que o lançamento foi perdido e ligar para o financeiro; dizer
 * "essa parcela já está aprovada" encerra o assunto sozinho.
 *
 * Não filtra por tipo nem por status: aqui a pergunta é onde a parcela está, e a
 * resposta honesta inclui cancelado e pago. A RLS continua mandando no que esta
 * pessoa pode ver, e id invisível para ela sai como `naoEncontrada`.
 */
export async function statusDasParcelas(
  ids: string[],
): Promise<ParcelaForaDaFila[]> {
  if (ids.length === 0) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lancamento_parcelas")
    .select(
      `id, valor, status,
       lancamentos(numero, fornecedores(razao_social, nome_fantasia))`,
    )
    .in("id", ids);

  if (error) {
    throw new Error("Não foi possível verificar a situação desses pagamentos");
  }

  const porId = new Map((data ?? []).map((linha) => [linha.id, linha]));

  // Percorre os ids pedidos, não as linhas achadas: id que a consulta não
  // devolveu é justamente o que precisa aparecer como não encontrado.
  return ids.map((id) => {
    const linha = porId.get(id);
    if (!linha) {
      return {
        id,
        numero: null,
        fornecedorNome: "-",
        valor: 0,
        status: null,
        naoEncontrada: true,
      };
    }
    return {
      id,
      numero: linha.lancamentos?.numero ?? null,
      fornecedorNome: nomeFornecedor(linha.lancamentos?.fornecedores ?? null),
      valor: linha.valor,
      status: linha.status as StatusParcela,
      naoEncontrada: false,
    };
  });
}

/**
 * Quanto está fora da fila porque o lançamento está incompleto (previsto: sem
 * parcela, ou parcelas que não somam o valor). É o que transforma um "nada
 * aqui" em diagnóstico: o dinheiro existe, só não está aprovável ainda.
 */
export async function contarParcelasIncompletas(): Promise<ParcelasIncompletas> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("lancamento_parcelas")
    .select(
      `valor, lancamento_id,
       lancamentos!inner(tipo, status)`,
    )
    .eq("status", "pendente")
    .eq("lancamentos.tipo", "a_pagar")
    .eq("lancamentos.status", "previsto");

  const linhas = data ?? [];
  const valor = linhas.reduce((total, parcela) => total + parcela.valor, 0);
  const lancamentos = new Set(linhas.map((parcela) => parcela.lancamento_id));

  return { parcelas: linhas.length, valor, lancamentos: lancamentos.size };
}

/**
 * Quanto está fora da fila só porque ninguém escolheu a conta bancária ainda.
 * Sem esse contador o dinheiro fica invisível: some da fila e nada na tela diz
 * que ele existe nem o que falta para ele aparecer.
 */
export async function contarAguardandoConta(): Promise<ResumoFora> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("lancamento_parcelas")
    .select(`valor, lancamentos!inner(tipo, status)`)
    .eq("status", "pendente")
    .eq("lancamentos.tipo", "a_pagar")
    .neq("lancamentos.status", "cancelado")
    .neq("lancamentos.status", "previsto")
    .is("conta_bancaria_id", null);

  const linhas = data ?? [];
  return {
    parcelas: linhas.length,
    valor: linhas.reduce((total, parcela) => total + parcela.valor, 0),
  };
}

/**
 * Quanto está em revisão: saiu da fila esperando ajuste de quem lançou, e
 * continua contando na previsão de caixa. Sem esse contador, mandar para revisão
 * faria a parcela desaparecer da tela sem deixar rastro de para onde foi.
 */
export async function contarEmRevisao(): Promise<ResumoFora> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("lancamento_parcelas")
    .select(`valor, lancamentos!inner(tipo, status)`)
    .eq("status", "em_revisao")
    .eq("lancamentos.tipo", "a_pagar")
    .neq("lancamentos.status", "cancelado");

  const linhas = data ?? [];
  return {
    parcelas: linhas.length,
    valor: linhas.reduce((total, parcela) => total + parcela.valor, 0),
  };
}

/**
 * Uma parcela de dinheiro ou cartão de crédito: pagamento que nunca passa pela
 * fila de aprovação (dinheiro vai direto para Pagamentos, cartão nasce quitado)
 * e que o responsável pela aprovação confere depois, sem travar nada.
 *
 * Traz mais do que a tela mostra por padrão pelo mesmo motivo da fila: as
 * colunas são configuráveis, então o dado precisa estar aqui.
 */
export interface PagamentoDireto {
  id: string;
  numeroParcela: number;
  totalParcelas: number;
  valor: number;
  /** Desconto concedido no pagamento. Zero quando não houve. */
  desconto: number;
  /** Valor menos desconto: o que saiu da conta bancária. */
  valorLiquido: number;
  dataVencimento: string | null;
  /** Quando o dinheiro saiu de fato. Cartão já nasce com ela preenchida. */
  dataPagamento: string | null;
  status: StatusParcela;
  lancamentoId: string;
  lancamentoNumero: string | null;
  lancamentoDescricao: string;
  fornecedorNome: string;
  origem: string;
  origemId: string | null;
  origemNumero: string | null;
  categoriaNome: string | null;
  formaPagamentoNome: string | null;
  /** 'dinheiro' ou 'cartao_credito': é o tipo que define quem entra na aba. */
  formaPagamentoTipo: TipoFormaPagamento;
  contaBancariaId: string | null;
  contaBancariaNome: string | null;
  dataCompra: string | null;
  mesCompetencia: string | null;
  rateios: RateioResumo[];
  anexos: number;
  semNota: boolean;
  /**
   * Carimbo da conferência. `null` significa que ninguém marcou ainda, e só
   * isso: não é pendência, não segura pagamento nenhum. Quem marcou e quando
   * andam juntos por check no banco, então testar um dos dois basta.
   */
  conferidoEm: string | null;
  conferidoPorNome: string | null;
}

/** Garante que o status vindo do banco é um StatusParcela conhecido. */
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

/**
 * Lista as parcelas a pagar cuja forma de pagamento é dinheiro ou cartão de
 * crédito. É o oposto da fila: nada aqui espera aval, e a listagem existe para
 * o responsável pela aprovação conferir o que já seguiu sozinho.
 *
 * Sem filtro de status de propósito: parcela paga é o caso principal da aba
 * (cartão nasce quitado e dinheiro costuma ser pago antes de alguém olhar).
 * Ordena do vencimento mais novo para o mais antigo, ao contrário da fila: aqui
 * ninguém está correndo contra o vencimento, o que interessa é o que aconteceu
 * agora.
 */
export async function listarPagamentosDiretos(): Promise<PagamentoDireto[]> {
  const supabase = await createClient();

  // O embed de quem conferiu leva o nome da constraint: lancamento_parcelas tem
  // várias FKs para usuarios (aprovou, pagou, conferiu) e sem a dica o PostgREST
  // devolve erro de ambiguidade em vez de escolher uma. O nome tem que ser o do
  // banco letra por letra: errar aqui derruba a tela inteira, não só a coluna.
  const { data, error } = await supabase
    .from("lancamento_parcelas")
    .select(
      `id, numero_parcela, valor, desconto, valor_liquido,
       data_vencimento, data_pagamento, status,
       lancamento_id, conta_bancaria_id, conferido_em,
       usuarios!lancamento_parcelas_conferido_por_fkey(nome),
       contas_bancarias(nome),
       lancamentos!inner(
         numero, descricao, tipo, status, origem, origem_id,
         mes_competencia, data_compra,
         categorias_financeiras(nome),
         formas_pagamento!inner(nome, tipo),
         fornecedores(razao_social, nome_fantasia),
         lancamento_rateios(valor, centros_custo(nome))
       )`,
    )
    .eq("lancamentos.tipo", "a_pagar")
    .neq("lancamentos.status", "cancelado")
    .in("lancamentos.formas_pagamento.tipo", ["dinheiro", "cartao_credito"])
    .order("data_vencimento", { ascending: false, nullsFirst: false });

  if (error) {
    throw new Error(
      "Não foi possível carregar os pagamentos em dinheiro e cartão",
    );
  }

  // Segunda tranca no tipo, do lado do app. O filtro de cima atravessa dois
  // níveis de embed (parcela > lançamento > forma), e é o único lugar do projeto
  // que faz isso: se o PostgREST não aplicar o `in` como esperado, uma parcela
  // bancária apareceria numa aba que diz "não passa pela aprovação". O default
  // de tipoFormaPagamento é 'bancario', então o desconhecido também fica fora.
  const linhas = (data ?? []).filter((parcela) => {
    const tipo = tipoFormaPagamento(
      parcela.lancamentos?.formas_pagamento?.tipo,
    );
    return tipo === "dinheiro" || tipo === "cartao_credito";
  });

  const idsOc = linhas.map((parcela) =>
    parcela.lancamentos?.origem === "oc"
      ? (parcela.lancamentos?.origem_id ?? null)
      : null,
  );
  const lancamentoIds = linhas.map((parcela) => parcela.lancamento_id);

  const [semNota, numeroOc, anexosPorLancamento, parcelasPorLancamento] =
    await Promise.all([
      ocsSemNota(supabase, idsOc),
      numerosDeOc(supabase, idsOc),
      contarAnexos(supabase, lancamentoIds),
      contarParcelas(supabase, lancamentoIds),
    ]);

  return linhas.map((parcela) => {
    const lancamento = parcela.lancamentos;
    const origemId = lancamento?.origem_id ?? null;
    return {
      id: parcela.id,
      numeroParcela: parcela.numero_parcela,
      totalParcelas: parcelasPorLancamento.get(parcela.lancamento_id) ?? 1,
      valor: parcela.valor,
      desconto: parcela.desconto ?? 0,
      valorLiquido: parcela.valor_liquido ?? parcela.valor,
      dataVencimento: parcela.data_vencimento,
      dataPagamento: parcela.data_pagamento,
      status: comoStatusParcela(parcela.status),
      lancamentoId: parcela.lancamento_id,
      lancamentoNumero: lancamento?.numero ?? null,
      lancamentoDescricao: lancamento?.descricao ?? "-",
      fornecedorNome: nomeFornecedor(lancamento?.fornecedores ?? null),
      origem: lancamento?.origem ?? "manual",
      origemId,
      origemNumero:
        lancamento?.origem === "oc" && origemId
          ? (numeroOc.get(origemId) ?? null)
          : null,
      categoriaNome: lancamento?.categorias_financeiras?.nome ?? null,
      formaPagamentoNome: lancamento?.formas_pagamento?.nome ?? null,
      formaPagamentoTipo: tipoFormaPagamento(
        lancamento?.formas_pagamento?.tipo,
      ),
      contaBancariaId: parcela.conta_bancaria_id,
      contaBancariaNome: parcela.contas_bancarias?.nome ?? null,
      dataCompra: lancamento?.data_compra ?? null,
      mesCompetencia: lancamento?.mes_competencia ?? null,
      rateios: (lancamento?.lancamento_rateios ?? []).map((rateio) => ({
        nome: rateio.centros_custo?.nome ?? "-",
        valor: rateio.valor,
      })),
      anexos: anexosPorLancamento.get(parcela.lancamento_id) ?? 0,
      semNota: Boolean(
        lancamento?.origem === "oc" && origemId && semNota.has(origemId),
      ),
      conferidoEm: parcela.conferido_em,
      conferidoPorNome: parcela.usuarios?.nome ?? null,
    };
  });
}

/**
 * Quanto já foi aprovado e está esperando a data autorizada chegar. É o dinheiro
 * que saiu da fila de aprovação e ainda não pode ser pago: nem pendência de
 * quem aprova, nem disponível para quem paga.
 */
export async function contarAguardandoData(): Promise<ResumoFora> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("lancamento_parcelas")
    .select(`valor, data_programada, lancamentos!inner(tipo, status)`)
    .eq("status", "aprovado")
    .eq("lancamentos.tipo", "a_pagar")
    .neq("lancamentos.status", "cancelado")
    .gt("data_programada", dataHojeISO());

  const linhas = data ?? [];
  return {
    parcelas: linhas.length,
    valor: linhas.reduce((total, parcela) => total + parcela.valor, 0),
  };
}
