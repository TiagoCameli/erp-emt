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
  type LinhaFaixaPrazo,
  type PontoMes,
} from "@/modules/gestao/calculo";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import { centrosEfetivos } from "@/modules/_shared/centro-custo/filtro";
import type { FiltrosPainel } from "@/modules/gestao/filtros";

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
 * uma por mês, uma por centro de custo, uma por grupo ou uma por faixa de
 * vencimento. Nenhuma delas devolve uma linha por documento ou por data, que é
 * o que faz o número de linhas crescer com o tamanho da empresa: essa é a regra
 * para qualquer RPC nova daqui.
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

// =====================================================================
// Da URL para o banco
// =====================================================================

/**
 * Os filtros do painel já traduzidos para o que o banco entende.
 *
 * A tradução é feita UMA vez, na página, e passada para todos os blocos. Traduzir
 * dentro de cada consulta faria cada uma reler o cadastro de centros e — pior —
 * abriria a porta para duas delas divergirem no dia em que alguém mexesse numa
 * só. O painel inteiro tem que falar do mesmo conjunto.
 */
export interface FiltrosDoBanco {
  /** Janela de competência: a mesma para todos os cortes de custo. */
  janela: JanelaPainel;
  /**
   * O que vai em `p_centros`: para cada raiz escolhida, ela mesma OU as etapas
   * dela que foram escolhidas. Vazio = todos.
   *
   * Cada id vale pela SUBÁRVORE dele dentro das `fn_rel_*`, que expandem no
   * banco. Por isso a lista aqui é curta: são os nós escolhidos, não a árvore.
   */
  centros: string[];
  categorias: string[];
}

/**
 * Traduz o par raiz/etapa da URL no que o banco recebe.
 *
 * `centros` vem vazio quando o cadastro não pôde ser lido: sem ele não dá para
 * saber de que raiz cada etapa é, e `centrosEfetivos` devolveria vazio — que
 * significa "todos" e faria o painel mostrar a empresa inteira com a barra de
 * filtros dizendo o contrário. Nesse caso valem as raízes cruas da URL, que é o
 * recorte mais próximo do pedido que ainda dá para honrar.
 */
export function filtrosDoBanco(
  filtros: FiltrosPainel,
  centros: readonly CentroCustoOpcao[],
): FiltrosDoBanco {
  const efetivos =
    centros.length === 0
      ? [...filtros.centroIds]
      : centrosEfetivos(centros, filtros.centroIds, filtros.etapaIds);

  return {
    janela: filtros.janela,
    centros: efetivos,
    categorias: [...filtros.categoriaIds],
  };
}

/**
 * Uma lista de ids para o parâmetro da RPC, ou `undefined` para o "todos".
 *
 * `undefined` e não array vazio: o supabase-js OMITE a chave `undefined` do
 * corpo, e aí o PostgREST resolve pelo DEFAULT da função. Mandar `[]` também
 * funcionaria hoje (as funções tratam `cardinality = 0` como todos), mas depender
 * disso amarra a tela a um detalhe do corpo das funções.
 */
function listaOuTodos(ids: readonly string[]): string[] | undefined {
  return ids.length === 0 ? undefined : [...ids];
}

/** Opção de um seletor da barra de filtros do painel. */
export interface OpcaoPainel {
  id: string;
  nome: string;
}

/**
 * Opções dos filtros do painel: centros de custo (raízes e etapas) e categorias
 * financeiras, só as ativas.
 *
 * Traz os DOIS níveis desde 29/08/2026, porque o filtro virou a escada de
 * `_shared/centro-custo/filtro.ts`: a raiz num campo, a etapa dela no campo ao
 * lado quando existe. Antes vinha só o nível 1, e escolher a manutenção somava
 * as 64 máquinas sem jeito de olhar uma.
 *
 * As RPCs do painel agrupam pelo centro escolhido mais fundo, então elas já
 * aceitam receber o id de uma etapa; nada muda no banco.
 */
export async function opcoesDoPainel(): Promise<{
  centros: CentroCustoOpcao[];
  categorias: OpcaoPainel[];
}> {
  const supabase = await createClient();

  const [centros, categorias] = await Promise.all([
    supabase
      .from("centros_custo")
      .select("id, nome, codigo, pai_id, tipo")
      // Sem corte de nível: o cadastro inteiro. Os dois campos da escada já
      // ignoram o que estiver mais fundo (o segundo só oferece filho de raiz),
      // então cortar em 2 não mudava a TELA -- mudava a expansão da subárvore
      // em `filtrosDoBanco`, que passaria a não enxergar um nível 3 e a somar
      // menos do que o filtro pediu, calado. Hoje o cadastro tem 17 raízes e 90
      // etapas, e nenhum nível 3.
      .eq("ativo", true)
      .order("codigo", { ascending: true, nullsFirst: false })
      .order("nome"),
    supabase
      .from("categorias_financeiras")
      .select("id, nome")
      .eq("ativo", true)
      .order("nome"),
  ]);

  if (centros.error || categorias.error) {
    throw new Error("Não foi possível carregar as opções dos filtros");
  }

  return {
    centros: (centros.data ?? []).map((centro) => ({
      id: centro.id,
      nome: centro.nome,
      codigo: centro.codigo,
      paiId: centro.pai_id,
      tipo: centro.tipo,
    })),
    categorias: (categorias.data ?? []).map((categoria) => ({
      id: categoria.id,
      nome: categoria.nome,
    })),
  };
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
export async function custoPorMes(
  filtros: FiltrosDoBanco,
): Promise<CustoPorMes> {
  const supabase = await createClient();
  const { janela } = filtros;

  // Manda o período explícito em vez de `p_meses`: com a janela escolhida na
  // tela, contar meses para trás do mês corrente não serve mais. `p_meses` fica
  // como o padrão da função para quem chamar sem período.
  const { data, error } = await supabase.rpc("fn_rel_custo_por_mes", {
    p_inicio: janela.inicio,
    p_fim: janela.fim,
    p_centros: listaOuTodos(filtros.centros),
    p_categorias: listaOuTodos(filtros.categorias),
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
export async function custoPorCentroCusto(
  filtros: FiltrosDoBanco,
): Promise<CustoPorCentro> {
  const supabase = await createClient();
  const { janela } = filtros;

  // ARRAY, e não escalar. `fn_rel_custo_centro_custo` perdeu a sobrecarga de um
  // centro só quando as duas viraram uma função com `p_centros`/`p_categorias`
  // (migration 20260814150000), e esta chamada ficou para trás com os nomes
  // antigos. Passava despercebido porque o supabase-js OMITE chave `undefined`
  // do corpo: sem filtro escolhido, o PostgREST recebia só o período e resolvia
  // pelos defaults. Bastava escolher uma obra para os nomes inexistentes irem
  // junto, a função não ser encontrada e o card virar um travessão — que foi o
  // que a tela fez até 28/08/2026, com o gráfico ao lado vazio.
  //
  // O `tsc` não pega: `supabase.rpc` aceita chave que não existe na assinatura
  // sem reclamar (`database.types.ts` também está atrasado nesta família).
  const { data, error } = await supabase.rpc("fn_rel_custo_centro_custo", {
    p_inicio: janela.inicio,
    p_fim: janela.fim,
    p_centros: listaOuTodos(filtros.centros),
    p_categorias: listaOuTodos(filtros.categorias),
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
export async function custoPorGrupo(
  filtros: FiltrosDoBanco,
): Promise<CustoPorGrupo> {
  const supabase = await createClient();
  const { janela } = filtros;

  const { data, error } = await supabase.rpc("fn_rel_custo_por_grupo", {
    p_inicio: janela.inicio,
    p_fim: janela.fim,
    p_centros: listaOuTodos(filtros.centros),
    p_categorias: listaOuTodos(filtros.categorias),
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
 *
 * A faixa vem pronta do banco (coluna faixa_prazo), uma linha por faixa. Antes
 * a RPC devolvia uma linha por data de vencimento e o prazo era calculado aqui:
 * bastaria a EMT ter mais de mil datas distintas em aberto para o teto do
 * PostgREST cortar o resto e o gráfico mostrar menos dívida do que existe.
 */
export async function aPagarPorVencimento(): Promise<APagarPorVencimento> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("fn_rel_aging", {
    p_hoje: dataHojeISO(),
  });

  if (error) {
    throw new Error("Não foi possível carregar os vencimentos a pagar");
  }

  const linhas: LinhaFaixaPrazo[] = (data ?? [])
    .filter((linha) => linha.tipo !== "a_receber")
    .map((linha) => ({ faixa: linha.faixa_prazo, valor: linha.total }));

  const faixas = agregarPorPrazo(linhas);
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
  /** O valor rateado no recorte: o documento inteiro quando nada está filtrado. */
  valor: number;
  /** Em quantos centros de custo do recorte o documento caiu. */
  centros: number;
}

/**
 * Os maiores lançamentos a pagar do período, por valor, já somados e cortados
 * no banco.
 *
 * Com centro de custo escolhido a pergunta muda: não é "o maior lançamento", é
 * "o maior custo NESTES centros", e o valor exibido é a fatia que caiu neles. Um
 * documento de R$ 300 mil rateado 10% aqui pesa menos que um de R$ 50 mil
 * inteiro.
 *
 * Era leitura crua até 01/09/2026, e não dava para continuar assim com a escolha
 * múltipla: documento rateado entre duas obras filtradas rendia DUAS linhas de
 * meio valor cada, e o `.limit(8)` cortava antes de qualquer soma. Ver
 * `fn_rel_gestao_maiores_custos`.
 */
export async function maioresCustos(
  filtros: FiltrosDoBanco,
): Promise<MaiorCusto[]> {
  const supabase = await createClient();
  const { janela } = filtros;

  const { data, error } = await supabase.rpc("fn_rel_gestao_maiores_custos", {
    p_inicio: janela.inicio,
    p_fim: janela.fim,
    p_centros: listaOuTodos(filtros.centros),
    p_categorias: listaOuTodos(filtros.categorias),
    p_limite: MAX_MAIORES_CUSTOS,
  });

  if (error) {
    throw new Error("Não foi possível carregar os maiores custos");
  }

  return (data ?? []).map((linha) => ({
    id: linha.lancamento_id,
    numero: linha.numero,
    descricao: linha.descricao,
    fornecedor: linha.fornecedor,
    mesCompetencia: linha.mes_competencia,
    dataVencimento: linha.data_vencimento,
    valor: emReais(linha.valor),
    centros: linha.centros ?? 1,
  }));
}

// =====================================================================
// Maiores fornecedores do período (com quem a empresa gasta)
// =====================================================================

/** Barras que cabem no bloco; o excedente vem somado numa linha "Outros". */
const MAX_FORNECEDORES = 8;

export interface FornecedorDoPeriodo {
  id: string | null;
  nome: string;
  /** `fornecedor`, `sem_fornecedor` ou `outros`. */
  tipo: "fornecedor" | "sem_fornecedor" | "outros";
  total: number;
  /** A parte que já saiu do caixa. */
  pago: number;
  /** A parte que ainda vai sair. `pago + aberto = total`, sempre. */
  aberto: number;
  lancamentos: number;
  /** Quantos fornecedores a linha representa (1, ou o tamanho da cauda). */
  fornecedores: number;
}

export interface MaioresFornecedores {
  linhas: FornecedorDoPeriodo[];
  total: number;
  pago: number;
  aberto: number;
}

/**
 * Com quem a empresa gastou no período, maiores primeiro, cada um dividido entre
 * o que já foi pago e o que ainda está em aberto.
 *
 * Soma o RATEIO, então este bloco fecha ao centavo com o custo do período do
 * resto do painel (conferido em 01/09/2026: R$ 40.239.183,56 nos dois, e
 * R$ 1.531.625,88 com uma obra escolhida). Com centro filtrado, o valor de cada
 * fornecedor é a FATIA que caiu naquele centro.
 *
 * Pago x aberto sai da fração paga das PARCELAS de cada documento, e não do
 * `status` do lançamento: o dinheiro é da parcela, e documento parcelado fica
 * meses no meio do caminho.
 *
 * O corte em oito mais "Outros" é feito no BANCO. São 962 fornecedores ativos, e
 * uma linha por fornecedor é exatamente o tipo de consulta que cresce com o
 * tamanho da empresa até bater no teto de 1000 do PostgREST — que corta sem erro
 * e faz a soma mentir para menos.
 */
export async function maioresFornecedores(
  filtros: FiltrosDoBanco,
): Promise<MaioresFornecedores> {
  const supabase = await createClient();
  const { janela } = filtros;

  const { data, error } = await supabase.rpc(
    "fn_rel_gestao_maiores_fornecedores",
    {
      p_inicio: janela.inicio,
      p_fim: janela.fim,
      p_centros: listaOuTodos(filtros.centros),
      p_categorias: listaOuTodos(filtros.categorias),
      p_limite: MAX_FORNECEDORES,
    },
  );

  if (error) {
    throw new Error("Não foi possível carregar os maiores fornecedores");
  }

  const linhas: FornecedorDoPeriodo[] = (data ?? []).map((linha) => ({
    id: linha.fornecedor_id,
    nome:
      linha.tipo_linha === "outros"
        ? `Outros (${linha.fornecedores})`
        : linha.nome,
    tipo: linha.tipo_linha as FornecedorDoPeriodo["tipo"],
    total: emReais(linha.total),
    pago: emReais(linha.pago),
    aberto: emReais(linha.aberto),
    lancamentos: linha.lancamentos ?? 0,
    fornecedores: linha.fornecedores ?? 1,
  }));

  return {
    linhas,
    total: linhas.reduce((soma, l) => soma + l.total, 0),
    pago: linhas.reduce((soma, l) => soma + l.pago, 0),
    aberto: linhas.reduce((soma, l) => soma + l.aberto, 0),
  };
}

// =====================================================================
// Receita por mês de competência
// =====================================================================

/**
 * A receita de cada mês da janela, para o gráfico de receita x despesa.
 *
 * SÓ a receita: a despesa do mesmo gráfico continua saindo de `custoPorMes`, que
 * é a fonte do cartão "Custo do mês". Duas fontes para o mesmo número na mesma
 * tela é como um cartão e o gráfico ao lado passam a discordar sem ninguém achar
 * o motivo — e as duas funções concordam hoje ao centavo (R$ 40.239.183,56 na
 * janela jan–ago/2026, medido em 01/09/2026), o que só torna a divergência
 * futura mais difícil de perceber.
 *
 * Usa `fn_rel_custo_receita`, a mesma do relatório de Custo x receita, em vez de
 * uma função nova: as regras de o que é receita foram afinadas com o dono ao
 * longo de agosto (empréstimo fora, principal de aplicação fora, receita
 * financeira fora porque juro recebido é resultado da empresa e não produção da
 * obra) e uma segunda implementação delas divergiria na primeira mudança feita
 * de um lado só.
 *
 * Ela devolve uma linha por mês, centro-RAIZ e tipo — 13 raízes com movimento,
 * então a janela de 6 meses do painel dá ~156 linhas, longe do teto de 1000 do
 * PostgREST. Somar as raízes aqui é o certo: o corte por centro já foi feito no
 * banco.
 *
 * A receita obedece ao MESMO filtro de centro de custo da despesa. Não é óbvio, e
 * é de propósito: os centros são os mesmos dos dois lados (a obra que gasta é a
 * obra que fatura), então filtrar a obra e comparar a despesa dela com a receita
 * de todas as obras desenharia uma margem inventada.
 */
export async function receitaPorMes(
  filtros: FiltrosDoBanco,
): Promise<Map<string, number>> {
  const supabase = await createClient();
  const centros = listaOuTodos(filtros.centros);

  const { data, error } = await supabase.rpc("fn_rel_custo_receita", {
    // A coluna é `date` no dia 1, e `janela.meses` já vem nesse formato.
    p_meses: [...filtros.janela.meses],
    p_centros_custo: centros,
    p_centros_receita: centros,
  });

  if (error) {
    throw new Error("Não foi possível carregar a receita do período");
  }

  const porMes = new Map<string, number>();
  for (const linha of data ?? []) {
    if (linha.tipo !== "a_receber") continue;
    const mes = linha.mes.slice(0, 10);
    porMes.set(mes, (porMes.get(mes) ?? 0) + paraReais(paraCentavos(linha.total)));
  }
  return porMes;
}
