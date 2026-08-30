import type { TableCell, TDocumentDefinitions } from "pdfmake/interfaces";

import { CORES_MARCA, EMPRESA } from "@/config/marca";
import { LOGO_EMT_PNG_BASE64 } from "@/config/marca-logo";
import { formatarBRL, formatarDataHora } from "@/lib/formatadores";
import { ROTULO_VINCULO, type Vinculo } from "@/modules/cadastros/colaboradores/schemas";

/**
 * O resumo da folha em PDF, para ir ANEXADO ao pedido de aprovação.
 *
 * Pedido do Tiago (29/08/2026): a mensagem que ele copia com o link também tem
 * que levar um PDF com o resumo de cada funcionário. O motivo é o mesmo que fez
 * a mensagem carregar números em vez de só o link — quem aprova R$ 173 mil
 * precisa ver de onde o número vem antes de clicar, e às vezes decide no
 * celular, longe do sistema.
 *
 * MÓDULO PURO: monta a definição do documento e não desenha nada. Quem
 * transforma isso em bytes é `src/lib/pdf.ts`. Separado assim porque a parte que
 * erra é a montagem (uma coluna somando errado, um total que não fecha), e essa
 * dá para prender com teste sem gerar PDF nenhum.
 *
 * As colunas são as que ele pediu, nesta ordem: nome, vínculo, salário,
 * gratificação, descontos, adiantamentos, custo total e líquido.
 */

/** Uma linha do resumo: o que o PDF mostra de cada pessoa. */
export interface LinhaResumo {
  colaboradorNome: string;
  colaboradorVinculo: string;
  salarioBase: number;
  gratificacao: number;
  descontos: number;
  adiantamentos: number;
  custoTotal: number;
  valorLiquido: number;
}

/** A folha, no mínimo que o resumo precisa saber. */
export interface FolhaParaResumo {
  /** Primeiro dia do mês (yyyy-MM-dd), como vem do banco. */
  competencia: string;
  /** Rótulo do status já traduzido ("Rascunho", "Pendente de aprovação"...). */
  statusRotulo: string;
  /** Vencimento escolhido para a folha (yyyy-MM-dd), ou null. */
  dataVencimento: string | null;
  itens: readonly LinhaResumo[];
}

/** As seis colunas de dinheiro do resumo, somadas. */
export interface TotaisDoResumo {
  salarioBase: number;
  gratificacao: number;
  descontos: number;
  adiantamentos: number;
  custoTotal: number;
  valorLiquido: number;
}

/**
 * Soma as colunas de dinheiro.
 *
 * Em CENTAVOS INTEIROS: somar 47 floats em reais acumula resto binário, e o
 * total do rodapé sairia com um centavo de diferença da soma que quem aprova faz
 * na calculadora — justo no documento que existe para ele conferir.
 */
export function totaisDoResumo(
  itens: readonly LinhaResumo[],
): TotaisDoResumo {
  const centavos = (valor: number) => Math.round(valor * 100);
  const zero = {
    salarioBase: 0,
    gratificacao: 0,
    descontos: 0,
    adiantamentos: 0,
    custoTotal: 0,
    valorLiquido: 0,
  };
  const soma = itens.reduce(
    (total, item) => ({
      salarioBase: total.salarioBase + centavos(item.salarioBase),
      gratificacao: total.gratificacao + centavos(item.gratificacao),
      descontos: total.descontos + centavos(item.descontos),
      adiantamentos: total.adiantamentos + centavos(item.adiantamentos),
      custoTotal: total.custoTotal + centavos(item.custoTotal),
      valorLiquido: total.valorLiquido + centavos(item.valorLiquido),
    }),
    zero,
  );
  return {
    salarioBase: soma.salarioBase / 100,
    gratificacao: soma.gratificacao / 100,
    descontos: soma.descontos / 100,
    adiantamentos: soma.adiantamentos / 100,
    custoTotal: soma.custoTotal / 100,
    valorLiquido: soma.valorLiquido / 100,
  };
}

/** Competência (yyyy-MM-dd) como MM/AAAA, sem passar por Date. */
function competenciaMesAno(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

/** Data (yyyy-MM-dd) como DD/MM/AAAA, sem passar por Date. */
function dataBR(data: string): string {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Nome do arquivo: previsível e ordenável quando vários caem na mesma pasta. */
export function nomeDoArquivo(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `folha-${ano}-${mes}.pdf`;
}

const CABECALHO = [
  "Colaborador",
  "Vínculo",
  "Salário",
  "Gratificação",
  "Descontos",
  "Adiantamentos",
  "Custo total",
  "Líquido",
] as const;

/**
 * Monta o documento.
 *
 * PAISAGEM e não retrato: são oito colunas, seis delas de dinheiro, e em
 * retrato o nome do colaborador quebraria em três linhas — a tabela viraria o
 * dobro de páginas para caber a mesma informação.
 *
 * `emitidoEm` entra por parâmetro em vez de `new Date()` aqui dentro para o
 * teste poder fixá-la: função que lê o relógio não tem saída determinística, e
 * um snapshot dela quebraria todo dia à meia-noite.
 */
export function documentoDoResumo(
  folha: FolhaParaResumo,
  emitidoEm: Date,
): TDocumentDefinitions {
  const totais = totaisDoResumo(folha.itens);
  const dinheiro = (valor: number) => ({
    text: formatarBRL(valor),
    alignment: "right" as const,
  });

  const corpo: TableCell[][] = [
    CABECALHO.map((titulo, indice) => ({
      text: titulo,
      bold: true,
      color: "#FFFFFF",
      fillColor: CORES_MARCA.asfalto,
      // As duas primeiras colunas são texto; as seis de dinheiro alinham à
      // direita, como em toda tabela de valor do app.
      alignment: indice <= 1 ? ("left" as const) : ("right" as const),
    })),
    ...folha.itens.map((item) => [
      { text: item.colaboradorNome },
      {
        text:
          ROTULO_VINCULO[item.colaboradorVinculo as Vinculo] ??
          item.colaboradorVinculo,
      },
      dinheiro(item.salarioBase),
      dinheiro(item.gratificacao),
      dinheiro(item.descontos),
      dinheiro(item.adiantamentos),
      dinheiro(item.custoTotal),
      dinheiro(item.valorLiquido),
    ]),
    [
      { text: "Total", bold: true, colSpan: 2 },
      {},
      { ...dinheiro(totais.salarioBase), bold: true },
      { ...dinheiro(totais.gratificacao), bold: true },
      { ...dinheiro(totais.descontos), bold: true },
      { ...dinheiro(totais.adiantamentos), bold: true },
      { ...dinheiro(totais.custoTotal), bold: true },
      { ...dinheiro(totais.valorLiquido), bold: true },
    ],
  ];

  const pessoas =
    folha.itens.length === 1
      ? "1 colaborador"
      : `${folha.itens.length} colaboradores`;

  return {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [28, 28, 28, 36],
    defaultStyle: { font: "Helvetica", fontSize: 8 },
    info: {
      title: `Folha ${competenciaMesAno(folha.competencia)} - ${EMPRESA.nome}`,
      author: EMPRESA.razaoSocial,
    },
    content: [
      {
        columns: [
          { image: `data:image/png;base64,${LOGO_EMT_PNG_BASE64}`, width: 86 },
          {
            stack: [
              { text: EMPRESA.razaoSocial, bold: true, fontSize: 10 },
              {
                text: `CNPJ ${EMPRESA.cnpj}`,
                fontSize: 7,
                color: CORES_MARCA.asfalto,
              },
            ],
            alignment: "right",
            margin: [0, 6, 0, 0],
          },
        ],
      },
      // A Pista: asfalto com o eixo amarelo. É a assinatura da marca, e o mesmo
      // par de faixas que a planilha exportada desenha.
      {
        margin: [0, 6, 0, 0],
        table: { widths: ["*"], body: [[""]], heights: [3] },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          fillColor: () => CORES_MARCA.asfalto,
        },
      },
      {
        table: { widths: ["*"], body: [[""]], heights: [2] },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          fillColor: () => CORES_MARCA.amarelo,
        },
      },
      {
        text: `Folha gerencial · ${competenciaMesAno(folha.competencia)}`,
        bold: true,
        fontSize: 13,
        margin: [0, 10, 0, 2],
      },
      {
        text: [
          `${folha.statusRotulo} · ${pessoas}`,
          folha.dataVencimento
            ? ` · vencimento ${dataBR(folha.dataVencimento)}`
            : "",
        ].join(""),
        fontSize: 8,
        color: CORES_MARCA.asfalto,
        margin: [0, 0, 0, 8],
      },
      {
        table: {
          headerRows: 1,
          // O nome é a coluna que precisa de espaço; as de dinheiro têm largura
          // fixa para os valores não dançarem de página para página.
          widths: ["*", 52, 58, 62, 58, 66, 62, 62],
          body: corpo,
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0,
          hLineColor: () => "#E8E6E1",
          paddingTop: () => 3,
          paddingBottom: () => 3,
        },
      },
    ],
    footer: (paginaAtual: number, totalPaginas: number) => ({
      margin: [28, 0, 28, 0],
      columns: [
        {
          text: `${EMPRESA.razaoSocial} · ${EMPRESA.endereco}`,
          fontSize: 6,
          color: CORES_MARCA.asfalto,
        },
        {
          // Emissão e paginação juntas: quem imprime precisa saber se está
          // olhando a folha inteira e de quando é o número.
          text: `Emitido em ${formatarDataHora(emitidoEm.toISOString())} · ${paginaAtual}/${totalPaginas}`,
          alignment: "right",
          fontSize: 6,
          color: CORES_MARCA.asfalto,
        },
      ],
    }),
  };
}
