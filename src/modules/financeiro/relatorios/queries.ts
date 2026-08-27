import "server-only";

import { dataHojeISO } from "@/lib/formatadores";
import { createClient } from "@/lib/supabase/server";
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
  montarCreditos,
  type Creditos,
} from "@/modules/financeiro/relatorios/creditos";
import {
  agregarAging,
  agruparDrePorNatureza,
  paraCentavos,
  paraReais,
  proximoMes,
  rotuloMes,
  somarPorCategoria,
  totalAging,
  totalCategorias,
  vencidoAging,
  type AgingFaixa,
  type BlocoDre,
  type DreLinha,
  type LancamentoCategoria,
  type LinhaFaixaAging,
} from "@/modules/financeiro/relatorios/calculo";

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
 * Fluxo de caixa mensal: entradas (lançamentos a_receber) x saídas (a_pagar),
 * separando realizado de projetado. O realizado (parcelas pagas) entra no mês
 * em que o dinheiro de fato se moveu (data_pagamento), refletindo a posição de
 * caixa; o projetado (pendentes/aprovadas) entra no mês de vencimento, pois é
 * quando deve ocorrer. Parcelas canceladas ficam de fora.
 */
export async function fluxoCaixa(): Promise<FluxoCaixa> {
  const supabase = await createClient();

  // Agregado no banco: uma linha por mês/tipo/realizado (a regra do mês do
  // pagamento x mês do vencimento vive na fn_rel_fluxo_caixa).
  const { data, error } = await supabase.rpc("fn_rel_fluxo_caixa");

  if (error) {
    throw new Error("Não foi possível carregar o fluxo de caixa");
  }

  const porMes = new Map<string, AcumuladorFluxo>();

  for (const linha of data ?? []) {
    const centavos = paraCentavos(linha.total);
    const ehEntrada = linha.tipo === "a_receber";

    const atual =
      porMes.get(linha.mes) ??
      ({
        entradasRealizado: 0,
        entradasProjetado: 0,
        saidasRealizado: 0,
        saidasProjetado: 0,
      } satisfies AcumuladorFluxo);

    if (ehEntrada) {
      if (linha.realizado) atual.entradasRealizado += centavos;
      else atual.entradasProjetado += centavos;
    } else {
      if (linha.realizado) atual.saidasRealizado += centavos;
      else atual.saidasProjetado += centavos;
    }

    porMes.set(linha.mes, atual);
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
  /** Operacional mais financeiro. A movimentação não entra, de propósito. */
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
  mes,
}: OpcaoMesParam): Promise<DreGerencial> {
  const supabase = await createClient();

  const inicio = `${mes}-01`;
  const fim = proximoMes(mes);

  // Agregado no banco: uma linha por tipo/categoria do mês, pelo MÊS DE
  // REFERÊNCIA do lançamento (regime de competência; ver fn_rel_dre).
  const { data, error } = await supabase.rpc("fn_rel_dre", {
    p_inicio: inicio,
    p_fim: fim,
  });

  if (error) {
    throw new Error("Não foi possível carregar o DRE gerencial");
  }

  // A separação em três blocos é lógica pura e mora em calculo.ts, com teste.
  // Aqui só a chamada: esta função é a que fala com o banco.
  const { operacional, financeiro, movimentacao, resultado } =
    agruparDrePorNatureza(data ?? []);

  return { mes, operacional, financeiro, movimentacao, resultado };
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

  for (const linha of data ?? []) {
    const item: LinhaFaixaAging = {
      faixa: linha.faixa_aging,
      valor: linha.total,
    };
    if (linha.tipo === "a_receber") {
      aReceber.push(item);
    } else {
      aPagar.push(item);
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
  totalSaldoInicial: number;
  totalEntradas: number;
  totalSaidas: number;
  totalSaldoAtual: number;
}

/**
 * Saldo por conta bancária ativa: saldo_inicial mais o movimento da conta.
 *
 * ENTRA: parcela recebida (a_receber) e o lado de quem recebeu numa
 * transferência entre contas (transferencia_entrada).
 * SAI: parcela paga (a_pagar) e o lado de quem mandou numa transferência
 * (transferencia_saida) -- nessa, a tarifa já vem somada pela RPC, porque o
 * banco debita valor mais tarifa da origem e credita só o valor no destino.
 *
 * Só conta parcela paga (status='pago') com conta_bancaria_id preenchida. As
 * transferências entram todas: elas não têm status, são registro direto.
 *
 * NÃO é "o efeito de tudo que movimentou a conta", e o que a RPC recorta desde
 * 22/08/2026 é o que faz esta tela e a aba Contas bancárias concordarem:
 *   1. só movimento POSTERIOR a `saldo_inicial_data` (null = tudo);
 *   2. nada de categoria com natureza `movimentacao` -- aplicação e resgate do
 *      principal não mexem no saldo, porque o dinheiro não saiu da empresa.
 * O saldo daqui é o dinheiro que a empresa TEM naquele banco, corrente mais
 * aplicado, que é o número que o extrato chama de "Saldo".
 */
export async function posicaoBancaria(): Promise<PosicaoBancaria> {
  const supabase = await createClient();

  const { data: contas, error: erroContas } = await supabase
    .from("contas_bancarias")
    .select("id, nome, banco, saldo_inicial, saldo_inicial_data")
    .eq("ativo", true)
    .order("nome");

  if (erroContas) {
    throw new Error("Não foi possível carregar as contas bancárias");
  }

  // Agregado no banco: uma linha por conta/tipo das parcelas pagas.
  const { data: movimentos, error: erroParcelas } = await supabase.rpc(
    "fn_rel_posicao_bancaria",
  );

  if (erroParcelas) {
    throw new Error("Não foi possível carregar os pagamentos das contas");
  }

  const entradasPorConta = new Map<string, number>();
  const saidasPorConta = new Map<string, number>();

  // SOMA, não `set`: desde que a transferência entrou na RPC, a mesma conta
  // pode chegar em duas linhas do mesmo lado (a_receber e transferencia_entrada
  // são as duas entradas). Sobrescrever descartaria uma delas em silêncio.
  function acumular(mapa: Map<string, number>, chave: string, valor: number) {
    mapa.set(chave, (mapa.get(chave) ?? 0) + valor);
  }

  for (const movimento of movimentos ?? []) {
    const centavos = paraCentavos(movimento.total);
    const entra =
      movimento.tipo === "a_receber" ||
      movimento.tipo === "transferencia_entrada";
    acumular(
      entra ? entradasPorConta : saidasPorConta,
      movimento.conta_bancaria_id,
      centavos,
    );
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
      saldoInicialData: conta.saldo_inicial_data,
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
): Promise<Map<string, string>> {
  if (centroIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_rel_custo_centro_vida", {
    p_centros: centroIds,
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
 * Só os centros de custo RAIZ ativos, em ordem de código.
 *
 * É a lista dos FILTROS de relatório, e ela é diferente da lista do rateio de
 * propósito. O rateio precisa de todos os níveis, porque o custo é apontado na
 * etapa; mas todo relatório de centro agrupa na RAIZ, subindo a árvore antes de
 * somar.
 *
 * ## Por que ela só oferecia raiz até 27/08/2026, e por que voltou a oferecer etapa
 *
 * Oferecer etapa num filtro que agrupa na raiz mente na tela. Medido em
 * 24/08/2026: o cadastro tem 12 raízes ativas e 61 etapas (um equipamento cada,
 * todas sob "Manutenção/Documentação de Equipamentos"), então o seletor mostrava
 * 73 opções -- e escolher "CAMINHÃO BOIADEIRO/MIILHO - L1620" devolvia uma linha
 * chamada "Manutenção/Documentação de Equipamentos", com R$ 1.757,95. Sessenta e
 * uma opções diferentes voltavam vestindo o mesmo nome. Tirar a opção foi o certo:
 * melhor não oferecer do que devolver número com nome errado.
 *
 * O que mudou em 27/08/2026 foi a CAUSA, não a decisão: a `fn_rel_custo_receita`
 * passou a agrupar pelo centro ESCOLHIDO, e não pela raiz. Escolher uma etapa
 * agora devolve uma linha com o nome DELA e o valor DELA -- há prova disso dentro
 * da migration `20260827180000`, que aborta se a etapa voltar vestindo o nome do
 * pai. Com a causa resolvida, a etapa volta ao seletor, que era o pedido dele.
 *
 * O rótulo da etapa carrega o pai ("Empréstimos › Caixa - SIEMP"): sem isso, duas
 * etapas de pais diferentes com nome parecido ficam indistinguíveis numa lista de
 * 73 linhas.
 *
 * O centro de tipo `financeiro` NÃO entra: desde 27/08/2026 o empréstimo saiu dos
 * relatórios operacionais e a análise dele vive em Créditos, então oferecê-lo aqui
 * seria oferecer um filtro que sempre devolve vazio.
 */
export async function listarCentrosCustoRaiz(): Promise<CentroCustoOpcao[]> {
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
  const nomePorId = new Map(linhas.map((centro) => [centro.id, centro.nome]));
  // O tipo mora na RAIZ (etapa tem tipo nulo), então para saber se uma etapa é de
  // centro financeiro eu tenho de olhar o pai dela.
  const tipoPorId = new Map(linhas.map((centro) => [centro.id, centro.tipo]));

  return linhas
    .filter((centro) => {
      const tipoDaRaiz = centro.pai_id
        ? tipoPorId.get(centro.pai_id)
        : centro.tipo;
      return tipoDaRaiz !== "financeiro";
    })
    .map((centro) => ({
      id: centro.id,
      // A etapa vai rotulada com o pai. Numa lista de 73 opções, "Contrato
      // 28102020" sozinho não diz de quem é.
      nome: centro.pai_id
        ? `${nomePorId.get(centro.pai_id) ?? "?"} › ${centro.nome}`
        : centro.nome,
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
}: {
  /** yyyy-MM. Lista vazia devolve nada, sem ir ao banco. */
  meses: readonly string[];
  centrosCusto?: readonly string[];
  centrosReceita?: readonly string[];
}): Promise<LinhaCustoReceita[]> {
  if (meses.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_rel_custo_receita", {
    // A coluna é `date` no dia 1: o mês da tela vira a data que a RPC compara.
    p_meses: meses.map((mes) => `${mes}-01`),
    p_centros_custo: centrosCusto ? [...centrosCusto] : undefined,
    p_centros_receita: centrosReceita ? [...centrosReceita] : undefined,
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

/** Mês corrente "YYYY-MM" no fuso de Rio Branco, default do seletor do DRE. */
export function mesCorrente(): string {
  return dataHojeISO().slice(0, 7);
}

// =====================================================================
// 7. Custo por grupo de insumo (drill-down grupo -> subcategoria -> insumo)
// =====================================================================

export interface CustoSubcategoria {
  categoriaId: string;
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
}

export interface CustoPorGrupo {
  grupos: CustoGrupo[];
  total: number;
}

/**
 * Custo por grupo de insumo no mês de referência, com as subcategorias de cada
 * grupo já carregadas (nível 3, o insumo, vem por ação sob demanda).
 *
 * A dimensão de insumo existe nos itens da OC, não no rateio, então lançamento
 * avulso entra na linha "Sem insumo": é isso que faz a soma por grupo fechar com
 * o custo total do mês.
 */
export async function custoPorGrupo(
  periodo?: { inicio: string; fim: string },
): Promise<CustoPorGrupo> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("fn_rel_custo_por_grupo", {
    p_inicio: periodo?.inicio,
    p_fim: periodo?.fim,
  });

  if (error) {
    throw new Error("Não foi possível carregar o custo por grupo");
  }

  const linhas = data ?? [];

  const subcategorias = await Promise.all(
    linhas.map(async (linha) => {
      if (!linha.grupo_id) return [] as CustoSubcategoria[];
      const { data: subs } = await supabase.rpc(
        "fn_rel_custo_por_subcategoria",
        {
          p_grupo_id: linha.grupo_id,
          p_inicio: periodo?.inicio,
          p_fim: periodo?.fim,
        },
      );
      return (subs ?? []).map((sub) => ({
        categoriaId: sub.categoria_id,
        nome: sub.categoria_nome,
        valor: paraReais(paraCentavos(sub.total)),
      }));
    }),
  );

  const grupos: CustoGrupo[] = linhas.map((linha, indice) => ({
    grupoId: linha.grupo_id,
    nome: linha.grupo_nome,
    cor: corGrupo(linha.grupo_cor),
    valor: paraReais(paraCentavos(linha.total)),
    subcategorias: subcategorias[indice] ?? [],
  }));

  return {
    grupos,
    total: grupos.reduce((soma, grupo) => soma + grupo.valor, 0),
  };
}

/** Nível 3 do drill-down: insumos de uma subcategoria no período. */
export async function custoPorInsumo(
  categoriaId: string,
  periodo?: { inicio: string; fim: string },
): Promise<{ nome: string; quantidade: number; valor: number }[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("fn_rel_custo_por_insumo", {
    p_categoria_id: categoriaId,
    p_inicio: periodo?.inicio,
    p_fim: periodo?.fim,
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

// ---------------------------------------------------------------------------
// Créditos
// ---------------------------------------------------------------------------

/** Quantos meses o corte "o que vence pela frente" enxerga. */
const MESES_DOS_CREDITOS = 12;

/**
 * Empréstimos, financiamentos e consórcios: quanto a empresa deve e quanto
 * vence pela frente.
 *
 * Entra só o lançamento com a caixinha "É empréstimo, financiamento ou
 * consórcio" marcada. NÃO é um recorte por categoria nem por centro de custo,
 * de propósito: o financiamento de uma escavadeira é custo de equipamento e
 * continua lá para o DRE e para o custo por centro. A marca é uma dimensão à
 * parte, que responde a pergunta que nenhuma das duas respondia.
 *
 * O saldo devedor é a soma das PARCELAS EM ABERTO, não um campo: um
 * financiamento de 57 parcelas com 3 pagas deve o que falta, não o contratado.
 * Por isso contratado menos pago não dá exatamente o saldo quando alguém pagou
 * uma parcela com juros ou desconto (o pago é o líquido, o que saiu da conta).
 *
 * As duas RPCs são SECURITY INVOKER: quem não pode ver lançamento não vê crédito
 * nenhum, e a tela vem vazia em vez de furar a permissão.
 */
/**
 * Um contrato de empréstimo do centro de custo financeiro, com as duas pernas.
 *
 * Existe porque `fn_rel_creditos` responde por LANÇAMENTO e só do lado a pagar:
 * ela mede saldo devedor, e não sabe dizer quanto entrou. A análise que o Tiago
 * pediu em 27/08/2026 ("fazer toda a analise do cc de emprestimo dentro do
 * relatorio de credito") precisa das duas, e o que casa uma com a outra é a
 * ETAPA: desde 26/08 cada contrato tem a sua.
 */
export interface EmprestimoContrato {
  centroCustoId: string;
  contrato: string;
  /** Quanto o banco liberou: a entrada de dinheiro lançada nesta etapa. */
  tomado: number;
  /** Quanto já foi amortizado, pelo líquido das parcelas pagas. */
  pago: number;
  /** O que falta pagar: soma das parcelas ainda não pagas. */
  aPagar: number;
  parcelas: number;
  parcelasPagas: number;
  proximoVencimento: string | null;
}

export interface EmprestimosPorContrato {
  contratos: EmprestimoContrato[];
  totalTomado: number;
  totalPago: number;
  totalAPagar: number;
}

/**
 * Os contratos do centro de Empréstimos, um por etapa.
 *
 * Os totais somam em CENTAVOS inteiros, como todo o resto deste módulo: somar
 * reais em ponto flutuante sobre várias linhas acumula resto, e aí o total do
 * cartão deixa de bater com a tabela por um centavo.
 *
 * Note que `tomado` e `pago` NÃO se comparam diretamente: hoje três contratos têm
 * a entrada registrada e nenhuma prestação lançada, e outros três o contrário --
 * as prestações antigas estão nos extratos e ainda não entraram no ERP. A tela
 * mostra as duas colunas lado a lado justamente para essa lacuna ficar visível em
 * vez de virar um "saldo" que ninguém sabe de onde veio.
 */
export async function emprestimosPorContrato(): Promise<EmprestimosPorContrato> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_rel_emprestimos_por_contrato");

  if (error) {
    throw new Error("Não foi possível carregar os contratos de empréstimo");
  }

  const contratos = (data ?? []).map((linha) => ({
    centroCustoId: linha.centro_custo_id,
    contrato: linha.contrato,
    tomado: paraReais(paraCentavos(linha.tomado)),
    pago: paraReais(paraCentavos(linha.pago)),
    aPagar: paraReais(paraCentavos(linha.a_pagar)),
    parcelas: linha.parcelas,
    parcelasPagas: linha.parcelas_pagas,
    proximoVencimento: linha.proximo_vencimento ?? null,
  }));

  const somar = (campo: "tomado" | "pago" | "aPagar") =>
    paraReais(
      contratos.reduce((soma, c) => soma + paraCentavos(c[campo]), 0),
    );

  return {
    contratos,
    totalTomado: somar("tomado"),
    totalPago: somar("pago"),
    totalAPagar: somar("aPagar"),
  };
}

export async function creditos(): Promise<Creditos> {
  const supabase = await createClient();

  const [contratosRpc, mesesRpc] = await Promise.all([
    supabase.rpc("fn_rel_creditos"),
    supabase.rpc("fn_rel_creditos_por_mes", {
      p_meses: MESES_DOS_CREDITOS,
    }),
  ]);

  if (contratosRpc.error) {
    throw new Error("Não foi possível carregar os créditos");
  }
  if (mesesRpc.error) {
    throw new Error("Não foi possível carregar os vencimentos dos créditos");
  }

  return montarCreditos(contratosRpc.data ?? [], mesesRpc.data ?? []);
}
