import "server-only";

import { dataHojeISO, mesHojeISO } from "@/lib/formatadores";
import { createClient } from "@/lib/supabase/server";
import {
  agregarPorPrazo,
  janelaPainel,
  MESES_PAINEL,
  paraCentavos,
  paraReais,
  participacao,
  serieMensal,
  variacaoPercentual,
  type FaixaVencimento,
  type JanelaPainel,
  type ParcelaPrazo,
  type PontoMes,
} from "@/modules/gestao/calculo";

/**
 * Leituras do painel de Gestão (BI). Tudo somente leitura e agregado no banco
 * pelas RPCs fn_rel_* (security invoker, mesmo RLS do usuário), que devolvem
 * poucas linhas em vez das milhares de linhas cruas: esta é a primeira tela
 * depois do login.
 *
 * Nenhuma consulta daqui pode trazer linha crua sem limite. Não é só custo: o
 * PostgREST corta em 1000 linhas SEM ERRO, então somar no Node o que ele
 * devolveu dá um número menor que o do banco, calado, no dia em que a tabela
 * passar de mil linhas. Toda contagem e toda soma sai do Postgres (RPC, ou
 * count exact com head). Quem traz linha (maioresCustos) traz com `.limit()`
 * explícito, porque ali o recorte é a regra, não um acidente.
 *
 * O teto de 1000 vale para RPC também: uma função que devolvesse mais de mil
 * linhas seria cortada do mesmo jeito. As daqui devolvem uma linha (resumos),
 * uma por mês, uma por centro de custo ou uma por grupo. A exceção a vigiar é
 * `fn_rel_aging`, que devolve uma linha por data de vencimento em aberto: o dia
 * em que a EMT tiver mais de mil vencimentos distintos em aberto, ela precisa
 * agregar por faixa no banco em vez de por data.
 *
 * Todos os cortes de custo usam a MESMA janela de competência (janelaPainel),
 * então o total do gráfico por mês fecha com o de centro de custo e com o de
 * grupo. Custo é regime de competência (mês de referência), não caixa.
 *
 * As RPCs são as mesmas do relatório financeiro. A duplicação é intencional:
 * Gestão não importa query de outro módulo, e o contrato compartilhado é a
 * função do banco, não o TypeScript.
 */

export interface ResumoCompras {
  ocsAprovar: { contagem: number; valor: number };
  ocsAbertas: { contagem: number; valor: number };
  cotacoesAbertas: number;
}

export interface ResumoFinanceiro {
  aPagar: { contagem: number; vencidas: number; valor: number };
  aAprovar: { contagem: number; valor: number };
  pagoNoMes: { contagem: number; valor: number };
}

export interface ResumoRh {
  colaboradoresAtivos: number;
  folha: { competencia: string | null; custoTotal: number };
  apontamentosAbertos: number;
}

/** NUMERIC do banco (que chega como string ou null) para reais, via centavos. */
function emReais(valor: number | string | null | undefined): number {
  return paraReais(paraCentavos(valor));
}

/** Janela de competência do painel: os últimos meses até o mês corrente. */
export function janelaDoPainel(): JanelaPainel {
  return janelaPainel(mesHojeISO(), MESES_PAINEL);
}

/**
 * Resumo de Compras: OCs a aprovar, OCs abertas e cotações em aberto.
 *
 * Contagem e soma vêm prontas do banco numa linha só. Antes isso baixava uma
 * linha por OC e somava aqui, o que passaria a mentir para menos assim que
 * `ordens_compra` cruzasse as 1000 linhas do teto do PostgREST.
 */
export async function comprasResumo(): Promise<ResumoCompras> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("fn_rel_gestao_compras_resumo");

  if (error) {
    throw new Error("Não foi possível carregar o resumo de Compras");
  }

  const linha = data?.[0];

  return {
    ocsAprovar: {
      contagem: linha?.ocs_aprovar_contagem ?? 0,
      valor: emReais(linha?.ocs_aprovar_valor),
    },
    ocsAbertas: {
      contagem: linha?.ocs_abertas_contagem ?? 0,
      valor: emReais(linha?.ocs_abertas_valor),
    },
    cotacoesAbertas: linha?.cotacoes_abertas ?? 0,
  };
}

/**
 * Resumo do Financeiro: a pagar (aprovadas vencendo/vencidas), a aprovar e pago
 * no mês.
 *
 * `lancamento_parcelas` é a tabela de maior volume do ERP e estes três números
 * saíam de três varreduras dela somadas no Node, uma delas (a aprovar) sem nem
 * filtro de data. Passando de 1000 parcelas o PostgREST devolveria 1000 sem
 * erro e o painel mostraria menos dinheiro do que a empresa tem a pagar. Agora
 * o banco devolve uma linha com os sete números prontos.
 *
 * `hoje` vai como parâmetro, e não fica a cargo do `now()` do Postgres, para o
 * cartão usar a MESMA data do resto do painel (fuso de Rio Branco).
 */
export async function financeiroResumo(): Promise<ResumoFinanceiro> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("fn_rel_gestao_financeiro_resumo", {
    p_hoje: dataHojeISO(),
  });

  if (error) {
    throw new Error("Não foi possível carregar o resumo do Financeiro");
  }

  const linha = data?.[0];

  return {
    aPagar: {
      contagem: linha?.a_pagar_contagem ?? 0,
      vencidas: linha?.a_pagar_vencidas ?? 0,
      valor: emReais(linha?.a_pagar_valor),
    },
    aAprovar: {
      contagem: linha?.a_aprovar_contagem ?? 0,
      valor: emReais(linha?.a_aprovar_valor),
    },
    pagoNoMes: {
      contagem: linha?.pago_mes_contagem ?? 0,
      valor: emReais(linha?.pago_mes_valor),
    },
  };
}

/** Resumo do RH: colaboradores ativos, custo da folha mais recente, apontamentos em aberto. */
export async function rhResumo(): Promise<ResumoRh> {
  const supabase = await createClient();

  const [colaboradores, folha, apontamentos] = await Promise.all([
    supabase
      .from("colaboradores")
      .select("id", { count: "exact", head: true })
      .eq("ativo", true),
    supabase
      .from("folhas")
      .select("competencia, custo_total")
      .order("competencia", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("rh_pontos")
      .select("id", { count: "exact", head: true })
      .eq("status", "aberto"),
  ]);

  if (colaboradores.error || folha.error || apontamentos.error) {
    throw new Error("Não foi possível carregar o resumo do RH");
  }

  return {
    colaboradoresAtivos: colaboradores.count ?? 0,
    folha: {
      competencia: folha.data?.competencia ?? null,
      custoTotal: Number(folha.data?.custo_total ?? 0),
    },
    apontamentosAbertos: apontamentos.count ?? 0,
  };
}

// =====================================================================
// Custo por mês de referência (tendência)
// =====================================================================

export interface CustoPorMes {
  /** Um ponto por mês da janela, inclusive os meses sem custo. */
  meses: PontoMes[];
  total: number;
  mesAtual: PontoMes;
  mesAnterior: PontoMes;
  /** Variação do mês atual sobre o anterior; null sem base de comparação. */
  variacao: number | null;
}

/**
 * Custo por MÊS DE REFERÊNCIA (competência), somando o rateio dos lançamentos
 * a pagar. É o gasto da obra: toda OC vira lançamento e existem lançamentos
 * avulsos, então o custo está nos lançamentos, não na data de pagamento.
 */
export async function custoPorMes(): Promise<CustoPorMes> {
  const supabase = await createClient();
  const janela = janelaDoPainel();

  const { data, error } = await supabase.rpc("fn_rel_custo_por_mes", {
    p_meses: janela.meses.length,
  });

  if (error) {
    throw new Error("Não foi possível carregar o custo por mês");
  }

  const meses = serieMensal(data ?? [], janela.meses);
  const total = meses.reduce((soma, m) => soma + m.valor, 0);
  const mesAtual = meses[meses.length - 1];
  const mesAnterior = meses[meses.length - 2] ?? mesAtual;

  return {
    meses,
    total,
    mesAtual,
    mesAnterior,
    variacao: variacaoPercentual(mesAtual.valor, mesAnterior.valor),
  };
}

// =====================================================================
// Custo por centro de custo (onde o dinheiro está indo)
// =====================================================================

/** Barras que cabem no painel; o excedente vira "Outros" e o relatório mostra tudo. */
const MAX_CENTROS = 6;

export interface CustoCentro {
  nome: string;
  valor: number;
  /** Percentual do total do período. */
  participacao: number;
}

export interface CustoPorCentro {
  centros: CustoCentro[];
  total: number;
  /** Quantos centros de custo tiveram gasto no período (antes do corte). */
  quantidade: number;
}

/** Custo do período por centro de custo, maiores primeiro, com "Outros" no fim. */
export async function custoPorCentroCusto(): Promise<CustoPorCentro> {
  const supabase = await createClient();
  const janela = janelaDoPainel();

  const { data, error } = await supabase.rpc("fn_rel_custo_centro_custo", {
    p_inicio: janela.inicio,
    p_fim: janela.fim,
  });

  if (error) {
    throw new Error("Não foi possível carregar o custo por centro de custo");
  }

  const linhas = (data ?? [])
    .map((linha) => ({
      nome: linha.codigo
        ? `${linha.codigo} ${linha.nome ?? ""}`.trim()
        : (linha.nome ?? "Sem centro de custo"),
      valor: paraReais(paraCentavos(linha.total)),
    }))
    .sort((a, b) => b.valor - a.valor);

  const total = linhas.reduce((soma, c) => soma + c.valor, 0);
  const principais = linhas.slice(0, MAX_CENTROS);
  const restantes = linhas.slice(MAX_CENTROS);

  const centros: CustoCentro[] = principais.map((c) => ({
    nome: c.nome,
    valor: c.valor,
    participacao: participacao(c.valor, total),
  }));

  if (restantes.length > 0) {
    const valor = restantes.reduce((soma, c) => soma + c.valor, 0);
    centros.push({
      nome: `Outros (${restantes.length})`,
      valor,
      participacao: participacao(valor, total),
    });
  }

  return { centros, total, quantidade: linhas.length };
}

// =====================================================================
// Custo por grupo de insumo (em que a obra gasta)
// =====================================================================

export interface CustoGrupo {
  nome: string;
  valor: number;
  participacao: number;
}

export interface CustoPorGrupo {
  grupos: CustoGrupo[];
  total: number;
}

/**
 * Custo do período pelos grupos de insumo (material, mão de obra, equipamento,
 * serviço). Lançamento avulso não tem insumo e entra em "Sem insumo": é isso
 * que faz a soma por grupo fechar com o custo total do período.
 */
export async function custoPorGrupo(): Promise<CustoPorGrupo> {
  const supabase = await createClient();
  const janela = janelaDoPainel();

  const { data, error } = await supabase.rpc("fn_rel_custo_por_grupo", {
    p_inicio: janela.inicio,
    p_fim: janela.fim,
  });

  if (error) {
    throw new Error("Não foi possível carregar o custo por grupo");
  }

  const linhas = (data ?? []).map((linha) => ({
    nome: linha.grupo_nome,
    valor: paraReais(paraCentavos(linha.total)),
  }));

  const total = linhas.reduce((soma, g) => soma + g.valor, 0);

  return {
    grupos: linhas.map((g) => ({
      ...g,
      participacao: participacao(g.valor, total),
    })),
    total,
  };
}

// =====================================================================
// A pagar por faixa de vencimento (o que aperta o caixa)
// =====================================================================

export interface APagarPorVencimento {
  faixas: FaixaVencimento[];
  total: number;
  vencido: number;
  /** Vence de hoje até 7 dias. */
  proximos7: number;
}

/**
 * Parcelas a pagar em aberto (pendente, em revisão ou aprovada) distribuídas
 * pelo prazo até o vencimento. Diferente do aging do Financeiro, que olha para
 * trás: aqui a pergunta é quanto o caixa precisa suportar nas próximas semanas.
 */
export async function aPagarPorVencimento(): Promise<APagarPorVencimento> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("fn_rel_aging");

  if (error) {
    throw new Error("Não foi possível carregar os vencimentos a pagar");
  }

  const parcelas: ParcelaPrazo[] = (data ?? [])
    .filter((linha) => linha.tipo !== "a_receber")
    .map((linha) => ({
      valor: linha.total,
      dataVencimento: linha.data_vencimento,
    }));

  const faixas = agregarPorPrazo(parcelas, dataHojeISO());
  const valorDa = (faixa: string) =>
    faixas.find((f) => f.faixa === faixa)?.valor ?? 0;

  return {
    faixas,
    total: faixas.reduce((soma, f) => soma + f.valor, 0),
    vencido: valorDa("vencido"),
    proximos7: valorDa("ate_7"),
  };
}

// =====================================================================
// Maiores custos do período (a tabela acionável)
// =====================================================================

/** Linhas da tabela do painel: é um recorte, o relatório mostra a lista toda. */
const MAX_MAIORES_CUSTOS = 8;

export interface MaiorCusto {
  id: string;
  numero: string | null;
  descricao: string;
  fornecedor: string | null;
  mesCompetencia: string;
  dataVencimento: string | null;
  valor: number;
}

/**
 * Os maiores lançamentos a pagar do período, por valor. Responde "o que puxou
 * o custo" sem precisar abrir o Financeiro, e o limite mantém a consulta barata
 * na primeira tela depois do login.
 */
export async function maioresCustos(): Promise<MaiorCusto[]> {
  const supabase = await createClient();
  const janela = janelaDoPainel();

  const { data, error } = await supabase
    .from("lancamentos")
    .select(
      `id, numero, descricao, valor, mes_competencia, data_vencimento,
       fornecedores(razao_social, nome_fantasia)`,
    )
    .eq("tipo", "a_pagar")
    .neq("status", "cancelado")
    .gte("mes_competencia", janela.inicio)
    .lt("mes_competencia", janela.fim)
    .order("valor", { ascending: false })
    .limit(MAX_MAIORES_CUSTOS);

  if (error) {
    throw new Error("Não foi possível carregar os maiores custos");
  }

  return (data ?? []).map((lancamento) => ({
    id: lancamento.id,
    numero: lancamento.numero,
    descricao: lancamento.descricao,
    fornecedor:
      lancamento.fornecedores?.nome_fantasia ??
      lancamento.fornecedores?.razao_social ??
      null,
    mesCompetencia: lancamento.mes_competencia,
    dataVencimento: lancamento.data_vencimento,
    valor: paraReais(paraCentavos(lancamento.valor)),
  }));
}
