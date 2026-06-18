import "server-only";

import { TZDate } from "@date-fns/tz";

import { createClient } from "@/lib/supabase/server";
import { TIMEZONE } from "@/lib/formatadores";
import type { StatusOC } from "@/modules/compras/_shared/formato";

/** Linha resumida de ordem de compra para a lista das últimas ordens. */
export interface OrdemResumo {
  id: string;
  numero: string | null;
  fornecedorNome: string;
  valorTotal: number;
  status: StatusOC;
  dataEmissao: string;
}

/** Linha resumida de pedido para a lista de pedidos pendentes. */
export interface PedidoResumo {
  id: string;
  numero: string | null;
  justificativa: string | null;
  criadoEm: string;
}

/** KPIs e listas do painel gerencial de compras. */
export interface PainelCompras {
  pedidosPendentes: number;
  ordensPendentes: number;
  valorPrevisto: number;
  valorAPagar: number;
  ordensRecebidasMes: number;
  recebimentosMesQuantidade: number;
  recebimentosMesValor: number;
  ultimasOrdens: OrdemResumo[];
  pedidosPendentesLista: PedidoResumo[];
}

const LIMITE_LISTA = 5;

/** Soma os valores numéricos de uma lista de lançamentos. */
function somar(linhas: { valor: number | null }[]): number {
  return linhas.reduce((total, linha) => total + (linha.valor ?? 0), 0);
}

/**
 * Primeiro instante do mês corrente no fuso de Rio Branco, em ISO UTC.
 * O banco guarda timestamptz em UTC, então comparamos contra esse marco.
 */
function inicioDoMes(): string {
  const agora = new TZDate(new Date(), TIMEZONE);
  const primeiroDia = new TZDate(
    agora.getFullYear(),
    agora.getMonth(),
    1,
    TIMEZONE,
  );
  return new Date(primeiroDia.getTime()).toISOString();
}

/** Nome de exibição do fornecedor: fantasia quando há, senão razão social. */
function nomeFornecedor(
  fornecedor: { razao_social: string; nome_fantasia: string | null } | null,
): string {
  if (!fornecedor) return "";
  return fornecedor.nome_fantasia ?? fornecedor.razao_social;
}

/**
 * Carrega tudo que o painel de compras mostra em uma rodada de consultas.
 * Somente leitura. Contagens vêm de `count: "exact"`, somas de lançamentos
 * e listas das últimas ordens e dos pedidos pendentes.
 */
export async function painelCompras(): Promise<PainelCompras> {
  const supabase = await createClient();
  const desdeInicioDoMes = inicioDoMes();

  const [
    pedidosPendentes,
    ordensPendentes,
    previstos,
    aPagar,
    ordensRecebidasMes,
    recebimentosMes,
    ultimasOrdens,
    pedidosPendentesLista,
  ] = await Promise.all([
    supabase
      .from("pedidos")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendente_aprovacao"),
    supabase
      .from("ordens_compra")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendente_aprovacao"),
    supabase
      .from("lancamentos")
      .select("valor")
      .eq("origem", "oc")
      .eq("status", "previsto"),
    supabase
      .from("lancamentos")
      .select("valor")
      .eq("status", "a_pagar"),
    supabase
      .from("ordens_compra")
      .select("id", { count: "exact", head: true })
      .in("status", ["recebido", "recebido_parcial"])
      .gte("updated_at", desdeInicioDoMes),
    supabase
      .from("recebimentos")
      .select("valor_nf")
      .eq("status", "registrado")
      .gte("data_recebimento", desdeInicioDoMes),
    supabase
      .from("ordens_compra")
      .select(
        "id, numero, valor_total, status, data_emissao, fornecedores(razao_social, nome_fantasia)",
      )
      .order("created_at", { ascending: false })
      .limit(LIMITE_LISTA),
    supabase
      .from("pedidos")
      .select("id, numero, justificativa, created_at")
      .eq("status", "pendente_aprovacao")
      .order("created_at", { ascending: false })
      .limit(LIMITE_LISTA),
  ]);

  const erro =
    pedidosPendentes.error ??
    ordensPendentes.error ??
    previstos.error ??
    aPagar.error ??
    ordensRecebidasMes.error ??
    recebimentosMes.error ??
    ultimasOrdens.error ??
    pedidosPendentesLista.error;
  if (erro) {
    throw new Error("Não foi possível carregar o painel de compras");
  }

  const recebimentosLinhas = recebimentosMes.data ?? [];
  const recebimentosMesValor = recebimentosLinhas.reduce(
    (total, linha) => total + (linha.valor_nf ?? 0),
    0,
  );

  return {
    pedidosPendentes: pedidosPendentes.count ?? 0,
    ordensPendentes: ordensPendentes.count ?? 0,
    valorPrevisto: somar(previstos.data ?? []),
    valorAPagar: somar(aPagar.data ?? []),
    ordensRecebidasMes: ordensRecebidasMes.count ?? 0,
    recebimentosMesQuantidade: recebimentosLinhas.length,
    recebimentosMesValor,
    ultimasOrdens: (ultimasOrdens.data ?? []).map((ordem) => ({
      id: ordem.id,
      numero: ordem.numero,
      fornecedorNome: nomeFornecedor(ordem.fornecedores),
      valorTotal: ordem.valor_total,
      status: ordem.status as StatusOC,
      dataEmissao: ordem.data_emissao,
    })),
    pedidosPendentesLista: (pedidosPendentesLista.data ?? []).map((pedido) => ({
      id: pedido.id,
      numero: pedido.numero,
      justificativa: pedido.justificativa,
      criadoEm: pedido.created_at,
    })),
  };
}
