import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  ROTULO_BANCO,
  type BancoConta,
  type TipoLancamento,
} from "@/modules/financeiro/_shared/formato";

/** Tipo de movimento de uma transação de extrato. */
export type TipoMovimento = "credito" | "debito";

/** Parcela de lançamento vinculada a uma transação (ou sugerida para vínculo). */
export interface ParcelaVinculada {
  id: string;
  lancamentoId: string;
  lancamentoNumero: string | null;
  lancamentoDescricao: string;
  /** Tipo do lançamento: a_receber (entrada) ou a_pagar (saída). */
  tipoLancamento: TipoLancamento;
  fornecedorNome: string | null;
  numeroParcela: number;
  valor: number;
  dataPagamento: string | null;
  dataVencimento: string | null;
}

/** Linha da tabela de transações do extrato. */
export interface TransacaoLista {
  id: string;
  extratoId: string;
  contaBancariaId: string;
  dataMovimento: string;
  memo: string | null;
  valor: number;
  tipo: TipoMovimento;
  conciliada: boolean;
  parcela: ParcelaVinculada | null;
}

/** Linha da lista de extratos importados. */
export interface ExtratoLista {
  id: string;
  contaBancariaId: string;
  contaBancariaNome: string;
  nomeArquivo: string | null;
  periodoInicio: string | null;
  periodoFim: string | null;
  importadoEm: string;
  qtdTransacoes: number;
  qtdConciliadas: number;
}

/** Opção de conta bancária para o seletor. */
export interface ContaBancariaOpcao {
  id: string;
  nome: string;
  banco: BancoConta;
  bancoRotulo: string;
  ativo: boolean;
}

/** Filtros da listagem de transações de extrato. */
export interface FiltroTransacoes {
  extratoId?: string;
  contaId?: string;
  conciliada?: boolean;
}

/** Tipo bruto de banco do Postgres normalizado para o union conhecido. */
function bancoConhecido(banco: string): BancoConta {
  return banco === "caixa" || banco === "bb" || banco === "sicredi"
    ? banco
    : "outro";
}

/** Tipo bruto de movimento normalizado: tudo que não é crédito é débito. */
function tipoMovimento(tipo: string): TipoMovimento {
  return tipo === "credito" ? "credito" : "debito";
}

/** Nome de exibição do fornecedor: fantasia quando existe, senão razão social. */
function nomeFornecedor(
  fornecedor: { razao_social: string; nome_fantasia: string | null } | null,
): string | null {
  if (!fornecedor) return null;
  return fornecedor.nome_fantasia ?? fornecedor.razao_social;
}

/** Forma que o Supabase devolve a parcela embutida na transação (join). */
interface ParcelaJoin {
  id: string;
  numero_parcela: number;
  valor: number;
  data_pagamento: string | null;
  data_vencimento: string | null;
  lancamentos: {
    id: string;
    numero: string | null;
    descricao: string;
    tipo: string;
    fornecedores: {
      razao_social: string;
      nome_fantasia: string | null;
    } | null;
  } | null;
}

/** Tipo bruto de lançamento normalizado: tudo que não é a_receber é a_pagar. */
function tipoLancamento(tipo: string | undefined): TipoLancamento {
  return tipo === "a_receber" ? "a_receber" : "a_pagar";
}

/** Converte a parcela embutida (join) no shape de ParcelaVinculada. */
function paraParcelaVinculada(parcela: ParcelaJoin): ParcelaVinculada {
  const lancamento = parcela.lancamentos;
  return {
    id: parcela.id,
    lancamentoId: lancamento?.id ?? "",
    lancamentoNumero: lancamento?.numero ?? null,
    lancamentoDescricao: lancamento?.descricao ?? "-",
    tipoLancamento: tipoLancamento(lancamento?.tipo),
    fornecedorNome: nomeFornecedor(lancamento?.fornecedores ?? null),
    numeroParcela: parcela.numero_parcela,
    valor: parcela.valor,
    dataPagamento: parcela.data_pagamento,
    dataVencimento: parcela.data_vencimento,
  };
}

/** Colunas da parcela usadas no select embutido das transações. */
const SELECT_PARCELA =
  "id, numero_parcela, valor, data_pagamento, data_vencimento, lancamentos(id, numero, descricao, tipo, fornecedores(razao_social, nome_fantasia))";

/**
 * Lista os extratos OFX importados, com a conta, o período e a contagem de
 * transações e conciliadas. Mais recentes (por importação) primeiro.
 */
export async function listarExtratos(): Promise<ExtratoLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("extratos_ofx")
    .select(
      "id, conta_bancaria_id, nome_arquivo, periodo_inicio, periodo_fim, importado_em, contas_bancarias(nome), extrato_transacoes(conciliada)",
    )
    .order("importado_em", { ascending: false });

  if (error) {
    throw new Error("Não foi possível carregar os extratos importados");
  }

  return (data ?? []).map((extrato) => {
    const transacoes = extrato.extrato_transacoes ?? [];
    return {
      id: extrato.id,
      contaBancariaId: extrato.conta_bancaria_id,
      contaBancariaNome: extrato.contas_bancarias?.nome ?? "-",
      nomeArquivo: extrato.nome_arquivo,
      periodoInicio: extrato.periodo_inicio,
      periodoFim: extrato.periodo_fim,
      importadoEm: extrato.importado_em,
      qtdTransacoes: transacoes.length,
      qtdConciliadas: transacoes.filter((t) => t.conciliada).length,
    };
  });
}

/**
 * Lista as transações de extrato com a parcela vinculada (quando houver),
 * aplicando os filtros opcionais de extrato, conta e estado de conciliação.
 * Mais recentes (por data de movimento) primeiro.
 */
export async function listarTransacoes(
  filtro: FiltroTransacoes = {},
): Promise<TransacaoLista[]> {
  const supabase = await createClient();

  let consulta = supabase
    .from("extrato_transacoes")
    .select(
      `id, extrato_id, conta_bancaria_id, data_movimento, memo, valor, tipo, conciliada,
       lancamento_parcelas(${SELECT_PARCELA})`,
    )
    .order("data_movimento", { ascending: false })
    .order("created_at", { ascending: false });

  if (filtro.extratoId) consulta = consulta.eq("extrato_id", filtro.extratoId);
  if (filtro.contaId) consulta = consulta.eq("conta_bancaria_id", filtro.contaId);
  if (filtro.conciliada !== undefined) {
    consulta = consulta.eq("conciliada", filtro.conciliada);
  }

  const { data, error } = await consulta;

  if (error) {
    throw new Error("Não foi possível carregar as transações do extrato");
  }

  return (data ?? []).map((transacao) => ({
    id: transacao.id,
    extratoId: transacao.extrato_id,
    contaBancariaId: transacao.conta_bancaria_id,
    dataMovimento: transacao.data_movimento,
    memo: transacao.memo,
    valor: transacao.valor,
    tipo: tipoMovimento(transacao.tipo),
    conciliada: transacao.conciliada,
    parcela: transacao.lancamento_parcelas
      ? paraParcelaVinculada(transacao.lancamento_parcelas as ParcelaJoin)
      : null,
  }));
}

/** Diferença em dias entre duas datas-só-dia (yyyy-MM-dd). */
function diferencaDias(dataA: string, dataB: string): number {
  const msPorDia = 24 * 60 * 60 * 1000;
  const a = Date.parse(`${dataA}T00:00:00Z`);
  const b = Date.parse(`${dataB}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.round((a - b) / msPorDia));
}

/**
 * Sugere parcelas pagas para conciliar com a transação: mesma conta bancária,
 * valor igual em módulo, sentido coerente (crédito casa com a_receber, débito
 * com a_pagar), pagas (status pago) e ainda não vinculadas a nenhuma
 * transação, com data de pagamento dentro de +/- 3 dias do movimento. Ordena
 * pela proximidade da data de pagamento.
 */
export async function sugerirParcelas(
  transacao: Pick<TransacaoLista, "contaBancariaId" | "valor" | "dataMovimento">,
): Promise<ParcelaVinculada[]> {
  const supabase = await createClient();

  const valorAbsoluto = Math.abs(transacao.valor);
  // Crédito (entrada) só casa com recebível; débito (saída) só com a pagar.
  const tipoEsperado: TipoLancamento =
    transacao.valor >= 0 ? "a_receber" : "a_pagar";

  const { data, error } = await supabase
    .from("lancamento_parcelas")
    .select(SELECT_PARCELA)
    .eq("status", "pago")
    .eq("conta_bancaria_id", transacao.contaBancariaId)
    .eq("valor", valorAbsoluto)
    .eq("lancamentos.tipo", tipoEsperado)
    .not("data_pagamento", "is", null);

  if (error) {
    throw new Error("Não foi possível buscar sugestões de parcela");
  }

  // Exclui parcelas já vinculadas a alguma transação de extrato.
  const idsParcelas = (data ?? []).map((parcela) => parcela.id);
  const vinculadas = new Set<string>();
  if (idsParcelas.length > 0) {
    const { data: jaVinculadas } = await supabase
      .from("extrato_transacoes")
      .select("parcela_id")
      .in("parcela_id", idsParcelas);
    for (const linha of jaVinculadas ?? []) {
      if (linha.parcela_id) vinculadas.add(linha.parcela_id);
    }
  }

  return (data ?? [])
    .map((parcela) => paraParcelaVinculada(parcela as ParcelaJoin))
    .filter((parcela) => {
      // O !inner não está disponível aqui (lancamentos pode vir null no join
      // filtrado), então reforçamos o sentido em memória.
      if (parcela.tipoLancamento !== tipoEsperado) return false;
      if (vinculadas.has(parcela.id)) return false;
      if (!parcela.dataPagamento) return false;
      return diferencaDias(parcela.dataPagamento, transacao.dataMovimento) <= 3;
    })
    .sort((a, b) => {
      const diaA = a.dataPagamento
        ? diferencaDias(a.dataPagamento, transacao.dataMovimento)
        : Number.POSITIVE_INFINITY;
      const diaB = b.dataPagamento
        ? diferencaDias(b.dataPagamento, transacao.dataMovimento)
        : Number.POSITIVE_INFINITY;
      return diaA - diaB;
    });
}

/** Contas bancárias ativas para o seletor da conciliação, em ordem alfabética. */
export async function listarContasBancarias(): Promise<ContaBancariaOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contas_bancarias")
    .select("id, nome, banco, ativo")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as contas bancárias");
  }

  return (data ?? []).map((conta) => {
    const banco = bancoConhecido(conta.banco);
    return {
      id: conta.id,
      nome: conta.nome,
      banco,
      bancoRotulo: ROTULO_BANCO[banco],
      ativo: conta.ativo,
    };
  });
}
