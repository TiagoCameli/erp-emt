import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { StatusParcela } from "@/modules/financeiro/_shared/formato";

/** Linha da listagem: uma parcela de um lançamento a receber. */
export interface ContaReceberLinha {
  id: string;
  lancamentoId: string;
  lancamentoNumero: string | null;
  descricao: string;
  /** Categoria financeira do lançamento, exibida junto da descrição. */
  categoriaNome: string | null;
  numeroParcela: number;
  dataVencimento: string | null;
  valor: number;
  status: StatusParcela;
}

/** Página de contas a receber, com total para paginação server-side. */
export interface PaginaContasReceber {
  linhas: ContaReceberLinha[];
  total: number;
  /** Soma das parcelas ainda em aberto (status pendente ou aprovado). */
  totalEmAberto: number;
}

/** Opção de conta bancária para a baixa de recebimento. */
export interface ContaBancariaOpcao {
  id: string;
  nome: string;
}

/** Opção de categoria de receita para o lançamento a receber. */
export interface CategoriaOpcao {
  id: string;
  nome: string;
}

/**
 * Filtros da listagem. Todos são aplicados no BANCO: a listagem é paginada
 * server-side, e filtrar só a página carregada mentiria para o usuário (ele
 * filtra, vê 3 linhas e conclui que só existem 3).
 */
export interface ParametrosListar {
  pagina: number;
  tamanho: number;
  status?: StatusParcela;
  /** Número ou descrição do lançamento (ilike nos dois). */
  busca?: string;
  categoriaId?: string;
  /** Mês de referência exato (yyyy-MM-01). */
  mesCompetencia?: string;
  /** Conta em que o recebimento foi (ou vai ser) baixado. */
  contaBancariaId?: string;
  valorDe?: number;
  valorAte?: number;
  vencimentoDe?: string;
  vencimentoAte?: string;
  /** Período da data de recebimento (data_pagamento da parcela). */
  recebimentoDe?: string;
  recebimentoAte?: string;
}

/** Termo de busca sanitizado para o padrão ilike do PostgREST. */
function padraoBusca(termo: string): string {
  return `%${termo.replace(/[,()"'\\]/g, "").trim()}%`;
}

/** Linha crua de parcela com o lançamento embutido pelo join. */
interface ParcelaComLancamento {
  id: string;
  numero_parcela: number;
  data_vencimento: string | null;
  valor: number;
  status: string;
  lancamento_id: string;
  lancamentos: {
    numero: string | null;
    descricao: string;
    tipo: string;
    categorias_financeiras: { nome: string } | null;
  } | null;
}

/** Garante que o status do banco é um StatusParcela conhecido. */
function comoStatusParcela(status: string): StatusParcela {
  switch (status) {
    case "pendente":
    case "aprovado":
    case "pago":
    case "cancelado":
      return status;
    default:
      return "pendente";
  }
}

/**
 * Lista as parcelas de lançamentos do tipo a_receber, paginadas, com o
 * lançamento (número e descrição) resolvido via join. Todos os filtros da tela
 * são aplicados aqui, no banco, porque a paginação é server-side. O total em
 * aberto soma pendentes e aprovadas de toda a base (não só da página), para o
 * KPI: ele responde "quanto falta receber", não "quanto sobrou na tela".
 *
 * A busca vira uma consulta de ids: o termo procura número e descrição do
 * LANÇAMENTO, que é o outro lado do join, e resolver os ids antes é o mesmo
 * padrão de `compras/ordens` (previsível, sem `or` em recurso embutido).
 */
export async function listarContasReceber({
  pagina,
  tamanho,
  status,
  busca,
  categoriaId,
  mesCompetencia,
  contaBancariaId,
  valorDe,
  valorAte,
  vencimentoDe,
  vencimentoAte,
  recebimentoDe,
  recebimentoAte,
}: ParametrosListar): Promise<PaginaContasReceber> {
  const supabase = await createClient();

  const de = pagina * tamanho;
  const ate = de + tamanho - 1;

  const totalEmAbertoBase = await somarEmAberto(supabase);

  let idsBusca: string[] | null = null;
  if (busca?.trim()) {
    const padrao = padraoBusca(busca);
    const { data: lancamentos } = await supabase
      .from("lancamentos")
      .select("id")
      .eq("tipo", "a_receber")
      .or(`numero.ilike.${padrao},descricao.ilike.${padrao}`);
    idsBusca = (lancamentos ?? []).map((lancamento) => lancamento.id);
    // Nenhum lançamento casa com o termo: devolve vazio sem ir buscar a lista.
    if (idsBusca.length === 0) {
      return { linhas: [], total: 0, totalEmAberto: totalEmAbertoBase };
    }
  }

  let consulta = supabase
    .from("lancamento_parcelas")
    .select(
      `id, numero_parcela, data_vencimento, valor, status, lancamento_id,
       lancamentos!inner(numero, descricao, tipo, categorias_financeiras(nome))`,
      { count: "exact" },
    )
    .eq("lancamentos.tipo", "a_receber");

  if (status) {
    consulta = consulta.eq("status", status);
  }
  if (idsBusca) consulta = consulta.in("lancamento_id", idsBusca);
  if (categoriaId) {
    consulta = consulta.eq("lancamentos.categoria_id", categoriaId);
  }
  if (mesCompetencia) {
    consulta = consulta.eq("lancamentos.mes_competencia", mesCompetencia);
  }
  if (contaBancariaId) {
    consulta = consulta.eq("conta_bancaria_id", contaBancariaId);
  }
  // Dinheiro é NUMERIC(14,2) no banco: comparação por gte/lte, nunca por texto.
  if (valorDe !== undefined) consulta = consulta.gte("valor", valorDe);
  if (valorAte !== undefined) consulta = consulta.lte("valor", valorAte);
  if (vencimentoDe) consulta = consulta.gte("data_vencimento", vencimentoDe);
  if (vencimentoAte) consulta = consulta.lte("data_vencimento", vencimentoAte);
  if (recebimentoDe) consulta = consulta.gte("data_pagamento", recebimentoDe);
  if (recebimentoAte) consulta = consulta.lte("data_pagamento", recebimentoAte);

  const { data, error, count } = await consulta
    .order("data_vencimento", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(de, ate);

  if (error) {
    throw new Error("Não foi possível carregar as contas a receber");
  }

  const linhas: ContaReceberLinha[] = (
    (data ?? []) as ParcelaComLancamento[]
  ).map((parcela) => ({
    id: parcela.id,
    lancamentoId: parcela.lancamento_id,
    lancamentoNumero: parcela.lancamentos?.numero ?? null,
    descricao: parcela.lancamentos?.descricao ?? "-",
    categoriaNome: parcela.lancamentos?.categorias_financeiras?.nome ?? null,
    numeroParcela: parcela.numero_parcela,
    dataVencimento: parcela.data_vencimento,
    valor: parcela.valor,
    status: comoStatusParcela(parcela.status),
  }));

  return { linhas, total: count ?? 0, totalEmAberto: totalEmAbertoBase };
}

/** Soma o valor das parcelas a receber ainda em aberto (pendente ou aprovado). */
async function somarEmAberto(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<number> {
  const { data, error } = await supabase
    .from("lancamento_parcelas")
    .select("valor, status, lancamentos!inner(tipo)")
    .eq("lancamentos.tipo", "a_receber")
    .in("status", ["pendente", "aprovado"]);

  if (error || !data) return 0;

  // Soma em centavos (inteiros) para não acumular erro de ponto flutuante e só
  // dividimos por 100 no fim, igual ao padrão do módulo.
  const totalCentavos = data.reduce(
    (total, parcela) => total + Math.round(Number(parcela.valor ?? 0) * 100),
    0,
  );
  return totalCentavos / 100;
}

/** Contas bancárias ativas para a baixa, em ordem alfabética. */
export async function listarContasBancarias(): Promise<ContaBancariaOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contas_bancarias")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as contas bancárias");
  }

  return (data ?? []).map((conta) => ({ id: conta.id, nome: conta.nome }));
}

/** Categorias de receita ativas para o lançamento, em ordem alfabética. */
export async function listarCategorias(): Promise<CategoriaOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categorias_financeiras")
    .select("id, nome")
    .eq("tipo", "receita")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as categorias");
  }

  return (data ?? []).map((categoria) => ({
    id: categoria.id,
    nome: categoria.nome,
  }));
}
