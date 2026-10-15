import "server-only";

import { dataHojeISO } from "@/lib/formatadores";
import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import {
  abertoPorPrazo,
  pagoDasParcelas,
  type AbertoPorPrazo,
} from "@/modules/financeiro/_shared/prazo";
import {
  corGrupo,
  type CorGrupo,
} from "@/modules/cadastros/_shared/insumo-grupos";
import type { CentroCustoOpcao } from "@/modules/financeiro/lancamentos/queries";
import type { LinhaCustoReceita } from "@/modules/financeiro/relatorios/custo-receita";
import {
  montarInvestimentos,
  sentidoDaTransferencia,
  type Investimentos,
  type MovimentoInvestimento,
  type PeriodoInvestimentos,
  type SaldoRealAplicacao,
  type SubcontaInvestimento,
} from "@/modules/financeiro/relatorios/investimentos";
import {
  classeDaConta,
  resumoDaPosicao,
  type ConferenciaExtrato,
  type ResumoDaPosicao,
} from "@/modules/financeiro/relatorios/posicao-bancaria";
import type { JanelaFluxo } from "@/modules/financeiro/relatorios/filtros-fluxo-caixa";
import {
  montarFluxoCaixa,
  saldoDePartida,
  type FluxoCaixa as FluxoCaixaMontado,
} from "@/modules/financeiro/relatorios/fluxo-caixa";
import type { RecorteCustoGrupo } from "@/modules/financeiro/relatorios/drill";
import {
  agregarAging,
  agregarPrazoAVencer,
  agruparDrePorNatureza,
  paraCentavos,
  paraReais,
  proximoMes,
  totalAging,
  vencidoAging,
  type AgingFaixa,
  type BlocoDre,
  type LinhaFaixaAging,
  type LinhaPrazoAVencer,
  type PrazoFaixa,
} from "@/modules/financeiro/relatorios/calculo";
import {
  montarSociosLigadas,
  type SocioLigadaLinha,
  type SocioLigadaMes,
  type SociosLigadasRelatorio,
} from "@/modules/financeiro/relatorios/socios-ligadas";
import type { AquisicaoLinha } from "@/modules/financeiro/relatorios/aquisicoes";
import type { FornecedorRankingLinha } from "@/modules/financeiro/relatorios/fornecedores-ranking";
import type { CustoIndiretoLinha } from "@/modules/financeiro/relatorios/custos-indiretos";
import type { RateioDoMes, StatusRateio } from "@/modules/financeiro/relatorios/rateio-indireto";
import {
  resultadoPorObra,
  type LinhaRateioMes,
  type PapelRateio,
  type ResultadoPorObra,
} from "@/modules/financeiro/relatorios/resultado-por-obra";
import {
  ponteObrasDre as montarPonteObrasDre,
  type PonteObrasDre,
  type TermosPonteDre,
} from "@/modules/financeiro/relatorios/ponte-obras-dre";
import {
  indiretoPorMes,
  type MesDoIndireto,
} from "@/modules/financeiro/relatorios/indireto-por-mes";
import {
  janelasContiguas,
  type IndiretoDoPeriodo,
} from "@/modules/financeiro/relatorios/indireto-nos-relatorios";

// Reexporta a API pública dos relatórios (tipos e tabelas de faixa) para que os
// componentes continuem importando tudo de queries.ts, como antes da extração.
export {
  ORDEM_FAIXA_AGING,
  ROTULO_FAIXA_AGING,
  type AgingFaixa,
  type BlocoDre,
  type DreLinha,
  type FaixaAging,
} from "@/modules/financeiro/relatorios/calculo";

/**
 * Queries dos relatórios financeiros. Tudo somente leitura. A agregação pesada
 * (GROUP BY sobre lancamentos / lancamento_parcelas / lancamento_rateios) roda
 * no banco pelas RPCs fn_rel_* (security invoker: o RLS do usuário vale igual),
 * que devolvem só as linhas agregadas em vez das milhares de linhas brutas.
 *
 * Datas: as colunas usadas (mes_competencia, data_vencimento, data_pagamento) são
 * `date` puro no Postgres (sem hora), então o mês de um registro é o prefixo
 * "YYYY-MM" da string, e o "hoje" do aging vai para o banco como dataHojeISO()
 * (já no fuso de Rio Branco). Sem timestamptz no caminho, sem risco de pular
 * dia por fuso.
 *
 * As regras puras que sobraram (montar a lista de faixas, somar por categoria)
 * vivem em calculo.ts, testadas isoladas. A classificação por faixa de aging
 * saiu daqui para dentro de fn_rel_aging: era o único ponto em que o número de
 * linhas devolvidas crescia com o número de vencimentos em aberto.
 */

// =====================================================================
// 1. Fluxo de caixa
// =====================================================================

export type { FluxoCaixaMes } from "@/modules/financeiro/relatorios/fluxo-caixa";

/** O fluxo montado, mais de quantas contas o saldo de partida saiu. */
export interface FluxoCaixa extends FluxoCaixaMontado {
  /**
   * Contas correntes e caixa ativas que entraram no saldo de partida, e as que
   * ficaram fora por a pessoa não poder ver o saldo delas. Zero e zero quando o
   * relatório está recortado por centro (o saldo nem é lido).
   */
  contasNoSaldo: { contas: number; ocultas: number; aplicadas: number };
}

/**
 * Fluxo de caixa mensal em cinco grupos pela natureza (ver `fluxo-caixa.ts`):
 * operação, CAPEX, sócios e mútuo, dívida e aplicações, cada um com entrada e
 * saída, separando realizado de projetado. O realizado (parcelas pagas) entra no mês em que o dinheiro de
 * fato se moveu (data_pagamento), refletindo a posição de caixa; o projetado
 * (pendentes/aprovadas) entra no mês de vencimento, pois é quando deve ocorrer.
 * Parcelas canceladas ficam de fora, e a origem aplicação (rendimento, ajuste
 * de abertura) também: é variação dentro da subconta.
 *
 * A JANELA É APLICADA AQUI, e não no componente do gráfico, de propósito.
 * `fn_rel_fluxo_caixa()` devolve todo mês em que existe parcela, pelo
 * vencimento, então as prestações dos financiamentos empurram o eixo até 05/2031
 * (78 meses, medido em 29/08/2026). Como ela já devolve agregado, cortar antes de
 * somar custa um `filter` e faz os cartões, a contagem de meses e o gráfico
 * falarem da MESMA janela; cortar só no desenho deixaria os cartões somando 2031
 * embaixo de um gráfico que para em 2027.
 *
 * O CENTRO, AO CONTRÁRIO DA JANELA, VAI AO BANCO. Ele não é um `filter` de linha
 * agregada: o rateio é do LANÇAMENTO e o dinheiro é da PARCELA, então a fatia de
 * um centro só se calcula antes de agregar. Filtrar aqui exigiria trazer parcela
 * e rateio crus (uns 15 mil registros por abertura de tela) e reescrever em TS as
 * regras que a RPC já tem: o mês do pagamento x o do vencimento, o grupo de
 * cada natureza, o cancelado fora. Duas cópias dessas regras divergem na
 * primeira que alguém mexer de um lado só.
 *
 * O SALDO DE PARTIDA vem de `fn_saldos_das_contas`, a mesma função de Contas
 * bancárias e de Posição bancária, somando as correntes e caixa ativas (o
 * disponível) e, à parte, as subcontas de investimento (o aplicado). Com
 * centro escolhido ele nem é lido: as barras viram fatia de uma obra, e somar a
 * fatia ao saldo da empresa inteira não daria saldo de ninguém.
 */
export async function fluxoCaixa(
  janela?: JanelaFluxo,
  /**
   * Centros JÁ EFETIVOS de cada lado (a etapa substitui a raiz, ver
   * `_shared/centro-custo/filtro.ts`). Vazio = o lado inteiro.
   *
   * `p_centros_custo` recorta as saídas (a pagar e amortização) e
   * `p_centros_receita` as entradas (a receber e empréstimo tomado), e o que a
   * RPC soma passa a ser a FATIA do rateio daquele centro. Os dois lados são
   * independentes de propósito, como em `custoReceita`.
   */
  centros?: { custo?: readonly string[]; receita?: readonly string[] },
): Promise<FluxoCaixa> {
  const supabase = await createClient();
  const comCorteDeCentro =
    (centros?.custo?.length ?? 0) > 0 || (centros?.receita?.length ?? 0) > 0;

  // Agregado no banco: uma linha por mês/série/realizado (a regra do mês do
  // pagamento x mês do vencimento, e a da série, vivem na fn_rel_fluxo_caixa).
  const [fluxoResultado, contasResultado, saldosResultado] = await Promise.all([
    supabase.rpc("fn_rel_fluxo_caixa", {
      // `undefined` e não `null` quando o lado não filtra: os parâmetros da RPC
      // são opcionais com default null no banco, e é assim que os tipos gerados
      // os descrevem. Lista vazia também vira `undefined`, senão um `{}`
      // chegaria ao banco e o `cardinality` daria zero, que dá no mesmo, mas
      // manda array vazio na query string sem motivo.
      p_centros_custo: centros?.custo?.length ? [...centros.custo] : undefined,
      p_centros_receita: centros?.receita?.length
        ? [...centros.receita]
        : undefined,
    }),
    comCorteDeCentro
      ? null
      : supabase.from("contas_bancarias").select("id, tipo, ativo"),
    comCorteDeCentro ? null : supabase.rpc("fn_saldos_das_contas"),
  ]);

  if (fluxoResultado.error) {
    throw new Error("Não foi possível carregar o fluxo de caixa");
  }
  if (contasResultado?.error) {
    throw new Error("Não foi possível carregar as contas bancárias");
  }
  if (saldosResultado?.error) {
    throw new Error("Não foi possível carregar o saldo das contas");
  }

  const partida =
    contasResultado && saldosResultado
      ? saldoDePartida(
          contasResultado.data ?? [],
          (saldosResultado.data ?? []).map((linha) => ({
            conta_bancaria_id: linha.conta_bancaria_id,
            saldo: Number(linha.saldo),
          })),
        )
      : { saldo: null, contas: 0, ocultas: 0, aplicado: null, contasAplicadas: 0 };

  return {
    ...montarFluxoCaixa({
      linhas: fluxoResultado.data ?? [],
      janela,
      mesCorrente: mesCorrente(),
      saldoInicial: partida.saldo,
      aplicado: partida.aplicado,
      comCorteDeCentro,
    }),
    contasNoSaldo: {
      contas: partida.contas,
      ocultas: partida.ocultas,
      aplicadas: partida.contasAplicadas,
    },
  };
}

// =====================================================================
// 2. DRE gerencial
// =====================================================================

export interface DreGerencial {
  /** A obra: medição, custo, despesa. É o resultado que o Tiago administra. */
  operacional: BlocoDre;
  /** Juros ganhos, tarifa, IOF. É resultado, mas não é da obra. */
  financeiro: BlocoDre;
  /**
   * Principal de aplicação, resgate e empréstimo. Entra e sai da conta e NÃO é
   * resultado: é patrimônio trocando de lugar. Fica no relatório para o dinheiro
   * não desaparecer da vista, mas fora da soma do resultado.
   */
  movimentacao: BlocoDre;
  /**
   * CAPEX: Aquisição de Equipamento, Investimentos, Compra de Terreno (D3,
   * 03/10/2026). Saiu do caixa e virou patrimônio: fica abaixo do resultado e
   * fora da soma dele, como a movimentação.
   */
  investimento: BlocoDre;
  /** Retirada de sócio (D3, 09/10/2026): abaixo do resultado. */
  distribuicao: BlocoDre;
  /** Mútuo com empresa ligada (D4, 09/10/2026): fora do resultado. */
  mutuo: BlocoDre;
  /**
   * Operacional mais financeiro. Movimentação, investimento, distribuição e
   * mútuo não entram, de propósito.
   */
  resultado: number;
}

/**
 * As duas pontas da janela de competência, `[inicio, fim)` — fim EXCLUSIVO.
 *
 * As duas são OBRIGATÓRIAS, e isso não é rigor à toa: a `fn_rel_dre` não tem
 * `default` nem guarda de nulo (`l.mes_competencia >= date_trunc('month',
 * p_inicio)` com nulo dá NULL, que filtra tudo fora), então mandar uma ponta
 * aberta devolveria um DRE vazio como se o período não tivesse lançamento. Quem
 * quer "tudo" fecha as pontas nos meses que existem, com `periodoFechado`.
 */
interface JanelaCompetencia {
  inicio: string;
  fim: string;
}

/**
 * DRE gerencial do período (competência): receitas (a_receber) e despesas
 * (a_pagar) somadas por categoria_financeira, com totais e resultado. Usa o
 * valor do lançamento (regime de competência), não das parcelas. Lançamentos
 * cancelados ficam de fora.
 *
 * TRÊS BLOCOS, e é o ponto todo desta função: `fn_rel_dre` devolve a NATUREZA
 * da categoria, e a natureza decide em qual bloco a linha cai. Enquanto o DRE
 * era só "a_receber contra a_pagar", a varredura automática da conta bancária
 * (aplicar o saldo à noite, resgatar na manhã seguinte) respondia por 31,7% da
 * receita de 2026 e 14,3% da despesa. O mesmo dinheiro indo e voltando aparecia
 * como faturamento, e a margem era ficção — sem nenhum relatório reclamar,
 * porque a soma fechava dos dois lados.
 *
 * `movimentacao` continua VISÍVEL num bloco próprio em vez de ser descartada:
 * ela é dinheiro que passou na conta, e sumir com ela criaria a pergunta
 * "por que o extrato tem movimento que o sistema não tem".
 *
 * O filtro é por `mes_competencia` dentro do SQL. Não existe lançamento com
 * competência nula (medido: zero em 6.462), então não há queda para o
 * vencimento — o que o comentário antigo aqui descrevia nunca chegou a ser o
 * comportamento da função.
 */
export async function dreGerencial({
  inicio,
  fim,
}: JanelaCompetencia): Promise<DreGerencial> {
  const supabase = await createClient();

  // Agregado no banco: uma linha por tipo/categoria do período, pelo MÊS DE
  // REFERÊNCIA do lançamento (regime de competência; ver fn_rel_dre).
  const { data, error } = await supabase.rpc("fn_rel_dre", {
    p_inicio: inicio,
    p_fim: fim,
  });

  if (error) {
    throw new Error("Não foi possível carregar o DRE gerencial");
  }

  // A separação em blocos é lógica pura e mora em calculo.ts, com teste.
  // Aqui só a chamada: esta função é a que fala com o banco.
  return agruparDrePorNatureza(data ?? []);
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
  /** O "a vencer" de cada lado, quebrado pelo prazo. */
  prazosAPagar: PrazoFaixa[];
  prazosAReceber: PrazoFaixa[];
}

/**
 * Aging de parcelas não pagas (pendente/aprovado), separando a_pagar de
 * a_receber por faixa de vencimento relativa a hoje (Rio Branco). Parcelas
 * sem data de vencimento contam como "a vencer". Faixa e somas vêm de
 * calculo.ts (puro e testado).
 */
export async function aging(): Promise<Aging> {
  const supabase = await createClient();

  // Agregado no banco por tipo E por faixa: uma linha por faixa, não mais uma
  // por data de vencimento. Com uma linha por data, bastaria a EMT ter mais de
  // mil datas distintas em aberto para o teto de 1000 linhas do PostgREST
  // cortar o resto sem erro, e o relatório mostrar menos dívida do que existe.
  const { data, error } = await supabase.rpc("fn_rel_aging", {
    p_hoje: dataHojeISO(),
  });

  if (error) {
    throw new Error("Não foi possível carregar o aging");
  }

  const aPagar: LinhaFaixaAging[] = [];
  const aReceber: LinhaFaixaAging[] = [];
  const prazoAPagar: LinhaPrazoAVencer[] = [];
  const prazoAReceber: LinhaPrazoAVencer[] = [];

  for (const linha of data ?? []) {
    const item: LinhaFaixaAging = {
      faixa: linha.faixa_aging,
      valor: linha.total,
    };
    const receber = linha.tipo === "a_receber";
    (receber ? aReceber : aPagar).push(item);
    // O banco já manda o prazo do que está a vencer; vencido fica de fora,
    // porque tem as faixas próprias acima.
    if (linha.faixa_aging === "a_vencer") {
      (receber ? prazoAReceber : prazoAPagar).push({
        prazo: linha.faixa_prazo,
        valor: linha.total,
      });
    }
  }

  const listaAPagar = agregarAging(aPagar);
  const listaAReceber = agregarAging(aReceber);

  return {
    aPagar: listaAPagar,
    aReceber: listaAReceber,
    totalAPagar: totalAging(listaAPagar),
    totalAReceber: totalAging(listaAReceber),
    vencidoAPagar: vencidoAging(listaAPagar),
    vencidoAReceber: vencidoAging(listaAReceber),
    prazosAPagar: agregarPrazoAVencer(prazoAPagar),
    prazosAReceber: agregarPrazoAVencer(prazoAReceber),
  };
}

// =====================================================================
// 4. Posição bancária
// =====================================================================

export interface PosicaoBancariaConta {
  contaId: string;
  nome: string;
  banco: string;
  /** corrente, caixa, poupança ou investimento (subconta). */
  tipo: string;
  /** O último extrato e a comparação na data dele. `null` = sem OFX. */
  extrato: ConferenciaExtrato | null;
  saldoInicial: number;
  /**
   * Data do extrato de onde o saldo inicial foi lido. Quando existe, "Saldo
   * inicial" NÃO é a abertura da conta e "Entradas"/"Saídas" não são o histórico
   * todo: as três colunas passam a falar de um período. Sem mostrar a data, o
   * relatório ficaria certo na aritmética e mudo sobre o recorte.
   */
  saldoInicialData: string | null;
  entradas: number;
  saidas: number;
  saldoAtual: number;
}

export interface PosicaoBancaria {
  contas: PosicaoBancariaConta[];
  /** Disponível x aplicado, e as contas com extrato a conferir. */
  resumo: ResumoDaPosicao;
  totalSaldoInicial: number;
  totalEntradas: number;
  totalSaidas: number;
  totalSaldoAtual: number;
  /**
   * Quantas contas ATIVAS ficaram fora por falta de permissão de ver o saldo.
   *
   * Aparece na tela porque um relatório que some contas em silêncio é pior que um
   * relatório restrito: quem lê acha que está vendo a posição de todos os bancos
   * da empresa, e os totais parecem o dinheiro que existe. Aqui elas ficam fora
   * de verdade (nem linha, nem soma) — deixá-las com travessão e somar só as
   * visíveis já é o suficiente para alguém subtrair e descobrir o resto quando
   * falta uma só.
   */
  contasOcultas: number;
}

/**
 * Saldo por conta bancária ativa: saldo_inicial mais o movimento da conta, e a
 * conferência contra o último extrato (ver `posicao-bancaria.ts`).
 *
 * ENTRA: parcela recebida (a_receber) e o lado de quem recebeu numa
 * transferência entre contas (transferencia_entrada).
 * SAI: parcela paga (a_pagar) e o lado de quem mandou numa transferência
 * (transferencia_saida) -- nessa, a tarifa já vem somada pela RPC, porque o
 * banco debita valor mais tarifa da origem e credita só o valor no destino.
 *
 * Só conta parcela paga com conta preenchida e posterior a `saldo_inicial_data`
 * (null = tudo), a mesma regra (`vw_parcelas_caixa.no_saldo`) de Contas
 * bancárias e do Fluxo de caixa. Desde a D1 (03/10/2026) a movimentação ENTRA:
 * o resgate e a transferência mexem no saldo da conta por onde passaram.
 *
 * Cada linha é UMA conta, e a subconta de investimentos é conta própria: o
 * saldo da corrente é o disponível, o da subconta é o aplicado, e o resumo
 * soma os dois separados.
 */
export async function posicaoBancaria(): Promise<PosicaoBancaria> {
  const supabase = await createClient();

  // O cadastro de TODAS as contas ativas (para saber quantas existem) e o
  // dinheiro só das permitidas. `saldo_inicial` não entra no select: desde
  // 27/08/2026 o `authenticated` não tem SELECT nessa coluna, e as entradas e
  // saídas por conta agora vêm somadas de `fn_saldos_das_contas`, que é a mesma
  // função da aba Contas bancárias — as duas telas não têm como divergir.
  const [contasResultado, saldosResultado, extratosResultado] = await Promise.all([
    supabase
      .from("contas_bancarias")
      .select("id, nome, banco, tipo, saldo_inicial_data")
      .eq("ativo", true)
      .order("nome"),
    supabase.rpc("fn_saldos_das_contas"),
    supabase.rpc("fn_conferencia_extrato_contas"),
  ]);

  if (contasResultado.error) {
    throw new Error("Não foi possível carregar as contas bancárias");
  }
  if (saldosResultado.error) {
    throw new Error("Não foi possível carregar os pagamentos das contas");
  }
  if (extratosResultado.error) {
    throw new Error("Não foi possível conferir as contas com o extrato");
  }

  const extratoPorConta = new Map<string, ConferenciaExtrato>();
  for (const linha of extratosResultado.data ?? []) {
    // Sem extrato a função devolve a conta com a data nula: fica fora do mapa,
    // e a conta sai como "sem extrato", nunca como "em dia".
    if (!linha.extrato_data) continue;
    extratoPorConta.set(linha.conta_bancaria_id, {
      data: linha.extrato_data,
      saldoExtrato: Number(linha.extrato_saldo),
      movimentoDepois: Number(linha.movimento_depois),
      lancamentosDepois: linha.lancamentos_depois ?? 0,
      saldoNaData: Number(linha.saldo_sistema_na_data),
      diferencaNaData: Number(linha.diferenca_na_data),
    });
  }

  const dinheiroPorConta = new Map(
    (saldosResultado.data ?? []).map((linha) => [
      linha.conta_bancaria_id,
      linha,
    ]),
  );

  const ativas = contasResultado.data ?? [];
  const resultado: PosicaoBancariaConta[] = [];

  for (const conta of ativas) {
    const dinheiro = dinheiroPorConta.get(conta.id);
    // Conta sem permissão fica FORA do relatório: ela não tem número nenhum
    // para mostrar em quatro das cinco colunas, e uma linha com quatro
    // travessões só ocupa espaço. A contagem sai em `contasOcultas`.
    if (!dinheiro) continue;

    const inicialCentavos = paraCentavos(dinheiro.saldo_inicial);
    const entradasCentavos = paraCentavos(dinheiro.entradas);
    const saidasCentavos = paraCentavos(dinheiro.saidas);
    resultado.push({
      contaId: conta.id,
      nome: conta.nome,
      banco: conta.banco,
      tipo: conta.tipo,
      extrato: extratoPorConta.get(conta.id) ?? null,
      saldoInicial: paraReais(inicialCentavos),
      saldoInicialData: conta.saldo_inicial_data,
      entradas: paraReais(entradasCentavos),
      saidas: paraReais(saidasCentavos),
      saldoAtual: paraReais(inicialCentavos + entradasCentavos - saidasCentavos),
    });
  }

  // Disponível antes do aplicado: é a ordem da pergunta ("quanto posso pagar").
  resultado.sort(
    (a, b) =>
      Number(classeDaConta(a.tipo) === "aplicado") -
        Number(classeDaConta(b.tipo) === "aplicado") ||
      a.nome.localeCompare(b.nome, "pt-BR"),
  );

  return {
    contas: resultado,
    resumo: resumoDaPosicao(resultado),
    totalSaldoInicial: resultado.reduce((s, c) => s + c.saldoInicial, 0),
    totalEntradas: resultado.reduce((s, c) => s + c.entradas, 0),
    totalSaidas: resultado.reduce((s, c) => s + c.saidas, 0),
    totalSaldoAtual: resultado.reduce((s, c) => s + c.saldoAtual, 0),
    contasOcultas: ativas.length - resultado.length,
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
 * Custo por centro de custo no MÊS DE REFERÊNCIA (regime de competência): soma
 * dos rateios dos lançamentos a pagar não cancelados cujo mes_competencia cai no
 * período. Sem período soma todos os meses (acumulado).
 *
 * É este o custo de obra: como toda OC vira lançamento e existem lançamentos
 * avulsos, o gasto está nos lançamentos, não em consumo de estoque.
 */
/**
 * Filtros do relatório de custo por centro de custo.
 *
 * `excluirPrevisto` (e não `incluirPrevisto`) porque o padrão histórico do
 * relatório é INCLUIR previsto: ele só exclui cancelado. Inverter o padrão mudaria
 * o número sem ninguém pedir, e como a base tem 0 previsto em 14/08/2026 a mudança
 * não apareceria na tela hoje e só morderia no primeiro previsto lançado.
 */
export interface FiltrosCustoCentroCusto {
  inicio?: string;
  fim?: string;
  /**
   * Centros escolhidos. Cada um vale pela SUBÁRVORE dele. Vazio = todos.
   *
   * Este campo já existiu como `centroCustoId` e era MONTADO por quem chamava e
   * jogado fora aqui: a RPC tinha `p_centro_custo` e nunca recebia. Escolher um
   * centro na tela mudava a URL, mudava o link do drill e não mudava número
   * nenhum. Medido em 07/2026: 9 linhas e R$ 6.918.483,54 com filtro e sem
   * filtro, quando o certo era 1 linha e R$ 3.372.968,17.
   */
  centroIds?: string[];
  categoriaIds?: string[];
  fornecedorIds?: string[];
  formaIds?: string[];
  /** Incluir os lançamentos SEM forma de pagamento (880 deles, R$ 13,4 mi). */
  semForma?: boolean;
  /** Status literais aceitos. Vazio = todos, menos cancelado (que é sempre fora). */
  status?: string[];
  excluirPrevisto?: boolean;
  tiposCentro?: string[];
  /**
   * Trazer o CAPEX (natureza `investimento`) de volta para o custo? Falso por
   * padrão: desde a decisão D3 (03/10/2026) comprar máquina não é custo da obra
   * no mês. O checkbox "Incluir investimentos" da tela é quem liga.
   */
  incluirInvestimento?: boolean;
}

export async function custoPorCentroCusto(
  periodo?: FiltrosCustoCentroCusto,
): Promise<CustoPorCentroCusto> {
  const supabase = await createClient();

  // Agregado no banco: uma linha por centro de custo, já com nome e código.
  const { data, error } = await supabase.rpc("fn_rel_custo_centro_custo", {
    p_inicio: periodo?.inicio,
    p_fim: periodo?.fim,
    p_centros: periodo?.centroIds,
    p_categorias: periodo?.categoriaIds,
    p_fornecedores: periodo?.fornecedorIds,
    p_formas: periodo?.formaIds,
    p_sem_forma: periodo?.semForma,
    p_status: periodo?.status,
    p_excluir_previsto: periodo?.excluirPrevisto,
    p_tipos_centro: periodo?.tiposCentro,
    p_incluir_investimento: periodo?.incluirInvestimento,
  });

  if (error) {
    throw new Error("Não foi possível carregar o custo por centro de custo");
  }

  const centros: CustoCentroCusto[] = (data ?? [])
    .map((linha) => ({
      centroCustoId: linha.centro_custo_id,
      nome: linha.nome ?? "Sem centro de custo",
      codigo: linha.codigo,
      valor: paraReais(paraCentavos(linha.total)),
    }))
    .sort((a, b) => b.valor - a.valor);

  return {
    centros,
    total: centros.reduce((soma, c) => soma + c.valor, 0),
  };
}

/**
 * Primeiro mês (yyyy-MM) com custo em cada centro pedido: o início da vida dele.
 *
 * Centro que nunca teve lançamento NÃO volta no mapa. Quem chama trata a ausência
 * como "sem período", e não como "tudo": um centro sem lançamento não tem vida, e
 * mostrar o total geral no lugar trocaria a pergunta do usuário por outra.
 */
export async function primeirosMesesDosCentros(
  centroIds: string[],
  incluirInvestimento?: boolean,
): Promise<Map<string, string>> {
  if (centroIds.length === 0) return new Map();
  const supabase = await createClient();
  // O investimento entra aqui também quando a tela o pede: um centro cujo
  // primeiro custo foi a compra de uma máquina começaria a vida meses depois, e
  // o gráfico cortaria o CAPEX que os cartões ao lado estão somando.
  const { data, error } = await supabase.rpc("fn_rel_custo_centro_vida", {
    p_centros: centroIds,
    p_incluir_investimento: incluirInvestimento,
  });
  if (error) {
    throw new Error(
      `Não foi possível ler o início dos centros de custo: ${error.message}`,
    );
  }
  return new Map(
    (data ?? []).map((linha) => [
      linha.centro_custo_id,
      linha.primeiro_mes.slice(0, 7),
    ]),
  );
}

/** Um mês da série do centro. Mês sem custo vem com valor zero, não omitido. */
export interface PontoSerieCentro {
  /** yyyy-MM. */
  mes: string;
  valor: number;
}

/** A série de um centro escolhido, para uma linha do gráfico. */
export interface SerieDeCentro {
  centroCustoId: string;
  nome: string;
  codigo: string | null;
  pontos: PontoSerieCentro[];
}

/**
 * Série mensal de cada centro escolhido, para o gráfico do modo "vida do centro".
 *
 * Uma linha por centro, e cada uma começa na vida DELA: a RPC não devolve ponto
 * antes do primeiro lançamento daquele centro. Zero antes de existir desenharia
 * uma reta rasteira desde o começo da janela, que se lê como obra que já existia
 * e não gastava.
 *
 * Depois que a linha nasce, mês sem custo vem como zero (a RPC preenche): série
 * com buraco faz o gráfico ligar dois meses distantes por uma reta e some com a
 * informação de que a obra parou naquele intervalo — que numa obra rodoviária é
 * justamente o que se quer ver.
 *
 * Os filtros vêm junto de propósito. Sem eles, o gráfico somava categoria e
 * fornecedor que os cartões ao lado tinham excluído, e as duas metades da mesma
 * tela discordavam.
 */
export async function serieDosCentros(
  centroIds: string[],
  filtros?: FiltrosCustoCentroCusto,
): Promise<SerieDeCentro[]> {
  if (centroIds.length === 0) return [];
  const supabase = await createClient();

  // `p_tipos_centro` é o que faltava aqui: até 28/08/2026 a RPC da série nem
  // tinha o parâmetro, então os cartões filtravam por tipo de centro e o gráfico
  // ao lado não. Medido com as 17 raízes escolhidas e "obra" marcado: cartão
  // R$ 45.625.418,30 contra série R$ 48.013.704,59 — a diferença era a Manutenção
  // inteira, desenhada num gráfico que o número em cima dele não contava. O corte
  // foi para o banco na migration 20260828234000.
  //
  // O tipo NÃO trava isto: `supabase.rpc` aceita chave que a assinatura não tem
  // (conferido — um `p_parametro_que_nao_existe` passa por `tsc` sem um pio), e
  // `database.types.ts` é gerado, então enquanto ele não for regerado nem existe
  // `p_tipos_centro` para conferir. Quem trava é `serie-com-tipo-de-centro.test.ts`.
  const { data, error } = await supabase.rpc("fn_rel_custo_centro_serie", {
    p_centros: centroIds,
    p_inicio: filtros?.inicio,
    p_fim: filtros?.fim,
    p_categorias: filtros?.categoriaIds,
    p_fornecedores: filtros?.fornecedorIds,
    p_formas: filtros?.formaIds,
    p_sem_forma: filtros?.semForma,
    p_status: filtros?.status,
    p_excluir_previsto: filtros?.excluirPrevisto,
    p_tipos_centro: filtros?.tiposCentro,
    p_incluir_investimento: filtros?.incluirInvestimento,
  });
  if (error) {
    throw new Error(
      `Não foi possível ler a série dos centros de custo: ${error.message}`,
    );
  }

  // Agrupa preservando a ordem em que os centros aparecem, que é a ordem da RPC
  // (por nome). Cor de linha por posição estável é o que faz o mesmo centro
  // manter a cor entre um filtro e outro.
  const series = new Map<string, SerieDeCentro>();
  for (const linha of data ?? []) {
    let serie = series.get(linha.centro_custo_id);
    if (!serie) {
      serie = {
        centroCustoId: linha.centro_custo_id,
        nome: linha.nome,
        codigo: linha.codigo,
        pontos: [],
      };
      series.set(linha.centro_custo_id, serie);
    }
    serie.pontos.push({
      mes: linha.mes,
      valor: paraReais(paraCentavos(linha.total)),
    });
  }
  return [...series.values()];
}

// =====================================================================
// 5b. Custo x receita por centro de custo
// =====================================================================

/**
 * O cadastro que alimenta os filtros de centro dos relatórios: as raízes e as
 * etapas delas, ativas, em ordem de código.
 *
 * É uma lista só, com `paiId` em cada linha, e não duas consultas: quem monta a
 * tela precisa das duas coisas ao mesmo tempo (as raízes no primeiro campo, as
 * etapas da raiz escolhida no segundo), e ir ao banco de novo a cada marcação
 * faria o segundo campo piscar vazio no meio da escolha. Quem separa os níveis é
 * `_shared/centro-custo/filtro.ts`.
 *
 * ## O nome aqui é o nome PRÓPRIO do centro
 *
 * Entre a manhã e a tarde de 27/08/2026 a etapa saía daqui já rotulada com o pai
 * ("Manutenção/Documentação de Equipamentos › ESCAVADEIRA CAT 320"), porque tudo
 * caía num campo só e o prefixo era o que desempatava. Num seletor de 13rem isso
 * desenhava 61 linhas idênticas, todas cortadas em "Manutenção/Docume…", e o
 * Tiago pegou na primeira olhada. Com dois campos o prefixo virou ruído, então
 * ele saiu daqui: quem precisar dele (duas raízes com etapa escolhidas ao mesmo
 * tempo) monta na hora, em `opcoesDeEtapa`.
 *
 * ## Por que a etapa pode ser escolhida
 *
 * Oferecer etapa num relatório que agrupa na RAIZ mente na tela: até 27/08/2026
 * escolher "CAMINHÃO BOIADEIRO/MIILHO - L1620" devolvia uma linha chamada
 * "Manutenção/Documentação de Equipamentos". A causa foi resolvida no banco — as
 * duas RPCs de centro (`fn_rel_custo_receita` e `fn_rel_custo_centro_custo`)
 * agrupam pelo centro ESCOLHIDO mais fundo, com prova dentro das migrations
 * `20260827180000` e `20260827200000`, que abortam se a etapa voltar vestindo o
 * nome do pai.
 *
 * O centro de tipo `financeiro` NÃO entra: desde 27/08/2026 o empréstimo saiu dos
 * relatórios operacionais e a análise dele vive em Créditos, então oferecê-lo aqui
 * seria oferecer um filtro que sempre devolve vazio.
 */
export async function listarCentrosCustoParaFiltro(): Promise<
  CentroCustoOpcao[]
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("centros_custo")
    .select("id, nome, codigo, pai_id, tipo")
    .eq("ativo", true)
    .lte("nivel", 2)
    .order("codigo", { ascending: true, nullsFirst: false })
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os centros de custo");
  }

  const linhas = data ?? [];
  // O tipo mora na RAIZ (etapa tem tipo nulo), então para saber se uma etapa é de
  // centro financeiro eu tenho de olhar o pai dela.
  const tipoPorId = new Map(linhas.map((centro) => [centro.id, centro.tipo]));

  return linhas
    .filter((centro) => {
      const tipoDaRaiz = centro.pai_id
        ? tipoPorId.get(centro.pai_id)
        : centro.tipo;
      // Investimento também fica fora (24/09/2026): o banco já o exclui de todo
      // relatório de custo, e oferecê-lo no filtro devolveria sempre R$ 0,00.
      return tipoDaRaiz !== "financeiro" && tipoDaRaiz !== "investimento";
    })
    .map((centro) => ({
      id: centro.id,
      nome: centro.nome,
      codigo: centro.codigo,
      paiId: centro.pai_id,
      tipo: centro.tipo,
    }));
}

/**
 * Os meses de referência que EXISTEM em lançamento não cancelado (yyyy-MM).
 *
 * Alimenta o seletor de meses e o padrão do relatório. Só mês com lançamento
 * entra: um calendário aberto deixaria a pessoa escolher março de 2019 e ler
 * "sem dados" como resposta, quando a resposta é "esse mês não existe aqui".
 */
export async function mesesDeCompetencia(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_rel_meses_competencia");
  if (error) {
    throw new Error("Não foi possível carregar os meses de referência");
  }
  return (data ?? []).map((linha) => linha.mes.slice(0, 7));
}

/**
 * O grão fino do relatório de custo x receita: uma linha por mês, centro-raiz e
 * tipo.
 *
 * Não agrega aqui de propósito. Cartões, gráfico e tabelas somam ESTAS linhas
 * (ver `custo-receita.ts`), então as três leituras não têm como divergir. Com 21
 * meses e 13 centros são 183 linhas hoje: agregar no banco por visão só criaria
 * três fontes do mesmo número.
 *
 * `centrosCusto` e `centrosReceita` são independentes: é o pedido do dono, e a
 * base explica por quê (sete centros têm custo e receita zero).
 */
export async function custoReceita({
  meses,
  centrosCusto,
  centrosReceita,
  incluirInvestimento,
}: {
  /** yyyy-MM. Lista vazia devolve nada, sem ir ao banco. */
  meses: readonly string[];
  centrosCusto?: readonly string[];
  centrosReceita?: readonly string[];
  /** CAPEX de volta no lado do custo. Ver `FiltrosCustoCentroCusto`. */
  incluirInvestimento?: boolean;
}): Promise<LinhaCustoReceita[]> {
  if (meses.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_rel_custo_receita", {
    // A coluna é `date` no dia 1: o mês da tela vira a data que a RPC compara.
    p_meses: meses.map((mes) => `${mes}-01`),
    p_centros_custo: centrosCusto ? [...centrosCusto] : undefined,
    p_centros_receita: centrosReceita ? [...centrosReceita] : undefined,
    p_incluir_investimento: incluirInvestimento,
  });

  if (error) {
    throw new Error("Não foi possível carregar o custo x receita");
  }

  return (data ?? []).map((linha) => ({
    mes: linha.mes.slice(0, 7),
    // A RPC devolve o `tipo` da coluna, que só tem estes dois valores nos
    // lançamentos. O cast é o mesmo dos outros relatórios do módulo.
    tipo: linha.tipo as LinhaCustoReceita["tipo"],
    centroCustoId: linha.centro_custo_id,
    nome: linha.nome ?? "Sem centro de custo",
    codigo: linha.codigo,
    total: paraReais(paraCentavos(linha.total)),
    retencao: paraReais(paraCentavos(linha.retencao)),
  }));
}

/**
 * Quem tem custo e quem tem receita no Custo x receita, em qualquer mês.
 *
 * É a MESMA RPC do relatório, com todos os meses e todos os centros do filtro
 * escolhidos: como ela agrupa pelo escolhido mais fundo, cada etapa volta com a
 * própria linha e a raiz só com o que caiu nela direto. Assim o filtro esconde
 * exatamente o que o relatório desenharia como R$ 0,00 — inclusive a regra de
 * natureza e o checkbox de investimento, que mudam o lado do custo.
 */
export async function centrosComMovimentoNoCustoReceita({
  meses,
  centros,
  incluirInvestimento,
}: {
  meses: readonly string[];
  centros: readonly { id: string }[];
  incluirInvestimento: boolean;
}): Promise<{ custo: Set<string>; receita: Set<string> }> {
  const ids = centros.map((centro) => centro.id);
  const linhas =
    ids.length === 0
      ? []
      : await custoReceita({
          meses,
          centrosCusto: ids,
          centrosReceita: ids,
          incluirInvestimento,
        });
  const custo = new Set<string>();
  const receita = new Set<string>();
  for (const linha of linhas) {
    if (linha.total === 0) continue;
    (linha.tipo === "a_pagar" ? custo : receita).add(linha.centroCustoId);
  }
  return { custo, receita };
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
  /** Categoria financeira do lançamento, exibida junto da descrição. */
  categoriaNome: string | null;
  status: string;
  /** Mês de referência (dia 1): o mês em que este custo entra. */
  mesCompetencia: string;
  dataVencimento: string | null;
  valor: number;
  /**
   * Dinheiro em aberto desta linha, repartido por prazo, contado nas PARCELAS.
   *
   * O `valor` acima é o total do documento e inclui o que já foi pago. Somar ele
   * e chamar de "a pagar" foi o defeito que esta estrutura conserta: no extrato
   * da EMAM dava R$ 2.325.558,12 com 12 dos 16 lançamentos pagos, quando o
   * aberto real era R$ 271.421,16.
   */
  aberto: AbertoPorPrazo;
  /** Já pago nesta linha, pelo líquido (o que saiu da conta). */
  pago: number;
}

export interface ExtratoPorFornecedor {
  fornecedorIds: string[];
  lancamentos: ExtratoLancamento[];
  total: number;
}

interface ExtratoParam {
  /**
   * Fornecedores do extrato. Lista vazia (ou ausente) traz todos.
   *
   * Lista, e não um id só, porque comparar dois ou três fornecedores no mesmo
   * extrato é o uso real. O teto de quantos entram fica no parser da URL: `in`
   * com uuid demais estoura o tamanho da URL do PostgREST antes de chegar na RLS.
   */
  fornecedorIds?: string[];
}

/** Linhas por requisição no extrato: o teto invisível do PostgREST. */
const PAGINA_EXTRATO = 1000;
/** Teto de páginas, para consulta errada não varrer o banco inteiro. */
const MAX_PAGINAS_EXTRATO = 25;

/** Fornecedores que têm ao menos um lançamento a_pagar, em ordem alfabética. */
export async function listarFornecedoresComLancamentos(): Promise<
  FornecedorOpcao[]
> {
  const supabase = await createClient();

  // DISTINCT no banco (antes vinha 1 linha por lançamento). O nome de exibição
  // (fantasia, senão razão social) já vem resolvido da fn_rel_*.
  const { data, error } = await supabase.rpc(
    "fn_rel_fornecedores_com_lancamentos",
  );

  if (error) {
    throw new Error("Não foi possível carregar os fornecedores");
  }

  return (data ?? [])
    .map((linha) => ({ id: linha.id, nome: linha.nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

/**
 * Extrato de lançamentos a_pagar de um fornecedor (ou de todos, se nenhum for
 * passado), mais recentes por vencimento primeiro, com o total somado.
 * Cancelados ficam de fora.
 */
export async function extratoPorFornecedor({
  fornecedorIds = [],
}: ExtratoParam = {}): Promise<ExtratoPorFornecedor> {
  const supabase = await createClient();

  let consulta = supabase
    .from("lancamentos")
    .select(
      `id, numero, descricao, status, mes_competencia, data_vencimento, valor,
       categorias_financeiras(nome),
       lancamento_parcelas(status, valor, valor_liquido, desconto, data_vencimento)`,
    )
    .eq("tipo", "a_pagar")
    .neq("status", "cancelado");

  if (fornecedorIds.length === 1) {
    consulta = consulta.eq("fornecedor_id", fornecedorIds[0]);
  } else if (fornecedorIds.length > 1) {
    consulta = consulta.in("fornecedor_id", fornecedorIds);
  }

  /**
   * Lê em PÁGINAS, não numa tacada.
   *
   * O PostgREST corta a resposta em 1000 linhas sem avisar. Sem fornecedor
   * escolhido o extrato tem 5.848 lançamentos, então a tela mostrava 1000 e os
   * cartões somavam só esse pedaço com cara de total (medido em 15/08/2026). O
   * desempate por `id` é o que torna a paginação confiável: `created_at` está
   * empatado em massa pela carga do Mais Controle, e sem chave única a página 2
   * repetiria linha e perderia outra.
   */
  const ordenada = consulta
    .order("data_vencimento", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  const primeira = await ordenada.range(0, PAGINA_EXTRATO - 1);
  if (primeira.error) {
    throw new Error("Não foi possível carregar o extrato do fornecedor");
  }

  const data = [...(primeira.data ?? [])];
  if (data.length === PAGINA_EXTRATO) {
    for (let pagina = 1; pagina < MAX_PAGINAS_EXTRATO; pagina += 1) {
      const inicio = pagina * PAGINA_EXTRATO;
      const { data: lote, error } = await ordenada.range(
        inicio,
        inicio + PAGINA_EXTRATO - 1,
      );
      if (error) {
        throw new Error("Não foi possível carregar o extrato do fornecedor");
      }
      const recebidas = lote ?? [];
      data.push(...recebidas);
      if (recebidas.length < PAGINA_EXTRATO) break;
    }
  }

  /** Parcelas da linha no formato das funções de dinheiro do `_shared`. */
  const parcelasDe = (lancamento: {
    lancamento_parcelas: Array<{
      status: string;
      valor: number;
      valor_liquido: number | null;
      desconto: number | null;
      data_vencimento: string | null;
    }> | null;
  }) =>
    (lancamento.lancamento_parcelas ?? []).map((parcela) => ({
      status: parcela.status,
      valor: parcela.valor,
      valorLiquido: parcela.valor_liquido,
      desconto: parcela.desconto,
      dataVencimento: parcela.data_vencimento,
    }));

  // Uma leitura do relógio para o extrato todo: com `dataHojeISO()` por linha,
  // uma consulta que virasse a meia-noite classificaria parte das parcelas por um
  // dia e parte pelo outro, e as faixas deixariam de fechar com o total.
  const hojeISO = dataHojeISO();

  const lancamentos: ExtratoLancamento[] = (data ?? []).map((lancamento) => ({
    id: lancamento.id,
    numero: lancamento.numero,
    descricao: lancamento.descricao,
    categoriaNome: lancamento.categorias_financeiras?.nome ?? null,
    status: lancamento.status,
    mesCompetencia: lancamento.mes_competencia,
    dataVencimento: lancamento.data_vencimento,
    valor: lancamento.valor,
    aberto: abertoPorPrazo(parcelasDe(lancamento), hojeISO),
    pago: pagoDasParcelas(parcelasDe(lancamento)).pago,
  }));

  return {
    fornecedorIds,
    lancamentos,
    // Total do EXTRATO (documentos, pagos incluídos). Continua existindo porque é
    // o tamanho da relação com o fornecedor, mas quem manda nos cartões de
    // dinheiro é o `aberto` de cada linha: os cartões são somados na tela, sobre
    // as linhas que sobraram do filtro.
    total: paraReais(
      lancamentos.reduce((soma, l) => soma + paraCentavos(l.valor), 0),
    ),
  };
}

/**
 * Ranking de fornecedores: uma linha por fornecedor, agregada no banco
 * (`fn_rel_fornecedores_ranking`). `inicio`/`fim` recortam o lançado
 * (competência) e o pago (data do pagamento); o em aberto é a posição de hoje.
 * Fim exclusivo; ponta ausente = sem limite.
 *
 * Lê em páginas: em 15/10/2026 são 848 fornecedores com movimento, perto do
 * teto de 1000 linhas do PostgREST.
 */
export async function rankingFornecedores({
  inicio,
  fim,
}: { inicio?: string; fim?: string }): Promise<FornecedorRankingLinha[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .rpc("fn_rel_fornecedores_ranking", { p_inicio: inicio, p_fim: fim })
      .range(de, ate),
  );
  if (erro) {
    throw new Error("Não foi possível carregar o ranking de fornecedores");
  }
  return linhas.map((l) => ({
    fornecedorId: l.fornecedor_id,
    nome: l.nome,
    lancamentos: Number(l.lancamentos),
    lancado: Number(l.comprado),
    pago: Number(l.pago),
    emAberto: Number(l.em_aberto),
    vencido: Number(l.vencido),
    proximos30: Number(l.proximos_30),
  }));
}

/** Mês corrente "YYYY-MM" no fuso de Rio Branco, default do seletor do DRE. */
export function mesCorrente(): string {
  return dataHojeISO().slice(0, 7);
}

/**
 * O último mês FECHADO ("YYYY-MM"), padrão do DRE, do custo por grupo e do
 * custo por centro, na tela e no Excel. No meio do mês o corrente tem metade
 * das notas e nenhuma medição, e abrir nele mostrava uma queda que não houve.
 */
export function mesFechado(): string {
  const [ano, mes] = mesCorrente().split("-").map(Number);
  const anterior = new Date(Date.UTC(ano, mes - 2, 1));
  return anterior.toISOString().slice(0, 7);
}

// =====================================================================
// 7. Custo por grupo de insumo (drill-down grupo -> subcategoria -> insumo)
// =====================================================================

export interface CustoSubcategoria {
  categoriaId: string;
  nome: string;
  valor: number;
}

/** Uma categoria financeira dentro da linha "Sem insumo". */
export interface CustoCategoriaSemInsumo {
  /** Nulo = rateio sem categoria (nem no rateio nem no lançamento). */
  categoriaId: string | null;
  nome: string;
  valor: number;
}

export interface CustoGrupo {
  /** Nulo na linha "Sem insumo (lançamento avulso)". */
  grupoId: string | null;
  nome: string;
  cor: CorGrupo;
  valor: number;
  /** Nível 2 do drill-down, já carregado (são poucas linhas). */
  subcategorias: CustoSubcategoria[];
  /**
   * Só na linha "Sem insumo": o nível 2 é a categoria financeira, porque esse
   * dinheiro não tem insumo para abrir (92,8% do custo de 2026).
   */
  categorias?: CustoCategoriaSemInsumo[];
}

export interface CustoPorGrupo {
  grupos: CustoGrupo[];
  total: number;
}

/** Filtros do relatório de custo por grupo de insumo. */
export interface FiltrosCustoPorGrupo extends RecorteCustoGrupo {
  /** Primeiro dia do período. Ausente = sem limite. */
  inicio?: string;
  /** Primeiro dia do mês SEGUINTE ao último do período (fim exclusivo). */
  fim?: string;
}

/**
 * As subcategorias que sobrevivem ao filtro de categoria financeira.
 *
 * A `fn_rel_custo_por_subcategoria` recebe `p_centro_custo` e NÃO recebe
 * `p_categoria`, então o nível 2 do drill precisa do mesmo corte feito aqui —
 * senão o filho não fecha com o pai, que é o defeito que este módulo mais teve.
 *
 * O corte é exato, e não uma aproximação: a categoria financeira de um item vem
 * de `categorias_insumo.categoria_financeira_id` (é assim que
 * `fn_rel_custo_itens_oc` a monta), e o nível 2 agrupa por essa mesma
 * subcategoria. Como a coluna é do próprio registro, uma subcategoria está
 * inteira dentro ou inteira fora do filtro — nunca partida. Subcategoria com
 * categoria financeira nula fica de fora, exatamente como o `=` do SQL a deixa.
 */
async function subcategoriasDaCategoria(
  supabase: Awaited<ReturnType<typeof createClient>>,
  categoriaId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("categorias_insumo")
    .select("id")
    .eq("categoria_financeira_id", categoriaId);

  if (error) {
    throw new Error("Não foi possível carregar as subcategorias de insumo");
  }
  return new Set((data ?? []).map((linha) => linha.id));
}

/**
 * Custo por grupo de insumo no período, com as subcategorias de cada grupo já
 * carregadas (nível 3, o insumo, vem por ação sob demanda).
 *
 * A dimensão de insumo existe nos itens da OC, não no rateio, então lançamento
 * avulso entra na linha "Sem insumo": é isso que faz a soma por grupo fechar com
 * o custo total do período.
 *
 * O CENTRO E A CATEGORIA DESCEM PARA O NÍVEL 2 JUNTO. O centro vai como
 * parâmetro (a RPC filtra pela subárvore dele); a categoria é aplicada aqui,
 * porque a RPC do nível 2 não a recebe. As duas coisas têm o mesmo objetivo: a
 * soma das subcategorias abertas tem de dar o valor do grupo que está na linha de
 * cima.
 */
export async function custoPorGrupo(
  filtros?: FiltrosCustoPorGrupo,
): Promise<CustoPorGrupo> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("fn_rel_custo_por_grupo", {
    p_inicio: filtros?.inicio,
    p_fim: filtros?.fim,
    p_centro_custo: filtros?.centroCustoId,
    p_categoria: filtros?.categoriaId,
    p_incluir_investimento: filtros?.incluirInvestimento,
  });

  if (error) {
    throw new Error("Não foi possível carregar o custo por grupo");
  }

  const linhas = data ?? [];

  // Uma consulta só, e só quando há filtro de categoria: são dezenas de
  // subcategorias no cadastro inteiro, e ir ao banco por grupo aberto seria
  // repetir a mesma resposta quatro vezes.
  const daCategoria = filtros?.categoriaId
    ? await subcategoriasDaCategoria(supabase, filtros.categoriaId)
    : null;

  const subcategorias = await Promise.all(
    linhas.map(async (linha) => {
      if (!linha.grupo_id) return [] as CustoSubcategoria[];
      const { data: subs } = await supabase.rpc(
        "fn_rel_custo_por_subcategoria",
        {
          p_grupo_id: linha.grupo_id,
          p_inicio: filtros?.inicio,
          p_fim: filtros?.fim,
          p_centro_custo: filtros?.centroCustoId,
          p_incluir_investimento: filtros?.incluirInvestimento,
        },
      );
      return (subs ?? [])
        .filter((sub) => daCategoria === null || daCategoria.has(sub.categoria_id))
        .map((sub) => ({
          categoriaId: sub.categoria_id,
          nome: sub.categoria_nome,
          valor: paraReais(paraCentavos(sub.total)),
        }));
    }),
  );

  const categoriasSemInsumo = linhas.some((linha) => !linha.grupo_id)
    ? await custoSemInsumoPorCategoria(filtros)
    : [];

  const grupos: CustoGrupo[] = linhas.map((linha, indice) => ({
    grupoId: linha.grupo_id,
    nome: linha.grupo_nome,
    cor: corGrupo(linha.grupo_cor),
    valor: paraReais(paraCentavos(linha.total)),
    subcategorias: subcategorias[indice] ?? [],
    ...(linha.grupo_id ? {} : { categorias: categoriasSemInsumo }),
  }));

  return {
    grupos,
    total: grupos.reduce((soma, grupo) => soma + grupo.valor, 0),
  };
}

/**
 * A linha "Sem insumo" aberta por categoria financeira (a do rateio, caindo na
 * do lançamento). Mesmo filtro do ramo `sem_insumo` de `fn_rel_custo_por_grupo`:
 * a soma fecha com a linha.
 */
export async function custoSemInsumoPorCategoria(
  filtros?: FiltrosCustoPorGrupo,
): Promise<CustoCategoriaSemInsumo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_rel_custo_sem_insumo_por_categoria", {
    p_inicio: filtros?.inicio,
    p_fim: filtros?.fim,
    p_centro_custo: filtros?.centroCustoId,
    p_categoria: filtros?.categoriaId,
    p_incluir_investimento: filtros?.incluirInvestimento,
  });
  if (error) {
    throw new Error("Não foi possível abrir o custo sem insumo por categoria");
  }
  return (data ?? []).map((linha) => ({
    categoriaId: linha.categoria_id,
    nome: linha.categoria_nome,
    valor: paraReais(paraCentavos(linha.total)),
  }));
}

/**
 * Custo total por mês (yyyy-MM), somando os grupos. Chama a própria
 * `fn_rel_custo_por_grupo` mês a mês no banco, então o mês fecha com o período.
 * Precisa das duas pontas; a função recusa mais de 36 meses.
 */
export async function custoPorGrupoMensal(
  filtros: FiltrosCustoPorGrupo & { inicio: string; fim: string },
): Promise<{ mes: string; total: number }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_rel_custo_por_grupo_mensal", {
    p_inicio: filtros.inicio,
    p_fim: filtros.fim,
    p_centro_custo: filtros.centroCustoId,
    p_categoria: filtros.categoriaId,
    p_incluir_investimento: filtros.incluirInvestimento,
  });
  if (error) {
    throw new Error("Não foi possível carregar o custo mês a mês");
  }
  const porMes = new Map<string, number>();
  for (const linha of data ?? []) {
    const mes = linha.mes.slice(0, 7);
    porMes.set(mes, (porMes.get(mes) ?? 0) + paraCentavos(linha.total));
  }
  return [...porMes.entries()].map(([mes, centavos]) => ({ mes, total: paraReais(centavos) }));
}

/**
 * Nível 3 do drill-down: insumos de uma subcategoria no período.
 *
 * Leva o CENTRO junto, e não precisa levar a categoria financeira: a
 * subcategoria pedida já é a chave, e a categoria financeira é uma coluna dela
 * (ver `subcategoriasDaCategoria`). Se esta subcategoria apareceu na tela, ela
 * passou pelo filtro de categoria inteira — então todo insumo dela está dentro
 * do mesmo recorte, e a soma dos insumos fecha com a linha que foi aberta.
 */
export async function custoPorInsumo(
  categoriaId: string,
  filtros?: FiltrosCustoPorGrupo,
): Promise<{ nome: string; quantidade: number; valor: number }[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("fn_rel_custo_por_insumo", {
    p_categoria_id: categoriaId,
    p_inicio: filtros?.inicio,
    p_fim: filtros?.fim,
    p_centro_custo: filtros?.centroCustoId,
    p_incluir_investimento: filtros?.incluirInvestimento,
  });

  if (error) {
    throw new Error("Não foi possível carregar o custo por insumo");
  }

  return (data ?? []).map((linha) => ({
    nome: linha.insumo_nome,
    quantidade: Number(linha.quantidade ?? 0),
    valor: paraReais(paraCentavos(linha.total)),
  }));
}

/**
 * O relatório de Investimentos: as transferências entre cada conta e a sua
 * subconta de investimentos, com a aplicação (CDB, fundo) de cada uma, mais o
 * saldo das subcontas.
 *
 * O saldo sai de `fn_saldos_das_contas`, a mesma função de Contas bancárias e de
 * Posição bancária: o "saldo aplicado" daqui não tem como discordar do que a
 * subconta mostra lá. A subconta herda a permissão de ver saldo da conta-mãe
 * (fn_pode_ver_saldo), e a que a pessoa não pode ver fica fora do total, contada.
 */
export async function investimentos(
  periodo: PeriodoInvestimentos,
): Promise<Investimentos> {
  const supabase = await createClient();

  const [contasResultado, saldosResultado, aplicacoesResultado, saldosAplicacoesResultado] =
    await Promise.all([
      supabase
        .from("contas_bancarias")
        .select("id, nome, tipo, conta_pai_id, ativo")
        .order("nome"),
      supabase.rpc("fn_saldos_das_contas"),
      supabase.from("aplicacoes").select("id, centro_custo_id"),
      supabase.rpc("fn_saldos_das_aplicacoes"),
    ]);
  if (contasResultado.error) {
    throw new Error("Não foi possível carregar as contas bancárias");
  }
  if (saldosResultado.error) {
    throw new Error("Não foi possível carregar o saldo das contas");
  }
  if (aplicacoesResultado.error || saldosAplicacoesResultado.error) {
    throw new Error("Não foi possível carregar o saldo das aplicações");
  }

  const contas = contasResultado.data ?? [];
  const nomePorId = new Map(contas.map((conta) => [conta.id, conta.nome]));
  const saldoPorConta = new Map(
    (saldosResultado.data ?? []).map((linha) => [
      linha.conta_bancaria_id,
      Number(linha.saldo),
    ]),
  );
  const subcontasTodas = contas.filter((conta) => conta.tipo === "investimento");
  const idsSubcontas = new Set(subcontasTodas.map((conta) => conta.id));

  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("transferencias_contas")
      .select(
        `id, numero, data_transferencia, valor, descricao, conta_origem_id,
         conta_destino_id, centro_custo_id,
         aplicacao:centros_custo!transferencias_contas_centro_custo_id_fkey(nome)`,
      )
      .not("centro_custo_id", "is", null)
      .order("data_transferencia")
      .order("id")
      .range(de, ate),
  );
  if (erro) {
    throw new Error("Não foi possível carregar as aplicações");
  }

  const movimentos: MovimentoInvestimento[] = [];
  for (const linha of linhas) {
    const destinoEhSubconta = idsSubcontas.has(linha.conta_destino_id);
    const subcontaId = destinoEhSubconta
      ? linha.conta_destino_id
      : linha.conta_origem_id;
    // A RPC só grava aplicação com uma ponta subconta; a checagem aqui é para
    // um dado que alguém escreveu à mão não virar resgate de uma conta corrente.
    if (!idsSubcontas.has(subcontaId) || linha.centro_custo_id === null) continue;
    movimentos.push({
      id: linha.id,
      numero: linha.numero,
      data: linha.data_transferencia,
      valor: Number(linha.valor),
      sentido: sentidoDaTransferencia(destinoEhSubconta),
      aplicacaoId: linha.centro_custo_id,
      aplicacaoNome: linha.aplicacao?.nome ?? "Aplicação",
      subcontaId,
      descricao: linha.descricao,
    });
  }

  // Subconta inativa sem movimento não tem o que dizer; com movimento, fica.
  const comMovimento = new Set(movimentos.map((m) => m.subcontaId));
  const subcontas: SubcontaInvestimento[] = subcontasTodas
    .filter((conta) => conta.ativo || comMovimento.has(conta.id))
    .map((conta) => ({
      contaId: conta.id,
      nome: conta.nome,
      contaPaiNome: nomePorId.get(conta.conta_pai_id ?? "") ?? conta.nome,
      saldoAtual: saldoPorConta.get(conta.id) ?? null,
    }));

  // A RPC devolve pelo id da aplicação; os movimentos são pela etapa. Aplicação
  // cujo saldo a pessoa não vê não vem, e o relatório cai no aplicado menos
  // resgatado dela.
  const etapaDaAplicacao = new Map(
    (aplicacoesResultado.data ?? []).map((a) => [a.id, a.centro_custo_id]),
  );
  const saldosReais: SaldoRealAplicacao[] = [];
  for (const linha of saldosAplicacoesResultado.data ?? []) {
    const etapa = etapaDaAplicacao.get(linha.aplicacao_id);
    if (!etapa) continue;
    saldosReais.push({
      aplicacaoId: etapa,
      nome: linha.nome,
      subcontaId: linha.conta_bancaria_id,
      saldo: Number(linha.saldo),
    });
  }

  return montarInvestimentos(movimentos, subcontas, periodo, saldosReais);
}


// =====================================================================
// Sócios e ligadas (PR 2 do controle total, D3/D4)
// =====================================================================

/** Enviado, devolvido e saldo por centro de sócio e de empresa ligada. Fim exclusivo. */
export async function sociosLigadas(inicio: string, fim: string): Promise<SocioLigadaLinha[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_rel_socios_ligadas", { p_inicio: inicio, p_fim: fim });
  if (error) {
    throw new Error("Não foi possível carregar o relatório de sócios e ligadas");
  }
  return (data ?? []).map((l) => ({
    centroId: l.centro_id,
    centro: l.centro,
    tipo: l.tipo,
    ativo: l.ativo,
    enviado: Number(l.enviado),
    devolvido: Number(l.devolvido),
    saldo: Number(l.saldo),
  }));
}

/**
 * Mês a mês de cada centro de sócio e de empresa ligada, com a parte ainda em
 * aberto (medida pela parcela). Fim exclusivo. Fecha com `sociosLigadas` no
 * mesmo período.
 */
export async function sociosLigadasMensal(inicio: string, fim: string): Promise<SocioLigadaMes[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_rel_socios_ligadas_mensal", {
    p_inicio: inicio,
    p_fim: fim,
  });
  if (error) {
    throw new Error("Não foi possível carregar o mês a mês de sócios e ligadas");
  }
  return (data ?? []).map((l) => ({
    centroId: l.centro_id,
    mes: l.mes.slice(0, 7),
    enviado: Number(l.enviado),
    enviadoAberto: Number(l.enviado_aberto),
    devolvido: Number(l.devolvido),
    devolvidoAberto: Number(l.devolvido_aberto),
  }));
}

/** Os dois juntos, prontos para a tela e para a planilha. */
export async function relatorioSociosLigadas(): Promise<SociosLigadasRelatorio> {
  const [centros, meses] = await Promise.all([
    sociosLigadas("1900-01-01", "2100-01-01"),
    sociosLigadasMensal("1900-01-01", "2100-01-01"),
  ]);
  return montarSociosLigadas(centros, meses, mesCorrente());
}


// =====================================================================
// Equipamentos e consórcios (12/10/2026)
// =====================================================================

/** Bens comprados (por centro) e cotas de consórcio (por lançamento). */
export async function aquisicoes(): Promise<AquisicaoLinha[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_rel_aquisicoes_quitacao");
  if (error) {
    throw new Error("Não foi possível carregar o relatório de equipamentos e consórcios");
  }
  return (data ?? []).map((l) => ({
    tipo: l.tipo === "consorcio" ? "consorcio" : "equipamento",
    grupo: l.grupo,
    centroId: l.centro_id,
    centro: l.centro,
    lancamentoId: l.lancamento_id ?? null,
    numero: l.numero ?? null,
    descricao: l.descricao ?? null,
    fornecedor: l.fornecedor ?? null,
    primeiraCompetencia: l.primeira_competencia ?? null,
    lancamentos: Number(l.lancamentos),
    parcelas: l.parcelas === null ? null : Number(l.parcelas),
    parcelasPagas: l.parcelas_pagas === null ? null : Number(l.parcelas_pagas),
    valor: Number(l.valor),
    pago: Number(l.pago),
    aPagar: Number(l.a_pagar),
    parcelasAbertas: Number(l.parcelas_abertas ?? 0),
    proximoVencimento: l.proximo_vencimento ?? null,
    ultimoVencimento: l.ultimo_vencimento ?? null,
    divida: l.divida === "contrato" || l.divida === "cota" ? l.divida : null,
  }));
}


// =====================================================================
// Custos indiretos (12/10/2026)
// =====================================================================

/**
 * O custo dos centros indiretos no ano, por mês, etapa e categoria. Mesmo
 * critério do rateio do indireto: a soma do mês é o que ele distribui.
 */
export async function custosIndiretos(ano: number): Promise<CustoIndiretoLinha[]> {
  const supabase = await createClient();
  // Paginado: 683 linhas em 2026 (mês x etapa x categoria, com as 61 máquinas
  // da manutenção), e o PostgREST corta em mil sem avisar. A ordem é a chave do
  // agrupamento da RPC, para as páginas não se sobreporem.
  const { linhas: data, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .rpc("fn_rel_custos_indiretos", { p_ano: ano })
      .order("mes")
      .order("centro_id")
      .order("categoria_id", { nullsFirst: true })
      .order("categoria")
      .range(de, ate),
  );
  if (erro) {
    throw new Error("Não foi possível carregar o relatório de custos indiretos");
  }
  return data.map((l) => ({
    mes: l.mes,
    raizId: l.raiz_id,
    raiz: l.raiz,
    centroId: l.centro_id,
    centro: l.centro,
    categoriaId: l.categoria_id ?? null,
    categoria: l.categoria,
    total: Number(l.total),
  }));
}


// =====================================================================
// Rateio do custo indireto (PR 3 do controle total, D6/D7/D8)
// =====================================================================

/** O rateio de um mês (yyyy-MM), como `fn_rateio_indireto_mes` calcula. */
export async function rateioIndiretoDoMes(mes: string): Promise<RateioDoMes> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_rateio_indireto_mes", { p_mes: `${mes}-01` });
  if (error) throw new Error("Não foi possível carregar o rateio do indireto");
  const linhas = data ?? [];
  const primeira = linhas[0];
  return {
    mes,
    status: (primeira?.status ?? "automatico") as StatusRateio,
    custoIndiretoMes: Number(primeira?.custo_indireto_mes ?? 0),
    naoRateado: Number(primeira?.nao_rateado ?? 0),
    linhas: linhas
      .filter((l) => l.centro_id !== null)
      .map((l) => ({
        centroId: l.centro_id as string,
        centro: l.centro ?? "",
        custoDireto: Number(l.custo_direto),
        pctSugerido: Number(l.pct_sugerido),
        pctVigente: Number(l.pct_vigente),
        indireto: Number(l.indireto),
        semCusto: l.sem_custo,
      })),
  };
}

/**
 * Indireto rateado por obra numa janela [inicio, fim), somado mês a mês, e os
 * centros que são indiretos (para a tela tirar a linha deles).
 *
 * Os indiretos vêm do cadastro (`papel_rateio = 'indireto'`) e não de uma lista
 * no código: quem decide o papel é o banco, e a tela não pode discordar dele.
 */
export async function indiretoDoPeriodo(
  inicio: string,
  fim: string,
): Promise<IndiretoDoPeriodo> {
  return indiretoDasJanelas([{ inicio, fim }]);
}

async function indiretoDasJanelas(
  janelas: readonly { inicio: string; fim: string }[],
): Promise<IndiretoDoPeriodo> {
  const supabase = await createClient();
  const [periodos, centros] = await Promise.all([
    Promise.all(
      janelas.map((j) => supabase.rpc("fn_rateio_indireto_periodo", { p_inicio: j.inicio, p_fim: j.fim })),
    ),
    supabase.from("centros_custo").select("id, papel_rateio").not("papel_rateio", "is", null),
  ]);
  if (centros.error || periodos.some((p) => p.error)) {
    throw new Error("Não foi possível carregar o rateio do indireto");
  }
  const porObraCent = new Map<string, number>();
  let naoRateadoCent = 0;
  for (const { data } of periodos) {
    for (const l of data ?? []) {
      if (l.centro_id) {
        porObraCent.set(l.centro_id, (porObraCent.get(l.centro_id) ?? 0) + paraCentavos(Number(l.indireto)));
      } else naoRateadoCent += paraCentavos(Number(l.nao_rateado));
    }
  }
  return {
    porObra: new Map([...porObraCent].map(([id, c]) => [id, paraReais(c)])),
    naoRateado: paraReais(naoRateadoCent),
    indiretos: new Set((centros.data ?? []).filter((c) => c.papel_rateio === "indireto").map((c) => c.id)),
    // Unidade própria (001 Carretas EMT): não rateia nem recebe, e fica fora da margem por obra.
    fora: new Set((centros.data ?? []).filter((c) => c.papel_rateio === "fora").map((c) => c.id)),
  };
}


// =====================================================================
// Resultado por obra e Indireto (15/10/2026)
// =====================================================================

/**
 * O rateio do indireto mês a mês numa janela [inicio, fim), uma chamada só.
 * É `fn_rateio_indireto_mes` por baixo, o mesmo número que o Tiago ajusta.
 */
export async function rateioIndiretoDosMeses(
  inicio: string,
  fim: string,
): Promise<LinhaRateioMes[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_rel_rateio_indireto_meses", {
    p_inicio: inicio,
    p_fim: fim,
  });
  if (error) throw new Error("Não foi possível carregar o rateio do indireto");
  return (data ?? []).map((l) => ({
    mes: l.mes.slice(0, 7),
    centroId: l.centro_id,
    centro: l.centro,
    custoDireto: Number(l.custo_direto),
    indireto: Number(l.indireto),
    status: l.status,
    naoRateado: Number(l.nao_rateado),
    custoIndiretoMes: Number(l.custo_indireto_mes),
  }));
}

/** Papel de cada centro raiz no rateio: indireto (rateia) ou fora (não entra). */
export async function papeisDoRateio(): Promise<Map<string, PapelRateio>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("centros_custo")
    .select("id, papel_rateio")
    .not("papel_rateio", "is", null);
  if (error) throw new Error("Não foi possível carregar os centros do rateio");
  return new Map(
    (data ?? [])
      .filter((c) => c.papel_rateio === "indireto" || c.papel_rateio === "fora")
      .map((c) => [c.id, c.papel_rateio as PapelRateio]),
  );
}

/** Os termos que levam do custo e da receita operacionais do DRE aos das obras. */
export async function ponteObrasDre(inicio: string, fim: string): Promise<TermosPonteDre> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_rel_obras_ponte_dre", {
    p_inicio: inicio,
    p_fim: fim,
  });
  if (error) throw new Error("Não foi possível carregar a conferência com o DRE");
  const termo = (nome: string) => Number((data ?? []).find((t) => t.termo === nome)?.valor ?? 0);
  return {
    custoForaDasObras: termo("custo_operacional_fora_das_obras"),
    receitaForaDasObras: termo("receita_operacional_fora_das_obras"),
    financeiraNasObras: termo("despesa_financeira_nas_obras"),
    cronogramaOperacional: termo("cronograma_reclassificado_operacional"),
  };
}

/** O primeiro mês da busca do "desde o início": antes disso o ERP não tem lançamento. */
const INICIO_DA_HISTORIA = "2020-01";

/** Os meses yyyy-MM de `de` até `ate`, inclusive. */
function mesesEntre(de: string, ate: string): string[] {
  const meses: string[] = [];
  for (let m = de; m <= ate; m = proximoMes(m).slice(0, 7)) meses.push(m);
  return meses;
}

/**
 * Tudo que o Resultado por obra mostra, para a tela e a planilha lerem do mesmo
 * lugar: as três janelas até `mes` e a ponte com o DRE no ano até `mes`.
 */
export async function carregarResultadoPorObra(
  mes: string,
): Promise<{ resultado: ResultadoPorObra; ponte: PonteObrasDre }> {
  const [linhas, papeis] = await Promise.all([
    custoReceita({ meses: mesesEntre(INICIO_DA_HISTORIA, mes) }),
    papeisDoRateio(),
  ]);
  // O rateio só nos meses em que algum indireto teve custo: cada mês do rateio
  // relê o custo x receita inteiro, e os anos sem lançamento seriam dezenas de
  // meses calculados para devolver zero.
  const mesesComIndireto = [
    ...new Set(
      linhas
        .filter((l) => l.tipo === "a_pagar" && papeis.get(l.centroCustoId) === "indireto")
        .map((l) => l.mes),
    ),
  ];
  const inicioDoAno = `${mes.slice(0, 4)}-01-01`;
  const fimDoMes = proximoMes(mes);
  const [rateios, dre, termos] = await Promise.all([
    Promise.all(janelasContiguas(mesesComIndireto).map((j) => rateioIndiretoDosMeses(j.inicio, j.fim))),
    dreGerencial({ inicio: inicioDoAno, fim: fimDoMes }),
    ponteObrasDre(inicioDoAno, fimDoMes),
  ]);
  const resultado = resultadoPorObra({ mes, linhas, rateio: rateios.flat(), papeis });
  return {
    resultado,
    ponte: montarPonteObrasDre({
      dre: { receita: dre.operacional.totalReceitas, custo: dre.operacional.totalDespesas },
      obras: { receita: resultado.totalGeral.ano.receita, custo: resultado.totalGeral.ano.custo },
      termos,
    }),
  };
}

/** O Indireto de um ano: uma linha por mês, e as linhas cruas para o detalhe. */
export async function carregarIndiretoDoAno(ano: number): Promise<{
  meses: MesDoIndireto[];
  rateio: LinhaRateioMes[];
  categorias: CustoIndiretoLinha[];
}> {
  const [rateio, categorias] = await Promise.all([
    rateioIndiretoDosMeses(`${ano}-01-01`, `${ano + 1}-01-01`),
    custosIndiretos(ano),
  ]);
  return { meses: indiretoPorMes(rateio, categorias), rateio, categorias };
}
