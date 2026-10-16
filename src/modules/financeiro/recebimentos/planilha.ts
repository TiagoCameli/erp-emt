import ExcelJS from "exceljs";

import { EMPRESA } from "@/config/marca";
import { formatarMesAno } from "@/lib/formatadores";
import {
  SEM_CENTRO_DE_CUSTO,
  STATUS_PARCELA,
  type StatusParcela,
} from "@/modules/financeiro/_shared/formato";
import { dataParaCelula } from "@/modules/financeiro/lancamentos/planilha";
import {
  aplicarTrocas,
  escreverAbaRateada,
  expandirPorRateio,
  raizesDoRateio,
  soNaPrimeira,
  type ColunaPlanilhaRateada,
  type FormatoPlanilhaPagamentos,
  type LinhaRateada,
  type RateioDoPagamento,
} from "@/modules/financeiro/pagamentos/planilha";

/**
 * A planilha de Recebimentos: o espelho da de Pagamentos, com o dinheiro
 * entrando em vez de saindo.
 *
 * Os mesmos três formatos e as mesmas duas abas ("A receber" e "Recebidos"),
 * porque a tela é o espelho da de Pagamentos e quem exporta faz a mesma
 * pergunta dos dois lados: quanto já entrou e quanto ainda entra, por obra. A
 * repartição entre centros, a troca de colunas por formato e a escrita da aba
 * são as de `pagamentos/planilha.ts`, importadas e não copiadas — é ali que mora
 * a parte que perde centavo, e duas cópias divergiriam na primeira correção.
 *
 * O que muda é só o que cada coluna diz: quem PAGA é o cliente, a conta é a de
 * DESTINO, e não há forma de pagamento, origem nem data autorizada (recebimento
 * não passa por aprovação).
 *
 * **Módulo de servidor**: puxa o exceljs; nunca importar de Client Component.
 */

/** Qual das duas abas da tela a linha veio. */
export type AbaRecebimentos = "a-receber" | "recebidos";

/** Os mesmos três formatos de Pagamentos (ver `FormatoPlanilhaPagamentos`). */
export type FormatoPlanilhaRecebimentos = FormatoPlanilhaPagamentos;

/** A parcela a receber (ou recebida) como a planilha precisa dela. */
export interface RecebimentoPlanilha {
  id: string;
  lancamentoNumero: string | null;
  /** Nota, medição ou contrato. */
  numeroDocumento: string | null;
  numeroParcela: number;
  /** Quantas parcelas o lançamento tem, para a célula sair "3/10". */
  totalParcelas: number | null;
  descricao: string;
  categoriaNome: string | null;
  /** Quem está pagando. */
  clienteNome: string;
  /** yyyy-MM-dd (primeiro dia do mês de referência). */
  mesCompetencia: string | null;
  dataVencimento: string | null;
  /** Quando entrou na conta. Só a aba "Recebidos" mostra. */
  dataRecebimento: string | null;
  /** A conta em que o dinheiro entra (ou entrou). */
  contaNome: string | null;
  status: string;
  /** Valor devido da parcela. Desconto e juros não o reescrevem. */
  valor: number;
  desconto: number;
  juros: number;
  /** O que ENTROU na conta: a coluna calculada do banco. */
  valorLiquido: number;
  rateios: RateioDoPagamento[];
}

/** Uma linha da planilha: o recebimento mais o destino e a fatia dele. */
export type LinhaRecebimento = LinhaRateada<RecebimentoPlanilha>;

type ColunaRecebimentos = ColunaPlanilhaRateada<LinhaRecebimento>;

/**
 * O que se reparte entre os centros: o devido na fila, o LÍQUIDO nos recebidos.
 * Mesmo motivo de `valorBaseDoPagamento`: desconto e juros mudam o que a conta
 * recebeu, e ratear o bruto poria na obra um dinheiro que nunca entrou.
 */
export function valorBaseDoRecebimento(
  recebimento: RecebimentoPlanilha,
  aba: AbaRecebimentos,
): number {
  return aba === "recebidos" ? recebimento.valorLiquido : recebimento.valor;
}

/** Abre cada recebimento nas linhas do formato pedido (ver `expandirPorRateio`). */
export function expandirRecebimentos(
  itens: readonly RecebimentoPlanilha[],
  formato: FormatoPlanilhaRecebimentos,
  aba: AbaRecebimentos,
): LinhaRecebimento[] {
  return expandirPorRateio(itens, formato, (recebimento) =>
    valorBaseDoRecebimento(recebimento, aba),
  );
}

/** Rótulo da situação da parcela, o mesmo que o selo da tela mostra. */
function rotuloSituacao(status: string): string {
  return status in STATUS_PARCELA
    ? STATUS_PARCELA[status as StatusParcela].rotulo
    : status;
}

/** As colunas comuns às duas abas, na ordem em que saem no arquivo. */
function colunasComuns(): ColunaRecebimentos[] {
  return [
    {
      cabecalho: "Lançamento",
      largura: 16,
      tipo: "texto",
      celula: (l) => l.item.lancamentoNumero ?? "",
    },
    {
      cabecalho: "Nº do documento",
      largura: 16,
      tipo: "texto",
      celula: (l) => l.item.numeroDocumento ?? "",
    },
    {
      cabecalho: "Parcela",
      largura: 10,
      tipo: "texto",
      celula: (l) =>
        l.item.totalParcelas
          ? `${l.item.numeroParcela}/${l.item.totalParcelas}`
          : `${l.item.numeroParcela}`,
    },
    {
      cabecalho: "Cliente",
      largura: 32,
      tipo: "texto",
      celula: (l) => l.item.clienteNome,
    },
    {
      cabecalho: "Descrição",
      largura: 46,
      tipo: "texto",
      celula: (l) => l.item.descricao,
    },
    {
      cabecalho: "Categoria",
      largura: 26,
      tipo: "texto",
      celula: (l) => l.item.categoriaNome ?? "",
    },
    {
      cabecalho: "Mês de referência",
      largura: 16,
      tipo: "texto",
      celula: (l) => formatarMesAno(l.item.mesCompetencia),
    },
    {
      cabecalho: "Vencimento",
      largura: 13,
      tipo: "data",
      celula: (l) => dataParaCelula(l.item.dataVencimento),
    },
    {
      cabecalho: "Conta bancária",
      largura: 24,
      tipo: "texto",
      celula: (l) => l.item.contaNome ?? "",
    },
    {
      cabecalho: "Centro de custo",
      largura: 34,
      tipo: "texto",
      celula: (l) => {
        const raizes = raizesDoRateio(l.item);
        if (raizes.length === 0) return SEM_CENTRO_DE_CUSTO;
        if (raizes.length === 1) return raizes[0];
        return `${raizes.length} centros de custo`;
      },
    },
    {
      cabecalho: "Centros do rateio",
      largura: 44,
      tipo: "texto",
      celula: (l) => raizesDoRateio(l.item).join(", "),
    },
  ];
}

/** As colunas de dinheiro e data que só uma das abas tem. */
function colunasDaAba(aba: AbaRecebimentos): ColunaRecebimentos[] {
  if (aba === "recebidos") {
    return [
      {
        cabecalho: "Data do recebimento",
        largura: 17,
        tipo: "data",
        celula: (l) => dataParaCelula(l.item.dataRecebimento),
      },
      {
        cabecalho: "Valor da parcela",
        largura: 16,
        tipo: "dinheiro",
        celula: (l) => l.item.valor,
      },
      {
        cabecalho: "Desconto",
        largura: 13,
        tipo: "dinheiro",
        celula: (l) => l.item.desconto,
      },
      {
        cabecalho: "Juros e multa",
        largura: 14,
        tipo: "dinheiro",
        celula: (l) => l.item.juros,
      },
      {
        cabecalho: "Valor recebido",
        largura: 16,
        tipo: "dinheiro",
        // O que entrou na conta. No formato por recebimento a fatia É o
        // líquido inteiro, então a mesma expressão serve para os dois.
        celula: (l) => l.valorFatia,
      },
    ];
  }

  return [
    {
      cabecalho: "Situação",
      largura: 14,
      tipo: "texto",
      celula: (l) => rotuloSituacao(l.item.status),
    },
    {
      cabecalho: "Valor a receber",
      largura: 18,
      tipo: "dinheiro",
      celula: (l) => l.valorFatia,
    },
  ];
}

/**
 * As colunas que mudam nos formatos por centro e por rateio. Mesma regra de
 * Pagamentos: a coluna que SOMA é a fatia, e o valor da parcela vai só na
 * primeira linha dela — repetido, inflaria o total em N vezes.
 */
function colunasTrocadas(
  aba: AbaRecebimentos,
  comEtapa: boolean,
): Record<string, ColunaRecebimentos[]> {
  const base = colunasDaAba(aba);
  const daAba = (cabecalho: string): ColunaRecebimentos => {
    const coluna = base.find((c) => c.cabecalho === cabecalho);
    if (!coluna) {
      throw new Error(
        `A planilha de recebimentos troca a coluna "${cabecalho}", que não existe na aba "${aba}"`,
      );
    }
    return coluna;
  };

  const trocas: Record<string, ColunaRecebimentos[]> = {
    "Centro de custo": [
      {
        cabecalho: "Centro de custo",
        largura: 34,
        tipo: "texto",
        // Sempre a RAIZ, mesmo quando o rateio foi para uma etapa.
        celula: (l) => l.centroNome,
      },
    ],
    "Centros do rateio": comEtapa
      ? [
          {
            cabecalho: "Etapa",
            largura: 34,
            tipo: "texto",
            celula: (l) => l.etapaNome,
          },
        ]
      : [],
  };

  if (aba === "recebidos") {
    trocas["Valor recebido"] = [
      {
        cabecalho: "Recebido no centro",
        largura: 18,
        tipo: "dinheiro",
        celula: (l) => l.valorFatia,
      },
      soNaPrimeira({
        ...daAba("Valor recebido"),
        celula: (l) => l.item.valorLiquido,
      }),
    ];
    // Desconto e juros são da PARCELA, não do centro.
    for (const cabecalho of ["Valor da parcela", "Desconto", "Juros e multa"]) {
      trocas[cabecalho] = [soNaPrimeira(daAba(cabecalho))];
    }
  } else {
    trocas["Valor a receber"] = [
      {
        cabecalho: "A receber no centro",
        largura: 18,
        tipo: "dinheiro",
        celula: (l) => l.valorFatia,
      },
      soNaPrimeira({
        ...daAba("Valor a receber"),
        celula: (l) => l.item.valor,
      }),
    ];
  }

  return trocas;
}

/** As colunas da planilha, para uma aba e um formato. */
export function colunasRecebimentos(
  aba: AbaRecebimentos,
  formato: FormatoPlanilhaRecebimentos,
): ColunaRecebimentos[] {
  const basicas = [...colunasComuns(), ...colunasDaAba(aba)];
  if (formato === "pagamento") return basicas;
  return aplicarTrocas(
    basicas,
    colunasTrocadas(aba, formato === "rateio"),
    "A planilha de recebimentos",
  );
}

/** Cabeçalhos da planilha, na ordem das colunas. */
export function cabecalhosRecebimentos(
  aba: AbaRecebimentos,
  formato: FormatoPlanilhaRecebimentos,
): string[] {
  return colunasRecebimentos(aba, formato).map((coluna) => coluna.cabecalho);
}

/** Nome do arquivo, com o formato no nome pelo mesmo motivo de Pagamentos. */
export function nomeArquivoPlanilhaRecebimentos(
  dataISO: string,
  formato: FormatoPlanilhaRecebimentos,
): string {
  const sufixo =
    formato === "centro"
      ? "-por-centro-de-custo"
      : formato === "rateio"
        ? "-por-rateio"
        : "";
  return `recebimentos${sufixo}-${dataISO}.xlsx`;
}

const NOME_DA_ABA: Record<AbaRecebimentos, string> = {
  "a-receber": "A receber",
  recebidos: "Recebidos",
};

const TITULO_DA_ABA: Record<AbaRecebimentos, string> = {
  "a-receber": "Recebimentos a receber",
  recebidos: "Recebimentos realizados",
};

function escreverAba(
  workbook: ExcelJS.Workbook,
  aba: AbaRecebimentos,
  formato: FormatoPlanilhaRecebimentos,
  itens: readonly RecebimentoPlanilha[],
): void {
  const linhas = expandirRecebimentos(itens, formato, aba);
  escreverAbaRateada(workbook, {
    nome: NOME_DA_ABA[aba],
    titulo: TITULO_DA_ABA[aba],
    colunas: colunasRecebimentos(aba, formato),
    linhas,
    rotuloTotal:
      formato === "pagamento"
        ? `Total (${linhas.length.toLocaleString("pt-BR")} recebimentos)`
        : `Total (${linhas.length.toLocaleString("pt-BR")} linhas de ${itens.length.toLocaleString("pt-BR")} recebimentos)`,
  });
}

/**
 * Monta o .xlsx com as DUAS abas, "A receber" e "Recebidos", cada uma com os
 * filtros da sua aba na tela. Aba sem linha continua no arquivo, com cabeçalho:
 * hoje a fila a receber pode estar vazia, e sumir com a aba faria parecer que a
 * exportação saiu errada.
 */
export function montarPlanilhaRecebimentos({
  aReceber,
  recebidos,
  formato,
}: {
  aReceber: readonly RecebimentoPlanilha[];
  recebidos: readonly RecebimentoPlanilha[];
  formato: FormatoPlanilhaRecebimentos;
}): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ERP EMT";
  workbook.company = EMPRESA.razaoSocial;

  escreverAba(workbook, "a-receber", formato, aReceber);
  escreverAba(workbook, "recebidos", formato, recebidos);

  return workbook;
}
