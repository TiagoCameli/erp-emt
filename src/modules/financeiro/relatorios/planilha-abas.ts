import { formatarMesAno } from "@/lib/formatadores";
import type { CreditoContrato, Creditos } from "@/modules/financeiro/relatorios/creditos";
import type { LinhaCustoReceita } from "@/modules/financeiro/relatorios/custo-receita";
import type {
  Aging,
  CustoPorCentroCusto,
  CustoPorGrupo,
  DreGerencial,
  ExtratoPorFornecedor,
  FluxoCaixa,
  PosicaoBancaria,
} from "@/modules/financeiro/relatorios/queries";
import {
  aba,
  dataDeRelatorioParaCelula,
  type ColunaRelatorio,
  type EscritaDeAba,
} from "@/modules/financeiro/relatorios/planilha-relatorio";

/**
 * As colunas de cada um dos nove relatórios financeiros.
 *
 * Vive separado da moldura (`planilha-relatorio.ts`) e da consulta: aqui só se
 * decide O QUE vai em cada coluna, e é o único arquivo que muda quando um
 * relatório ganha campo.
 *
 * DUAS REGRAS QUE VALEM PARA TODOS:
 *
 * 1. O TÍTULO DA ABA LEVA O RECORTE. Quem recebe a planilha por e-mail não tem
 *    a tela do lado para saber se está lendo o mês, o trimestre ou a base
 *    inteira. Número certo lido no recorte errado é pior que número faltando,
 *    então o filtro aplicado vai escrito no cabeçalho do arquivo.
 *
 * 2. SÓ SOMA O QUE PODE SER SOMADO. `somar` é opt-in por coluna. Saldo não se
 *    soma (o total de uma coluna de saldos não significa nada), percentual
 *    muito menos, e "saldo inicial" de contas diferentes só soma porque a
 *    própria tela já mostra esse total.
 */

/** Percentual como FRAÇÃO, que é o que o formato do Excel espera. */
function fracao(parte: number, todo: number): number | null {
  return todo === 0 ? null : parte / todo;
}

/* ------------------------------------------------------------------ */
/* Fluxo de caixa                                                     */
/* ------------------------------------------------------------------ */

const COLUNAS_FLUXO: ColunaRelatorio<FluxoCaixa["meses"][number]>[] = [
  { cabecalho: "Mês", largura: 12, tipo: "texto", celula: (l) => l.rotulo },
  {
    cabecalho: "Entradas realizadas",
    largura: 20,
    tipo: "dinheiro",
    celula: (l) => l.entradasRealizado,
    somar: true,
  },
  {
    cabecalho: "Entradas projetadas",
    largura: 20,
    tipo: "dinheiro",
    celula: (l) => l.entradasProjetado,
    somar: true,
  },
  {
    cabecalho: "Saídas realizadas",
    largura: 19,
    tipo: "dinheiro",
    celula: (l) => l.saidasRealizado,
    somar: true,
  },
  {
    cabecalho: "Saídas projetadas",
    largura: 19,
    tipo: "dinheiro",
    celula: (l) => l.saidasProjetado,
    somar: true,
  },
  {
    cabecalho: "Saldo do mês",
    largura: 16,
    tipo: "dinheiro",
    // SOMA, e aqui isso é correto: é o líquido de cada mês, não um saldo
    // acumulado. A soma dos líquidos é o líquido do período.
    celula: (l) => l.saldo,
    somar: true,
  },
];

export function abaFluxoCaixa(dados: FluxoCaixa, recorte: string): EscritaDeAba {
  return aba({
    nome: "Fluxo de caixa",
    titulo: `Fluxo de caixa · regime de caixa · ${recorte}`,
    colunas: COLUNAS_FLUXO,
    linhas: dados.meses,
    rotuloTotal: `Total (${dados.meses.length} mês(es))`,
  });
}

/* ------------------------------------------------------------------ */
/* DRE gerencial                                                      */
/* ------------------------------------------------------------------ */

/**
 * Uma linha do DRE já achatada: o bloco e o sinal viram COLUNA.
 *
 * A tela mostra três blocos empilhados (operacional, financeiro, movimentação),
 * cada um com receitas e despesas. Numa planilha isso vira coluna, não seção:
 * seção obriga a inventar linha de título no meio dos dados e destrói o filtro
 * do Excel, que é o motivo de exportar.
 */
interface LinhaDrePlanilha {
  bloco: string;
  natureza: string;
  categoria: string;
  receita: number | null;
  despesa: number | null;
}

const COLUNAS_DRE: ColunaRelatorio<LinhaDrePlanilha>[] = [
  { cabecalho: "Bloco", largura: 16, tipo: "texto", celula: (l) => l.bloco },
  {
    cabecalho: "Natureza",
    largura: 16,
    tipo: "texto",
    celula: (l) => l.natureza,
  },
  {
    cabecalho: "Categoria",
    largura: 38,
    tipo: "texto",
    celula: (l) => l.categoria,
  },
  {
    cabecalho: "Receita",
    largura: 16,
    tipo: "dinheiro",
    celula: (l) => l.receita,
    somar: true,
  },
  {
    cabecalho: "Despesa",
    largura: 16,
    tipo: "dinheiro",
    celula: (l) => l.despesa,
    somar: true,
  },
];

export function abaDre(dados: DreGerencial, recorte: string): EscritaDeAba {
  const linhas: LinhaDrePlanilha[] = [];

  const blocos = [
    { rotulo: "Operacional", natureza: "operacional", bloco: dados.operacional },
    { rotulo: "Financeiro", natureza: "financeira", bloco: dados.financeiro },
    {
      rotulo: "Movimentação",
      natureza: "movimentacao",
      bloco: dados.movimentacao,
    },
  ];

  for (const { rotulo, natureza, bloco } of blocos) {
    for (const linha of bloco.receitas) {
      linhas.push({
        bloco: rotulo,
        natureza,
        categoria: linha.categoria,
        receita: linha.valor,
        despesa: null,
      });
    }
    for (const linha of bloco.despesas) {
      linhas.push({
        bloco: rotulo,
        natureza,
        categoria: linha.categoria,
        receita: null,
        despesa: linha.valor,
      });
    }
  }

  return aba({
    nome: "DRE",
    titulo: `DRE gerencial · regime de competência · ${recorte}`,
    colunas: COLUNAS_DRE,
    linhas,
    // O total da planilha soma OS TRÊS BLOCOS, então ele não é o "resultado" da
    // tela, que deixa a movimentação de fora de propósito. O rótulo diz isso,
    // porque a alternativa é alguém subtrair as duas colunas e achar um
    // resultado que a tela nunca mostrou.
    rotuloTotal: "Total dos três blocos (a movimentação NÃO é resultado)",
  });
}

/* ------------------------------------------------------------------ */
/* Aging                                                              */
/* ------------------------------------------------------------------ */

interface LinhaAgingPlanilha {
  rotulo: string;
  aPagar: number;
  aReceber: number;
}

const COLUNAS_AGING: ColunaRelatorio<LinhaAgingPlanilha>[] = [
  {
    cabecalho: "Faixa de vencimento",
    largura: 26,
    tipo: "texto",
    celula: (l) => l.rotulo,
  },
  {
    cabecalho: "A pagar",
    largura: 18,
    tipo: "dinheiro",
    celula: (l) => l.aPagar,
    somar: true,
  },
  {
    cabecalho: "A receber",
    largura: 18,
    tipo: "dinheiro",
    celula: (l) => l.aReceber,
    somar: true,
  },
];

export function abaAging(dados: Aging): EscritaDeAba {
  // As duas listas vêm sempre com as mesmas seis faixas, na mesma ordem
  // (`agregarAging`), então o pareamento por índice é seguro — e é o mesmo que
  // o gráfico da tela faz.
  const linhas = dados.aPagar.map((faixa, indice) => ({
    rotulo: faixa.rotulo,
    aPagar: faixa.valor,
    aReceber: dados.aReceber[indice]?.valor ?? 0,
  }));

  return aba({
    nome: "Aging",
    titulo: "Aging de vencimentos · parcelas em aberto por faixa · posição de hoje",
    colunas: COLUNAS_AGING,
    linhas,
    rotuloTotal: "Total em aberto",
  });
}

/* ------------------------------------------------------------------ */
/* Posição bancária                                                   */
/* ------------------------------------------------------------------ */

const COLUNAS_POSICAO: ColunaRelatorio<PosicaoBancaria["contas"][number]>[] = [
  { cabecalho: "Conta", largura: 30, tipo: "texto", celula: (c) => c.nome },
  { cabecalho: "Banco", largura: 18, tipo: "texto", celula: (c) => c.banco },
  {
    cabecalho: "Saldo inicial",
    largura: 18,
    tipo: "dinheiro",
    celula: (c) => c.saldoInicial,
    somar: true,
  },
  {
    // A data do extrato de onde o saldo inicial saiu. Sem ela, "Entradas" e
    // "Saídas" parecem o histórico inteiro da conta, e não são: são o
    // movimento POSTERIOR a este dia.
    cabecalho: "Saldo inicial em",
    largura: 16,
    tipo: "data",
    celula: (c) => dataDeRelatorioParaCelula(c.saldoInicialData),
  },
  {
    cabecalho: "Entradas",
    largura: 18,
    tipo: "dinheiro",
    celula: (c) => c.entradas,
    somar: true,
  },
  {
    cabecalho: "Saídas",
    largura: 18,
    tipo: "dinheiro",
    celula: (c) => c.saidas,
    somar: true,
  },
  {
    cabecalho: "Saldo atual",
    largura: 18,
    tipo: "dinheiro",
    celula: (c) => c.saldoAtual,
    somar: true,
  },
];

export function abaPosicaoBancaria(dados: PosicaoBancaria): EscritaDeAba {
  return aba({
    nome: "Posição bancária",
    titulo: "Posição bancária · saldo por conta ativa",
    colunas: COLUNAS_POSICAO,
    linhas: dados.contas,
    // As colunas Entradas e Saídas somam TRANSFERÊNCIA ENTRE CONTAS nas duas
    // pontas, então o total delas não é o que a empresa recebeu nem o que
    // pagou: é movimento, e parte dele só mudou de bolso.
    rotuloTotal: `Total (${dados.contas.length} conta(s); entradas e saídas incluem transferência entre contas)`,
  });
}

/* ------------------------------------------------------------------ */
/* Créditos                                                           */
/* ------------------------------------------------------------------ */

const COLUNAS_CREDITOS: ColunaRelatorio<CreditoContrato>[] = [
  { cabecalho: "Credor", largura: 30, tipo: "texto", celula: (c) => c.credor },
  {
    cabecalho: "Documento",
    largura: 16,
    tipo: "texto",
    celula: (c) => c.numero,
  },
  {
    cabecalho: "Contrato",
    largura: 44,
    tipo: "texto",
    celula: (c) => c.descricao,
  },
  {
    cabecalho: "Categoria",
    largura: 24,
    tipo: "texto",
    celula: (c) => c.categoria,
  },
  {
    cabecalho: "Contratado",
    largura: 18,
    tipo: "dinheiro",
    celula: (c) => c.valorContratado,
    somar: true,
  },
  {
    cabecalho: "Pago",
    largura: 18,
    tipo: "dinheiro",
    celula: (c) => c.totalPago,
    somar: true,
  },
  {
    cabecalho: "Saldo devedor",
    largura: 18,
    tipo: "dinheiro",
    celula: (c) => c.saldoDevedor,
    somar: true,
  },
  {
    cabecalho: "Parcelas",
    largura: 12,
    tipo: "texto",
    celula: (c) => `${c.parcelasPagas} de ${c.parcelas}`,
  },
  {
    cabecalho: "Próximo vencimento",
    largura: 18,
    tipo: "data",
    celula: (c) => dataDeRelatorioParaCelula(c.proximoVencimento),
  },
  {
    cabecalho: "Situação",
    largura: 12,
    tipo: "texto",
    // Quitado é NÃO TER próxima parcela, e não "saldo zero": é a mesma
    // definição que a tela usa para escrever a palavra na linha.
    celula: (c) => (c.proximoVencimento === null ? "Quitado" : "Em aberto"),
  },
];

export function abaCreditos(dados: Creditos, recorte: string): EscritaDeAba {
  return aba({
    nome: "Créditos",
    titulo: `Créditos · empréstimos e financiamentos · ${recorte}`,
    colunas: COLUNAS_CREDITOS,
    linhas: dados.contratos,
    rotuloTotal: `Total (${dados.contratos.length} contrato(s))`,
  });
}

/* ------------------------------------------------------------------ */
/* Custo por centro de custo                                          */
/* ------------------------------------------------------------------ */

export function abaCustoCc(
  dados: CustoPorCentroCusto,
  recorte: string,
): EscritaDeAba {
  const total = dados.centros.reduce((soma, c) => soma + c.valor, 0);

  const colunas: ColunaRelatorio<CustoPorCentroCusto["centros"][number]>[] = [
    {
      cabecalho: "Código",
      largura: 12,
      tipo: "texto",
      celula: (c) => c.codigo,
    },
    {
      cabecalho: "Centro de custo",
      largura: 44,
      tipo: "texto",
      celula: (c) => c.nome,
    },
    {
      cabecalho: "Custo",
      largura: 18,
      tipo: "dinheiro",
      celula: (c) => c.valor,
      somar: true,
    },
    {
      cabecalho: "Participação",
      largura: 14,
      tipo: "percentual",
      // NÃO soma: a coluna dá 100% aqui e outra coisa depois que alguém filtra.
      celula: (c) => fracao(c.valor, total),
    },
  ];

  return aba({
    nome: "Custo por centro",
    titulo: `Custo por centro de custo · regime de competência · ${recorte}`,
    colunas,
    linhas: dados.centros,
    rotuloTotal: `Total (${dados.centros.length} centro(s))`,
  });
}

/* ------------------------------------------------------------------ */
/* Custo x receita                                                    */
/* ------------------------------------------------------------------ */

const COLUNAS_CUSTO_RECEITA: ColunaRelatorio<LinhaCustoReceita>[] = [
  {
    cabecalho: "Mês",
    largura: 12,
    tipo: "texto",
    celula: (l) => formatarMesAno(`${l.mes}-01`),
  },
  {
    cabecalho: "Tipo",
    largura: 12,
    tipo: "texto",
    // `a_pagar` é o custo e `a_receber` é a receita: a coluna traz a palavra do
    // relatório, não a do banco, porque quem lê a planilha lê "Custo x receita"
    // no cabeçalho e não teria como ligar uma coisa na outra.
    celula: (l) => (l.tipo === "a_pagar" ? "Custo" : "Receita"),
  },
  { cabecalho: "Código", largura: 12, tipo: "texto", celula: (l) => l.codigo },
  {
    cabecalho: "Centro de custo",
    largura: 44,
    tipo: "texto",
    celula: (l) => l.nome,
  },
  {
    cabecalho: "Valor",
    largura: 18,
    tipo: "dinheiro",
    celula: (l) => l.total,
    somar: true,
  },
  {
    cabecalho: "Retenção",
    largura: 16,
    tipo: "dinheiro",
    // Zero no custo, por construção: retenção só existe no que a empresa
    // recebe. Vai em coluna própria porque `total` já é o LÍQUIDO.
    celula: (l) => l.retencao,
    somar: true,
  },
];

export function abaCustoReceita(
  linhas: readonly LinhaCustoReceita[],
  recorte: string,
): EscritaDeAba {
  return aba({
    nome: "Custo x receita",
    titulo: `Custo x receita por centro de custo · regime de competência · ${recorte}`,
    colunas: COLUNAS_CUSTO_RECEITA,
    linhas,
    // Uma linha por (mês, tipo, centro): somar a coluna Valor mistura custo com
    // receita, e é por isso que o rótulo avisa em vez de o total mentir.
    rotuloTotal: `Total (${linhas.length} linha(s); some por Tipo, custo e receita estão na mesma coluna)`,
  });
}

/* ------------------------------------------------------------------ */
/* Custo por grupo de insumo                                          */
/* ------------------------------------------------------------------ */

/**
 * Uma linha do drill achatada: grupo, subcategoria e insumo viram COLUNAS.
 *
 * A tela é uma árvore de três níveis. Numa planilha, árvore vira coluna: assim
 * a mesma linha serve para filtrar por grupo, por subcategoria ou por insumo, e
 * a tabela dinâmica de quem recebe monta o nível que ele quiser.
 */
interface LinhaGrupoPlanilha {
  grupo: string;
  subcategoria: string | null;
  valor: number;
}

export function abaCustoGrupo(
  dados: CustoPorGrupo,
  recorte: string,
): EscritaDeAba {
  const linhas: LinhaGrupoPlanilha[] = [];
  for (const grupo of dados.grupos) {
    if (grupo.subcategorias.length === 0) {
      linhas.push({ grupo: grupo.nome, subcategoria: null, valor: grupo.valor });
      continue;
    }
    for (const sub of grupo.subcategorias) {
      linhas.push({
        grupo: grupo.nome,
        subcategoria: sub.nome,
        valor: sub.valor,
      });
    }
  }

  const total = linhas.reduce((soma, l) => soma + l.valor, 0);

  const colunas: ColunaRelatorio<LinhaGrupoPlanilha>[] = [
    { cabecalho: "Grupo", largura: 24, tipo: "texto", celula: (l) => l.grupo },
    {
      cabecalho: "Subcategoria",
      largura: 34,
      tipo: "texto",
      celula: (l) => l.subcategoria,
    },
    {
      cabecalho: "Custo",
      largura: 18,
      tipo: "dinheiro",
      celula: (l) => l.valor,
      somar: true,
    },
    {
      cabecalho: "% do total",
      largura: 12,
      tipo: "percentual",
      celula: (l) => fracao(l.valor, total),
    },
  ];

  return aba({
    nome: "Custo por grupo",
    titulo: `Custo por grupo de insumo · regime de competência · ${recorte}`,
    colunas,
    linhas,
    rotuloTotal: `Total (${dados.grupos.length} grupo(s))`,
  });
}

/* ------------------------------------------------------------------ */
/* Extrato por fornecedor                                             */
/* ------------------------------------------------------------------ */

export function abaExtratoFornecedor(
  dados: ExtratoPorFornecedor,
  recorte: string,
): EscritaDeAba {
  const colunas: ColunaRelatorio<
    ExtratoPorFornecedor["lancamentos"][number]
  >[] = [
    {
      cabecalho: "Documento",
      largura: 16,
      tipo: "texto",
      celula: (l) => l.numero,
    },
    {
      cabecalho: "Descrição",
      largura: 50,
      tipo: "texto",
      celula: (l) => l.descricao,
    },
    {
      cabecalho: "Categoria",
      largura: 26,
      tipo: "texto",
      celula: (l) => l.categoriaNome,
    },
    {
      cabecalho: "Mês de referência",
      largura: 16,
      tipo: "texto",
      celula: (l) => formatarMesAno(l.mesCompetencia),
    },
    {
      cabecalho: "Vencimento",
      largura: 14,
      tipo: "data",
      celula: (l) => dataDeRelatorioParaCelula(l.dataVencimento),
    },
    {
      cabecalho: "Valor do documento",
      largura: 18,
      tipo: "dinheiro",
      celula: (l) => l.valor,
      somar: true,
    },
  ];

  return aba({
    nome: "Extrato",
    titulo: `Extrato por fornecedor · lançamentos a pagar · ${recorte}`,
    colunas,
    linhas: dados.lancamentos,
    rotuloTotal: `Total (${dados.lancamentos.length} lançamento(s))`,
  });
}
