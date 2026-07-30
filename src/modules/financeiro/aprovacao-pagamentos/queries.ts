import "server-only";

import { dataHojeISO } from "@/lib/formatadores";
import { createClient } from "@/lib/supabase/server";

/**
 * Linha da fila de aprovação de pagamentos: uma parcela pendente de um
 * lançamento do tipo a_pagar, com o lançamento e o fornecedor resolvidos
 * via join. O valor vem do banco, nunca recalculado no app.
 */
export interface ParcelaPendente {
  id: string;
  numeroParcela: number;
  valor: number;
  dataVencimento: string | null;
  lancamentoId: string;
  lancamentoNumero: string | null;
  lancamentoDescricao: string;
  fornecedorNome: string;
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
 * Também exclui parcelas de lançamento 'previsto' (OC aprovada sem nota fiscal
 * registrada): pagar antes do recebimento é furo de dinheiro, e o banco recusa
 * pelo mesmo motivo em fn_aprovar_parcela.
 *
 * Defesa em profundidade do bug #4 do QA: também exclui parcelas cujo
 * lançamento pai está `cancelado` (`lancamentos.status <> 'cancelado'`).
 * Cancelar a OC já cascateia o cancelamento pro lançamento e pras parcelas
 * não pagas (`fn_cancelar_ordem_compra`), então isso não deveria filtrar
 * nada em condições normais — mas se alguma parcela escapar da cascata (ex:
 * dado legado, outra origem de lançamento cancelado sem cascata), ela não
 * aparece na fila nem infla o "Total a aprovar".
 */
export async function listarParcelasPendentes(): Promise<ParcelaPendente[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lancamento_parcelas")
    .select(
      `id, numero_parcela, valor, data_vencimento, lancamento_id,
       lancamentos!inner(
         numero, descricao, tipo, status, origem, origem_id,
         fornecedores(razao_social, nome_fantasia)
       )`,
    )
    .eq("status", "pendente")
    .eq("lancamentos.tipo", "a_pagar")
    .neq("lancamentos.status", "cancelado")
    // 'previsto' é OC aprovada cuja nota fiscal ainda não foi registrada:
    // pagamento não entra na fila antes do recebimento. O banco também recusa
    // (fn_aprovar_parcela), isto aqui é a mesma trava na consulta.
    .neq("lancamentos.status", "previsto")
    .order("data_vencimento", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error("Não foi possível carregar os pagamentos para aprovação");
  }

  const linhas = data ?? [];
  const semNota = await ocsSemNota(
    supabase,
    linhas.map((parcela) =>
      parcela.lancamentos?.origem === "oc"
        ? (parcela.lancamentos?.origem_id ?? null)
        : null,
    ),
  );

  return linhas.map((parcela) => ({
    id: parcela.id,
    numeroParcela: parcela.numero_parcela,
    valor: parcela.valor,
    dataVencimento: parcela.data_vencimento,
    lancamentoId: parcela.lancamento_id,
    lancamentoNumero: parcela.lancamentos?.numero ?? null,
    lancamentoDescricao: parcela.lancamentos?.descricao ?? "-",
    fornecedorNome: nomeFornecedor(parcela.lancamentos?.fornecedores ?? null),
    semNota: Boolean(
      parcela.lancamentos?.origem === "oc" &&
        parcela.lancamentos?.origem_id &&
        semNota.has(parcela.lancamentos.origem_id),
    ),
  }));
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
