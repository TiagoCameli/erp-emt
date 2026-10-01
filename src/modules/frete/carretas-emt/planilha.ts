import ExcelJS from "exceljs";

import { escreverCabecalhoMarca, estilizarCabecalhoColunas } from "@/lib/planilha-marca";
import {
  GRUPOS_GASTO,
  ROTULO_GRUPO,
  rotuloMes,
  type Desempenho,
  type PainelCarretas,
} from "@/modules/frete/carretas-emt/calculo";
import { ROTULO_TIPO_FRETE, type TipoFrete } from "@/modules/frete/fretes/schemas";

/**
 * A planilha da aba Carretas EMT: as quatro tabelas da tela (desempenho por carreta, mês a
 * mês, financiamentos e gastos por categoria), cada uma numa aba com o cabeçalho de marca.
 * Os números são os mesmos do `montarPainel`: a planilha não recalcula nada.
 *
 * **Módulo de servidor**: puxa o exceljs. A action o carrega por `await import`.
 */

const REAIS = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const INTEIRO = "#,##0";
const DUAS = "#,##0.00";
const PORCENTO = "0.0%";

type Coluna = { titulo: string; largura: number; formato?: string };

function aba(workbook: ExcelJS.Workbook, nome: string, titulo: string, colunas: Coluna[], linhas: (string | number | null)[][]) {
  const ws = workbook.addWorksheet(nome);
  const inicio = escreverCabecalhoMarca(workbook, ws, { titulo, colunas: colunas.length });
  const cabecalho = ws.getRow(inicio);
  colunas.forEach((c, i) => {
    cabecalho.getCell(i + 1).value = c.titulo;
    ws.getColumn(i + 1).width = c.largura;
  });
  estilizarCabecalhoColunas(cabecalho);
  linhas.forEach((valores, j) => {
    const linha = ws.getRow(inicio + 1 + j);
    valores.forEach((v, i) => {
      const celula = linha.getCell(i + 1);
      celula.value = v;
      const formato = colunas[i]?.formato;
      if (formato && typeof v === "number") celula.numFmt = formato;
    });
  });
  ws.views = [{ state: "frozen", ySplit: inicio }];
  return ws;
}

type LinhaIndicador = { rotulo: string; valor: (d: Desempenho) => number | null; formato: string };

const INDICADORES: LinhaIndicador[] = [
  { rotulo: "Viagens", valor: (d) => d.viagens, formato: INTEIRO },
  { rotulo: "Toneladas", valor: (d) => d.toneladas, formato: DUAS },
  { rotulo: "Km rodados", valor: (d) => d.km, formato: INTEIRO },
  { rotulo: "Meses com frete", valor: (d) => d.mesesRodando, formato: INTEIRO },
  { rotulo: "Produção (valor dos fretes)", valor: (d) => d.producao, formato: REAIS },
  { rotulo: "Produção por viagem", valor: (d) => d.producaoPorViagem, formato: REAIS },
  { rotulo: "Produção por tonelada", valor: (d) => d.producaoPorTonelada, formato: REAIS },
  { rotulo: "Produção por km", valor: (d) => d.producaoPorKm, formato: REAIS },
  ...GRUPOS_GASTO.filter((g) => g !== "aquisicao").map<LinhaIndicador>((g) => ({
    rotulo: ROTULO_GRUPO[g],
    valor: (d) => d.gastos[g],
    formato: REAIS,
  })),
  { rotulo: "Diesel do tanque", valor: (d) => d.diesel, formato: REAIS },
  { rotulo: "Litros do tanque", valor: (d) => d.litros, formato: INTEIRO },
  { rotulo: "Custo operacional", valor: (d) => d.custoOperacional, formato: REAIS },
  { rotulo: "Custo por km", valor: (d) => d.custoPorKm, formato: REAIS },
  { rotulo: "Resultado operacional", valor: (d) => d.resultadoOperacional, formato: REAIS },
  { rotulo: "Margem operacional", valor: (d) => d.margemOperacional, formato: PORCENTO },
  { rotulo: "Aquisição à vista", valor: (d) => d.investimento, formato: REAIS },
  { rotulo: "Parcelas de financiamento", valor: (d) => d.parcelas, formato: REAIS },
  { rotulo: "Resultado final", valor: (d) => d.resultadoFinal, formato: REAIS },
  { rotulo: "Financiamento contratado", valor: (d) => d.financiamento.contratado, formato: REAIS },
  { rotulo: "Financiamento pago", valor: (d) => d.financiamento.pago, formato: REAIS },
  { rotulo: "Saldo devedor", valor: (d) => d.financiamento.saldo, formato: REAIS },
  { rotulo: "Parcelas em atraso", valor: (d) => d.financiamento.emAtraso, formato: REAIS },
  { rotulo: "Próxima parcela", valor: (d) => d.financiamento.proximaParcela, formato: REAIS },
];

export function montarPlanilhaCarretas(painel: PainelCarretas): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const tipo = painel.filtro.tipo ? `, só ${ROTULO_TIPO_FRETE[painel.filtro.tipo as TipoFrete].toLowerCase()}` : "";
  const periodo = `${rotuloMes(painel.filtro.de)} a ${rotuloMes(painel.filtro.ate)}${tipo}`;
  const colunasDesempenho = painel.desempenhos.length > 1 ? [...painel.desempenhos, painel.total] : painel.desempenhos;

  // Indicador nas linhas, carreta nas colunas: o formato vai por linha, então cada célula
  // recebe o dela depois de escrita.
  const ws = aba(
    workbook,
    "Desempenho",
    `Carretas EMT: desempenho por carreta (${periodo})`,
    [{ titulo: "Indicador", largura: 32 }, ...colunasDesempenho.map((d) => ({ titulo: d.chave === "total" ? "Total" : (d.placa ?? d.nome), largura: 18 }))],
    INDICADORES.map((ind) => [ind.rotulo, ...colunasDesempenho.map((d) => ind.valor(d))]),
  );
  const primeira = ws.rowCount - INDICADORES.length + 1;
  INDICADORES.forEach((ind, j) => {
    ws.getRow(primeira + j).eachCell((celula, coluna) => {
      if (coluna > 1) celula.numFmt = ind.formato;
    });
  });

  aba(
    workbook,
    "Mês a mês",
    `Carretas EMT: mês a mês (${periodo})`,
    [
      { titulo: "Mês", largura: 10 },
      { titulo: "Viagens", largura: 10, formato: INTEIRO },
      { titulo: "Toneladas", largura: 12, formato: DUAS },
      { titulo: "Km", largura: 10, formato: INTEIRO },
      { titulo: "Produção", largura: 16, formato: REAIS },
      { titulo: "Custo operacional", largura: 18, formato: REAIS },
      { titulo: "Resultado operacional", largura: 20, formato: REAIS },
      { titulo: "Aquisição à vista", largura: 16, formato: REAIS },
      { titulo: "Parcelas", largura: 16, formato: REAIS },
      { titulo: "Resultado final", largura: 16, formato: REAIS },
    ],
    painel.meses.map((m) => [
      m.rotulo,
      m.viagens,
      m.toneladas,
      m.km,
      m.producao,
      m.custoOperacional,
      m.resultadoOperacional,
      m.investimento,
      m.parcelas,
      m.resultadoFinal,
    ]),
  );

  aba(
    workbook,
    "Financiamentos",
    "Carretas EMT: financiamentos (posição de hoje)",
    [
      { titulo: "Lançamento", largura: 16 },
      { titulo: "Credor", largura: 30 },
      { titulo: "Carretas", largura: 26 },
      { titulo: "Contratado", largura: 16, formato: REAIS },
      { titulo: "Pago", largura: 16, formato: REAIS },
      { titulo: "Saldo devedor", largura: 16, formato: REAIS },
      { titulo: "Parcelas pagas", largura: 14, formato: INTEIRO },
      { titulo: "Parcelas", largura: 10, formato: INTEIRO },
      { titulo: "Próxima parcela", largura: 16, formato: REAIS },
    ],
    painel.contratos.map((k) => [
      k.numero,
      k.credor,
      k.placas.length > 0 ? k.placas.join(", ") : "Frota",
      k.contratado,
      k.pago,
      k.saldo,
      k.parcelasPagas,
      k.parcelasTotal,
      k.proximaParcela,
    ]),
  );

  aba(
    workbook,
    "Gastos por categoria",
    `Carretas EMT: gastos por categoria (${periodo})`,
    [
      { titulo: "Categoria", largura: 34 },
      { titulo: "Grupo", largura: 24 },
      { titulo: "Lançado", largura: 16, formato: REAIS },
      { titulo: "Pago", largura: 16, formato: REAIS },
    ],
    painel.categorias.map((k) => [k.categoria, ROTULO_GRUPO[k.grupo], k.valor, k.pago]),
  );

  return workbook;
}
