import "server-only";

import { createClient } from "@/lib/supabase/server";
import { ROTULO_BANCO, type BancoConta } from "@/modules/financeiro/_shared/formato";

/** Parcela a pagar já aprovada, pronta para registrar o pagamento. */
export interface ParcelaAprovada {
  id: string;
  lancamentoId: string;
  lancamentoNumero: string | null;
  numeroParcela: number;
  descricao: string;
  fornecedorNome: string;
  dataVencimento: string | null;
  valor: number;
  aprovadoEm: string | null;
}

/** Parcela já paga, para o histórico. */
export interface ParcelaPaga {
  id: string;
  lancamentoNumero: string | null;
  numeroParcela: number;
  descricao: string;
  fornecedorNome: string;
  contaNome: string;
  dataPagamento: string | null;
  valor: number;
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

/**
 * Parcelas aprovadas de lançamentos a pagar, prontas para pagamento.
 * Só status='aprovado' e do tipo a_pagar (a_receber baixa em contas a
 * receber, não aqui). Ordena por vencimento mais próximo primeiro.
 */
export async function listarParcelasAprovadas(): Promise<ParcelaAprovada[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lancamento_parcelas")
    .select(
      `id, numero_parcela, valor, data_vencimento, aprovado_em, lancamento_id,
       lancamentos!inner(
         numero, descricao, tipo,
         fornecedores(razao_social, nome_fantasia)
       )`,
    )
    .eq("status", "aprovado")
    .eq("lancamentos.tipo", "a_pagar")
    .order("data_vencimento", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error("Não foi possível carregar as parcelas a pagar");
  }

  return (data ?? []).map((parcela) => ({
    id: parcela.id,
    lancamentoId: parcela.lancamento_id,
    lancamentoNumero: parcela.lancamentos?.numero ?? null,
    numeroParcela: parcela.numero_parcela,
    descricao: parcela.lancamentos?.descricao ?? "-",
    fornecedorNome: nomeFornecedor(parcela.lancamentos?.fornecedores ?? null),
    dataVencimento: parcela.data_vencimento,
    valor: parcela.valor,
    aprovadoEm: parcela.aprovado_em,
  }));
}

/**
 * Histórico paginado de parcelas pagas, mais recentes primeiro. Resolve a
 * conta bancária do pagamento e o fornecedor do lançamento via join.
 */
export async function listarParcelasPagas({
  pagina,
  tamanho,
}: {
  pagina: number;
  tamanho: number;
}): Promise<ParcelasPagasPagina> {
  const supabase = await createClient();

  const de = pagina * tamanho;
  const ate = de + tamanho - 1;

  const { data, error, count } = await supabase
    .from("lancamento_parcelas")
    .select(
      `id, numero_parcela, valor, data_pagamento,
       contas_bancarias(nome, banco),
       lancamentos!inner(
         numero, descricao,
         fornecedores(razao_social, nome_fantasia)
       )`,
      { count: "exact" },
    )
    .eq("status", "pago")
    .order("data_pagamento", { ascending: false, nullsFirst: false })
    .order("pago_em", { ascending: false, nullsFirst: false })
    .range(de, ate);

  if (error) {
    throw new Error("Não foi possível carregar o histórico de pagamentos");
  }

  const itens: ParcelaPaga[] = (data ?? []).map((parcela) => ({
    id: parcela.id,
    lancamentoNumero: parcela.lancamentos?.numero ?? null,
    numeroParcela: parcela.numero_parcela,
    descricao: parcela.lancamentos?.descricao ?? "-",
    fornecedorNome: nomeFornecedor(parcela.lancamentos?.fornecedores ?? null),
    contaNome: parcela.contas_bancarias
      ? rotuloConta(parcela.contas_bancarias.nome, parcela.contas_bancarias.banco)
      : "-",
    dataPagamento: parcela.data_pagamento,
    valor: parcela.valor,
  }));

  return { itens, total: count ?? 0 };
}

/** Contas bancárias ativas para o select do pagamento, em ordem alfabética. */
export async function listarContasBancarias(): Promise<ContaBancariaOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contas_bancarias")
    .select("id, nome, banco")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as contas bancárias");
  }

  return (data ?? []).map((conta) => ({
    id: conta.id,
    nome: conta.nome,
    banco: conta.banco,
  }));
}
