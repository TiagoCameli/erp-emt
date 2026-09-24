import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";

import { CORES_MARCA, EMPRESA } from "@/config/marca";
import { LOGO_EMT_PNG_BASE64 } from "@/config/marca-logo";
import { formatarBRL, formatarDataHora } from "@/lib/formatadores";
import {
  dadosDaExportacao,
  dataDoMovimento,
  ehCredito,
  filtrosDaExportacao,
  memoriaDeCalculo,
  somar,
  TIPO_LABEL,
  type MovimentoExtrato,
} from "@/modules/frete/conta-corrente/extrato";

/**
 * O PDF do extrato, com o conteúdo do `exportarExtratoPDF` da origem: título e
 * filtros, os 4 indicadores (Saldo final, Créditos, Débitos, Movimentos), a
 * tabela "Movimentos" com o rodapé "Saldo final" e, quando a transportadora é
 * dona de tanque, a página "Abastecimentos no tanque (créditos)".
 *
 * A moldura é a do ERP (logo, razão social, a Pista, rodapé com endereço e
 * emissão), a mesma do resumo da folha. A origem desenhava com jsPDF no
 * navegador; aqui o pdfmake roda no servidor.
 *
 * MÓDULO PURO: devolve a definição; quem gera os bytes é `src/lib/pdf.ts`.
 */

const TITULO = "Extrato de Conta-Corrente";

/**
 * A Helvetica padrão do PDF é WinAnsi: tem "×", "·" e o travessão, mas não a
 * seta "→" que a descrição do frete traz ("Pedreira → Usina"). Sem trocar, a
 * seta sai como caractere quebrado no papel.
 */
export function textoPdf(texto: string | null | undefined): string {
  return (texto ?? "").replace(/→/g, "->");
}
const SUBTITULO = "Transportadora · Movimentos";

function cabecalhoTabela(titulos: string[], direita: number[]): TableCell[] {
  return titulos.map((t, i) => ({
    text: t,
    bold: true,
    color: "#FFFFFF",
    fillColor: CORES_MARCA.asfalto,
    alignment: direita.includes(i) ? ("right" as const) : ("left" as const),
  }));
}

const layoutTabela = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0,
  hLineColor: () => CORES_MARCA.borda,
  paddingTop: () => 3,
  paddingBottom: () => 3,
};

function pista(): Content[] {
  return [
    {
      margin: [0, 6, 0, 0],
      table: { widths: ["*"], body: [[""]], heights: [3] },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => CORES_MARCA.asfalto },
    },
    {
      table: { widths: ["*"], body: [[""]], heights: [2] },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => CORES_MARCA.amarelo },
    },
  ];
}

export function documentoDoExtrato(
  transportadoraNome: string,
  movimentos: readonly MovimentoExtrato[],
  meses: readonly string[],
  emitidoEm: Date,
): TDocumentDefinitions {
  const { todos, totais, creditosTanque } = dadosDaExportacao(movimentos, meses);
  const direita = (texto: string, extra: Partial<{ bold: boolean; color: string }> = {}) => ({
    text: texto,
    alignment: "right" as const,
    ...extra,
  });

  const filtros = filtrosDaExportacao(meses);
  const kpis: [string, string][] = [
    ["Saldo final", formatarBRL(totais.saldoFinal)],
    ["Créditos", formatarBRL(totais.creditos)],
    ["Débitos", formatarBRL(totais.debitos)],
    ["Movimentos", String(totais.qtd)],
  ];

  const corpoMovimentos: TableCell[][] = [
    cabecalhoTabela(["Data", "Tipo", "Descrição", "Cálculo", "Crédito", "Débito", "Saldo"], [4, 5, 6]),
    ...todos.map((m) => [
      { text: dataDoMovimento(m.data) },
      { text: TIPO_LABEL[m.tipo] },
      { text: textoPdf(m.descricao) },
      { text: textoPdf(memoriaDeCalculo(m)), fontSize: 6.5, color: CORES_MARCA.textoSecundario },
      direita(ehCredito(m.tipo) ? formatarBRL(m.valor) : ""),
      direita(ehCredito(m.tipo) ? "" : formatarBRL(m.valor)),
      direita(formatarBRL(m.saldoAcumulado), { bold: true, color: m.saldoAcumulado < 0 ? "#B91C1C" : CORES_MARCA.texto }),
    ]),
    [
      { text: "" },
      { text: "" },
      { text: "Saldo final", bold: true },
      { text: "" },
      { text: "" },
      { text: "" },
      direita(formatarBRL(totais.saldoFinal), { bold: true }),
    ],
  ];

  const conteudo: Content[] = [
    {
      columns: [
        { image: `data:image/png;base64,${LOGO_EMT_PNG_BASE64}`, width: 86 },
        {
          stack: [
            { text: EMPRESA.razaoSocial, bold: true, fontSize: 10 },
            { text: `CNPJ ${EMPRESA.cnpj}`, fontSize: 7, color: CORES_MARCA.asfalto },
          ],
          alignment: "right",
          margin: [0, 6, 0, 0],
        },
      ],
    },
    ...pista(),
    { text: TITULO, bold: true, fontSize: 13, margin: [0, 10, 0, 2] },
    { text: textoPdf(`${transportadoraNome} · ${SUBTITULO}`), fontSize: 8, color: CORES_MARCA.asfalto, margin: [0, 0, 0, 6] },
    {
      text:
        filtros.length > 0
          ? filtros.map(([rotulo, valor]) => `${rotulo}: ${valor}`).join(" · ")
          : "Filtros aplicados: nenhum (todos os registros)",
      fontSize: 8,
      margin: [0, 0, 0, 8],
    },
    {
      table: {
        widths: ["*", "*", "*", "*"],
        body: [
          kpis.map(([rotulo]) => ({ text: rotulo.toUpperCase(), fontSize: 7, color: CORES_MARCA.textoSecundario })),
          kpis.map(([, valor]) => ({ text: valor, fontSize: 12, bold: true })),
        ],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingTop: () => 4,
        paddingBottom: () => 4,
        fillColor: () => CORES_MARCA.superficie,
      },
      margin: [0, 0, 0, 10],
    },
    { text: `Movimentos (${todos.length})`, bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
    {
      table: { headerRows: 1, widths: [44, 92, "*", 150, 62, 62, 66], body: corpoMovimentos },
      layout: layoutTabela,
    },
  ];

  if (creditosTanque.length > 0) {
    const total = somar(creditosTanque.map((m) => m.valor));
    const litros = somar(creditosTanque.map((m) => m.saidaLitros));
    const numero = (n: number, casas: number) =>
      n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
    conteudo.push(
      {
        text: `Abastecimentos no tanque (créditos) (${creditosTanque.length})`,
        bold: true,
        fontSize: 10,
        margin: [0, 0, 0, 4],
        pageBreak: "before",
      },
      {
        table: {
          headerRows: 1,
          widths: [50, "*", 56, 70, 56, 56, "*", 70],
          body: [
            cabecalhoTabela(
              ["Data", "Combustível", "Litros", "Preço Tanque/L", "Taxa/L", "Placa", "Motorista", "Crédito"],
              [2, 3, 4, 7],
            ),
            ...creditosTanque.map((m) => [
              { text: dataDoMovimento(m.data) },
              { text: m.saidaCombustivelNome ?? "" },
              direita(m.saidaLitros !== null ? numero(m.saidaLitros, 2) : ""),
              direita(`R$ ${numero(m.saidaPrecoProprietario ?? m.saidaPrecoCombustivel ?? 0, 4)}`),
              direita(`R$ ${numero(m.saidaTaxaLitro ?? 0, 4)}`),
              { text: m.saidaPlaca ?? "" },
              { text: m.saidaMotorista ?? "" },
              direita(formatarBRL(m.valor)),
            ]),
            [
              { text: "" },
              { text: "" },
              direita(numero(litros, 2), { bold: true }),
              { text: "" },
              { text: "" },
              { text: "" },
              direita("Total", { bold: true }),
              direita(formatarBRL(total), { bold: true }),
            ],
          ],
        },
        layout: layoutTabela,
      },
    );
  }

  return {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [28, 28, 28, 36],
    defaultStyle: { font: "Helvetica", fontSize: 7.5 },
    info: { title: `${TITULO} - ${transportadoraNome}`, author: EMPRESA.razaoSocial },
    content: conteudo,
    footer: (paginaAtual: number, totalPaginas: number) => ({
      margin: [28, 0, 28, 0],
      columns: [
        { text: `${EMPRESA.razaoSocial} · ${EMPRESA.endereco}`, fontSize: 6, color: CORES_MARCA.asfalto },
        {
          text: `Emitido em ${formatarDataHora(emitidoEm.toISOString())} · ${paginaAtual}/${totalPaginas}`,
          alignment: "right",
          fontSize: 6,
          color: CORES_MARCA.asfalto,
        },
      ],
    }),
  };
}
