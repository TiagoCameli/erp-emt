import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { StatusParcela } from "@/modules/financeiro/_shared/formato";

/** Linha da listagem: uma parcela de um lançamento a receber. */
export interface ContaReceberLinha {
  id: string;
  lancamentoId: string;
  lancamentoNumero: string | null;
  descricao: string;
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

interface ParametrosListar {
  pagina: number;
  tamanho: number;
  status?: StatusParcela;
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
 * lançamento (número e descrição) resolvido via join. Filtra por status de
 * parcela quando informado. O total em aberto soma pendentes e aprovadas de
 * toda a base (não só da página), para o KPI.
 */
export async function listarContasReceber({
  pagina,
  tamanho,
  status,
}: ParametrosListar): Promise<PaginaContasReceber> {
  const supabase = await createClient();

  const de = pagina * tamanho;
  const ate = de + tamanho - 1;

  let consulta = supabase
    .from("lancamento_parcelas")
    .select(
      `id, numero_parcela, data_vencimento, valor, status, lancamento_id,
       lancamentos!inner(numero, descricao, tipo)`,
      { count: "exact" },
    )
    .eq("lancamentos.tipo", "a_receber");

  if (status) {
    consulta = consulta.eq("status", status);
  }

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
    numeroParcela: parcela.numero_parcela,
    dataVencimento: parcela.data_vencimento,
    valor: parcela.valor,
    status: comoStatusParcela(parcela.status),
  }));

  const totalEmAberto = await somarEmAberto(supabase);

  return { linhas, total: count ?? 0, totalEmAberto };
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

  return data.reduce(
    (total, parcela) => total + Number(parcela.valor ?? 0),
    0,
  );
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
