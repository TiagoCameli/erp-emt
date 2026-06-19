import "server-only";

import { dataHojeISO } from "@/lib/formatadores";
import { createClient } from "@/lib/supabase/server";
import {
  agregarAging,
  mesDe,
  paraCentavos,
  paraReais,
  proximoMes,
  rotuloMes,
  somarPorCategoria,
  totalAging,
  totalCategorias,
  vencidoAging,
  type AgingFaixa,
  type DreLinha,
  type LancamentoCategoria,
  type ParcelaAging,
} from "@/modules/financeiro/relatorios/calculo";

// Reexporta a API pública dos relatórios (tipos e tabelas de faixa) para que os
// componentes continuem importando tudo de queries.ts, como antes da extração.
export {
  ORDEM_FAIXA_AGING,
  ROTULO_FAIXA_AGING,
  type AgingFaixa,
  type DreLinha,
  type FaixaAging,
} from "@/modules/financeiro/relatorios/calculo";

/**
 * Queries dos relatórios financeiros. Tudo somente leitura, agregando a partir
 * de lancamentos / lancamento_parcelas / lancamento_rateios / contas_bancarias.
 *
 * Datas: as colunas usadas (competencia, data_vencimento, data_pagamento) são
 * `date` puro no Postgres (sem hora), então o mês de um registro é o prefixo
 * "YYYY-MM" da string, e o "hoje" para aging é dataHojeISO() (já no fuso de
 * Rio Branco). Sem timestamptz no caminho, sem risco de pular dia por fuso.
 *
 * Valores e regras puras (faixa de aging, soma por categoria) vivem em
 * calculo.ts, testadas isoladas. Aqui só buscamos e delegamos.
 */

// =====================================================================
// 1. Fluxo de caixa
// =====================================================================

export interface FluxoCaixaMes {
  /** "YYYY-MM" para ordenação. */
  mes: string;
  /** "mm/aaaa" para exibição. */
  rotulo: string;
  entradasRealizado: number;
  entradasProjetado: number;
  saidasRealizado: number;
  saidasProjetado: number;
  /** entradas - saidas, considerando realizado + projetado. */
  saldo: number;
}

export interface FluxoCaixa {
  meses: FluxoCaixaMes[];
  totalEntradas: number;
  totalSaidas: number;
  totalRealizadoEntradas: number;
  totalRealizadoSaidas: number;
  saldoProjetado: number;
}

interface AcumuladorFluxo {
  entradasRealizado: number;
  entradasProjetado: number;
  saidasRealizado: number;
  saidasProjetado: number;
}

/**
 * Fluxo de caixa por mês de vencimento da parcela: entradas (lançamentos
 * a_receber) x saídas (a_pagar), separando realizado (parcelas pagas, pelo
 * mês de vencimento) de projetado (parcelas pendentes/aprovadas). Parcelas
 * canceladas ficam de fora.
 */
export async function fluxoCaixa(): Promise<FluxoCaixa> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lancamento_parcelas")
    .select(
      "valor, status, data_vencimento, lancamentos!inner(tipo, status)",
    )
    .neq("status", "cancelado")
    .neq("lancamentos.status", "cancelado");

  if (error) {
    throw new Error("Não foi possível carregar o fluxo de caixa");
  }

  const porMes = new Map<string, AcumuladorFluxo>();

  for (const parcela of data ?? []) {
    const mes = mesDe(parcela.data_vencimento);
    if (mes === null) continue;

    const lancamento = parcela.lancamentos as unknown as {
      tipo: string;
    } | null;
    if (!lancamento) continue;

    const centavos = paraCentavos(parcela.valor);
    const ehEntrada = lancamento.tipo === "a_receber";
    const realizado = parcela.status === "pago";

    const atual =
      porMes.get(mes) ??
      ({
        entradasRealizado: 0,
        entradasProjetado: 0,
        saidasRealizado: 0,
        saidasProjetado: 0,
      } satisfies AcumuladorFluxo);

    if (ehEntrada) {
      if (realizado) atual.entradasRealizado += centavos;
      else atual.entradasProjetado += centavos;
    } else {
      if (realizado) atual.saidasRealizado += centavos;
      else atual.saidasProjetado += centavos;
    }

    porMes.set(mes, atual);
  }

  const meses: FluxoCaixaMes[] = [...porMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, acc]) => {
      const entradas = acc.entradasRealizado + acc.entradasProjetado;
      const saidas = acc.saidasRealizado + acc.saidasProjetado;
      return {
        mes,
        rotulo: rotuloMes(mes),
        entradasRealizado: paraReais(acc.entradasRealizado),
        entradasProjetado: paraReais(acc.entradasProjetado),
        saidasRealizado: paraReais(acc.saidasRealizado),
        saidasProjetado: paraReais(acc.saidasProjetado),
        saldo: paraReais(entradas - saidas),
      };
    });

  let totalEntradas = 0;
  let totalSaidas = 0;
  let totalRealizadoEntradas = 0;
  let totalRealizadoSaidas = 0;
  for (const acc of porMes.values()) {
    totalEntradas += acc.entradasRealizado + acc.entradasProjetado;
    totalSaidas += acc.saidasRealizado + acc.saidasProjetado;
    totalRealizadoEntradas += acc.entradasRealizado;
    totalRealizadoSaidas += acc.saidasRealizado;
  }

  return {
    meses,
    totalEntradas: paraReais(totalEntradas),
    totalSaidas: paraReais(totalSaidas),
    totalRealizadoEntradas: paraReais(totalRealizadoEntradas),
    totalRealizadoSaidas: paraReais(totalRealizadoSaidas),
    saldoProjetado: paraReais(totalEntradas - totalSaidas),
  };
}

// =====================================================================
// 2. DRE gerencial
// =====================================================================

export interface DreGerencial {
  mes: string;
  receitas: DreLinha[];
  despesas: DreLinha[];
  totalReceitas: number;
  totalDespesas: number;
  resultado: number;
}

interface OpcaoMesParam {
  mes: string;
}

/**
 * DRE gerencial do mês (competência): receitas (a_receber) e despesas
 * (a_pagar) somadas por categoria_financeira, com totais e resultado. Usa o
 * valor do lançamento (regime de competência), não das parcelas. Lançamentos
 * cancelados ficam de fora. `mes` no formato "YYYY-MM".
 */
export async function dreGerencial({
  mes,
}: OpcaoMesParam): Promise<DreGerencial> {
  const supabase = await createClient();

  const inicio = `${mes}-01`;
  const fim = proximoMes(mes);

  const { data, error } = await supabase
    .from("lancamentos")
    .select("tipo, valor, competencia, categorias_financeiras(id, nome)")
    .neq("status", "cancelado")
    .gte("competencia", inicio)
    .lt("competencia", fim);

  if (error) {
    throw new Error("Não foi possível carregar o DRE gerencial");
  }

  const receitasBrutas: LancamentoCategoria[] = [];
  const despesasBrutas: LancamentoCategoria[] = [];

  for (const lancamento of data ?? []) {
    const categoria = lancamento.categorias_financeiras as unknown as {
      id: string;
      nome: string;
    } | null;
    const linha: LancamentoCategoria = {
      categoriaId: categoria?.id ?? null,
      categoria: categoria?.nome ?? null,
      valor: lancamento.valor,
    };
    if (lancamento.tipo === "a_receber") {
      receitasBrutas.push(linha);
    } else {
      despesasBrutas.push(linha);
    }
  }

  const receitas = somarPorCategoria(receitasBrutas);
  const despesas = somarPorCategoria(despesasBrutas);

  const totalReceitas = totalCategorias(receitas);
  const totalDespesas = totalCategorias(despesas);

  return {
    mes,
    receitas,
    despesas,
    totalReceitas,
    totalDespesas,
    resultado: totalReceitas - totalDespesas,
  };
}

// =====================================================================
// 3. Aging (idade dos vencimentos)
// =====================================================================

export interface Aging {
  aPagar: AgingFaixa[];
  aReceber: AgingFaixa[];
  totalAPagar: number;
  totalAReceber: number;
  /** Vencido = tudo fora de "a_vencer". */
  vencidoAPagar: number;
  vencidoAReceber: number;
}

/**
 * Aging de parcelas não pagas (pendente/aprovado), separando a_pagar de
 * a_receber por faixa de vencimento relativa a hoje (Rio Branco). Parcelas
 * sem data de vencimento contam como "a vencer". Faixa e somas vêm de
 * calculo.ts (puro e testado).
 */
export async function aging(): Promise<Aging> {
  const supabase = await createClient();
  const hoje = dataHojeISO();

  const { data, error } = await supabase
    .from("lancamento_parcelas")
    .select(
      "valor, status, data_vencimento, lancamentos!inner(tipo, status)",
    )
    .in("status", ["pendente", "aprovado"])
    .neq("lancamentos.status", "cancelado");

  if (error) {
    throw new Error("Não foi possível carregar o aging");
  }

  const aPagar: ParcelaAging[] = [];
  const aReceber: ParcelaAging[] = [];

  for (const parcela of data ?? []) {
    const lancamento = parcela.lancamentos as unknown as {
      tipo: string;
    } | null;
    if (!lancamento) continue;

    const item: ParcelaAging = {
      valor: parcela.valor,
      dataVencimento: parcela.data_vencimento,
    };
    if (lancamento.tipo === "a_receber") {
      aReceber.push(item);
    } else {
      aPagar.push(item);
    }
  }

  const listaAPagar = agregarAging(aPagar, hoje);
  const listaAReceber = agregarAging(aReceber, hoje);

  return {
    aPagar: listaAPagar,
    aReceber: listaAReceber,
    totalAPagar: totalAging(listaAPagar),
    totalAReceber: totalAging(listaAReceber),
    vencidoAPagar: vencidoAging(listaAPagar),
    vencidoAReceber: vencidoAging(listaAReceber),
  };
}

// =====================================================================
// 4. Posição bancária
// =====================================================================

export interface PosicaoBancariaConta {
  contaId: string;
  nome: string;
  banco: string;
  saldoInicial: number;
  entradas: number;
  saidas: number;
  saldoAtual: number;
}

export interface PosicaoBancaria {
  contas: PosicaoBancariaConta[];
  totalSaldoInicial: number;
  totalEntradas: number;
  totalSaidas: number;
  totalSaldoAtual: number;
}

/**
 * Saldo por conta bancária ativa: saldo_inicial mais o efeito das parcelas
 * pagas nela. Entradas (a_receber) somam, saídas (a_pagar) subtraem. Só conta
 * parcelas pagas (status='pago') com conta_bancaria_id preenchida.
 */
export async function posicaoBancaria(): Promise<PosicaoBancaria> {
  const supabase = await createClient();

  const { data: contas, error: erroContas } = await supabase
    .from("contas_bancarias")
    .select("id, nome, banco, saldo_inicial")
    .eq("ativo", true)
    .order("nome");

  if (erroContas) {
    throw new Error("Não foi possível carregar as contas bancárias");
  }

  const { data: parcelas, error: erroParcelas } = await supabase
    .from("lancamento_parcelas")
    .select(
      "valor, conta_bancaria_id, lancamentos!inner(tipo, status)",
    )
    .eq("status", "pago")
    .not("conta_bancaria_id", "is", null)
    .neq("lancamentos.status", "cancelado");

  if (erroParcelas) {
    throw new Error("Não foi possível carregar os pagamentos das contas");
  }

  const entradasPorConta = new Map<string, number>();
  const saidasPorConta = new Map<string, number>();

  for (const parcela of parcelas ?? []) {
    const contaId = parcela.conta_bancaria_id;
    if (!contaId) continue;
    const lancamento = parcela.lancamentos as unknown as {
      tipo: string;
    } | null;
    if (!lancamento) continue;

    const centavos = paraCentavos(parcela.valor);
    if (lancamento.tipo === "a_receber") {
      entradasPorConta.set(
        contaId,
        (entradasPorConta.get(contaId) ?? 0) + centavos,
      );
    } else {
      saidasPorConta.set(
        contaId,
        (saidasPorConta.get(contaId) ?? 0) + centavos,
      );
    }
  }

  const resultado: PosicaoBancariaConta[] = (contas ?? []).map((conta) => {
    const inicialCentavos = paraCentavos(conta.saldo_inicial);
    const entradasCentavos = entradasPorConta.get(conta.id) ?? 0;
    const saidasCentavos = saidasPorConta.get(conta.id) ?? 0;
    return {
      contaId: conta.id,
      nome: conta.nome,
      banco: conta.banco,
      saldoInicial: paraReais(inicialCentavos),
      entradas: paraReais(entradasCentavos),
      saidas: paraReais(saidasCentavos),
      saldoAtual: paraReais(
        inicialCentavos + entradasCentavos - saidasCentavos,
      ),
    };
  });

  return {
    contas: resultado,
    totalSaldoInicial: resultado.reduce((s, c) => s + c.saldoInicial, 0),
    totalEntradas: resultado.reduce((s, c) => s + c.entradas, 0),
    totalSaidas: resultado.reduce((s, c) => s + c.saidas, 0),
    totalSaldoAtual: resultado.reduce((s, c) => s + c.saldoAtual, 0),
  };
}

// =====================================================================
// 5. Custo por centro de custo
// =====================================================================

export interface CustoCentroCusto {
  centroCustoId: string;
  nome: string;
  codigo: string | null;
  valor: number;
}

export interface CustoPorCentroCusto {
  centros: CustoCentroCusto[];
  total: number;
}

/**
 * Custo por centro de custo: soma dos rateios (lancamento_rateios) dos
 * lançamentos a_pagar não cancelados, com nome e código do CC resolvidos.
 */
export async function custoPorCentroCusto(): Promise<CustoPorCentroCusto> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lancamento_rateios")
    .select(
      "valor, centro_custo_id, centros_custo(nome, codigo), lancamentos!inner(tipo, status)",
    )
    .eq("lancamentos.tipo", "a_pagar")
    .neq("lancamentos.status", "cancelado");

  if (error) {
    throw new Error("Não foi possível carregar o custo por centro de custo");
  }

  const porCentro = new Map<string, CustoCentroCusto>();

  for (const rateio of data ?? []) {
    const centro = rateio.centros_custo as unknown as {
      nome: string;
      codigo: string | null;
    } | null;
    const chave = rateio.centro_custo_id;
    const centavos = paraCentavos(rateio.valor);
    const atual = porCentro.get(chave);
    if (atual) {
      atual.valor += centavos;
    } else {
      porCentro.set(chave, {
        centroCustoId: chave,
        nome: centro?.nome ?? "Sem centro de custo",
        codigo: centro?.codigo ?? null,
        valor: centavos,
      });
    }
  }

  const centros = [...porCentro.values()]
    .map((c) => ({ ...c, valor: paraReais(c.valor) }))
    .sort((a, b) => b.valor - a.valor);

  return {
    centros,
    total: centros.reduce((soma, c) => soma + c.valor, 0),
  };
}

// =====================================================================
// 6. Extrato por fornecedor
// =====================================================================

export interface FornecedorOpcao {
  id: string;
  nome: string;
}

export interface ExtratoLancamento {
  id: string;
  numero: string | null;
  descricao: string;
  status: string;
  competencia: string | null;
  dataVencimento: string | null;
  valor: number;
}

export interface ExtratoPorFornecedor {
  fornecedorId: string | null;
  lancamentos: ExtratoLancamento[];
  total: number;
}

interface ExtratoParam {
  fornecedorId?: string;
}

/** Nome de exibição do fornecedor: fantasia quando existe, senão razão social. */
function nomeFornecedor(fornecedor: {
  razao_social: string;
  nome_fantasia: string | null;
}): string {
  return fornecedor.nome_fantasia ?? fornecedor.razao_social;
}

/** Fornecedores que têm ao menos um lançamento a_pagar, em ordem alfabética. */
export async function listarFornecedoresComLancamentos(): Promise<
  FornecedorOpcao[]
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lancamentos")
    .select("fornecedores!inner(id, razao_social, nome_fantasia)")
    .eq("tipo", "a_pagar")
    .neq("status", "cancelado")
    .not("fornecedor_id", "is", null);

  if (error) {
    throw new Error("Não foi possível carregar os fornecedores");
  }

  const porId = new Map<string, FornecedorOpcao>();
  for (const linha of data ?? []) {
    const fornecedor = linha.fornecedores as unknown as {
      id: string;
      razao_social: string;
      nome_fantasia: string | null;
    } | null;
    if (!fornecedor) continue;
    if (!porId.has(fornecedor.id)) {
      porId.set(fornecedor.id, {
        id: fornecedor.id,
        nome: nomeFornecedor(fornecedor),
      });
    }
  }

  return [...porId.values()].sort((a, b) => a.nome.localeCompare(b.nome));
}

/**
 * Extrato de lançamentos a_pagar de um fornecedor (ou de todos, se nenhum for
 * passado), mais recentes por vencimento primeiro, com o total somado.
 * Cancelados ficam de fora.
 */
export async function extratoPorFornecedor({
  fornecedorId,
}: ExtratoParam = {}): Promise<ExtratoPorFornecedor> {
  const supabase = await createClient();

  let consulta = supabase
    .from("lancamentos")
    .select(
      "id, numero, descricao, status, competencia, data_vencimento, valor",
    )
    .eq("tipo", "a_pagar")
    .neq("status", "cancelado");

  if (fornecedorId) {
    consulta = consulta.eq("fornecedor_id", fornecedorId);
  }

  const { data, error } = await consulta
    .order("data_vencimento", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Não foi possível carregar o extrato do fornecedor");
  }

  const lancamentos: ExtratoLancamento[] = (data ?? []).map((lancamento) => ({
    id: lancamento.id,
    numero: lancamento.numero,
    descricao: lancamento.descricao,
    status: lancamento.status,
    competencia: lancamento.competencia,
    dataVencimento: lancamento.data_vencimento,
    valor: lancamento.valor,
  }));

  const totalCentavos = lancamentos.reduce(
    (soma, l) => soma + paraCentavos(l.valor),
    0,
  );

  return {
    fornecedorId: fornecedorId ?? null,
    lancamentos,
    total: paraReais(totalCentavos),
  };
}

/** Mês corrente "YYYY-MM" no fuso de Rio Branco, default do seletor do DRE. */
export function mesCorrente(): string {
  return dataHojeISO().slice(0, 7);
}
