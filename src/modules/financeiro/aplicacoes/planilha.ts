import type ExcelJS from "exceljs";

import { formatarData } from "@/lib/formatadores";
import {
  ROTULO_PRODUTO,
  ROTULO_TIPO_MOVIMENTO,
  rotuloLiquidez,
  rotuloTaxa,
  type LinhaMes,
  type MovimentoAplicacao,
  type PainelAplicacoes,
  type ResumoAplicacao,
} from "@/modules/financeiro/aplicacoes/calculo";
import type { DadosAplicacoes } from "@/modules/financeiro/aplicacoes/queries";
import {
  aba,
  montarPlanilhaDeRelatorio,
  type ColunaRelatorio,
} from "@/modules/financeiro/relatorios/planilha-relatorio";

/** Percentual da tela (1,02 = 1,02%) para a fração que a coluna "percentual" espera. */
const fracao = (p: number | null) => (p === null ? null : p / 100);

const COLUNAS_APLICACAO: ColunaRelatorio<ResumoAplicacao>[] = [
  { cabecalho: "Aplicação", largura: 34, tipo: "texto", celula: (r) => r.aplicacao.nome },
  { cabecalho: "Produto", largura: 10, tipo: "texto", celula: (r) => ROTULO_PRODUTO[r.aplicacao.produto] ?? r.aplicacao.produto },
  { cabecalho: "Taxa", largura: 16, tipo: "texto", celula: (r) => rotuloTaxa(r.aplicacao) },
  { cabecalho: "Liquidez", largura: 16, tipo: "texto", celula: (r) => rotuloLiquidez(r.aplicacao) },
  { cabecalho: "Vencimento", largura: 12, tipo: "texto", celula: (r) => (r.aplicacao.vencimento ? formatarData(r.aplicacao.vencimento) : "Não informado") },
  { cabecalho: "Principal (aplicado − resgatado)", largura: 20, tipo: "dinheiro", celula: (r) => r.principal, somar: true },
  { cabecalho: "Posição líquida", largura: 18, tipo: "dinheiro", celula: (r) => r.posicaoLiquida, somar: true },
  { cabecalho: "Rendimento acumulado", largura: 18, tipo: "dinheiro", celula: (r) => r.rendimentoAcumulado, somar: true },
  { cabecalho: "% do CDI acumulado", largura: 14, tipo: "percentual", celula: (r) => fracao(r.pctCdiAcumulado) },
  { cabecalho: "Última posição", largura: 14, tipo: "texto", celula: (r) => (r.ultimaPosicao ? formatarData(r.ultimaPosicao) : "Nenhuma") },
];

const COLUNAS_MES: ColunaRelatorio<LinhaMes>[] = [
  { cabecalho: "Mês", largura: 10, tipo: "texto", celula: (m) => `${m.mes.slice(5, 7)}/${m.mes.slice(0, 4)}` },
  { cabecalho: "Posição inicial", largura: 18, tipo: "dinheiro", celula: (m) => m.posicaoInicial },
  { cabecalho: "Aplicado", largura: 16, tipo: "dinheiro", celula: (m) => m.aplicado, somar: true },
  { cabecalho: "Resgatado", largura: 16, tipo: "dinheiro", celula: (m) => m.resgatado, somar: true },
  { cabecalho: "Rendimento", largura: 16, tipo: "dinheiro", celula: (m) => m.rendimento, somar: true },
  { cabecalho: "Ajuste de abertura", largura: 16, tipo: "dinheiro", celula: (m) => m.ajusteAbertura, somar: true },
  { cabecalho: "Posição final", largura: 18, tipo: "dinheiro", celula: (m) => m.posicaoFinal },
  { cabecalho: "% no mês", largura: 10, tipo: "percentual", celula: (m) => fracao(m.rendimentoPct) },
  { cabecalho: "CDI no período", largura: 12, tipo: "percentual", celula: (m) => fracao(m.cdiPct) },
  { cabecalho: "% do CDI", largura: 10, tipo: "percentual", celula: (m) => fracao(m.pctCdi) },
];

function colunasMovimento(nomes: Map<string, string>): ColunaRelatorio<MovimentoAplicacao>[] {
  return [
    { cabecalho: "Data", largura: 12, tipo: "texto", celula: (m) => formatarData(m.data) },
    { cabecalho: "Tipo", largura: 20, tipo: "texto", celula: (m) => ROTULO_TIPO_MOVIMENTO[m.tipo] },
    { cabecalho: "Aplicação", largura: 32, tipo: "texto", celula: (m) => nomes.get(m.aplicacaoId) ?? "" },
    { cabecalho: "Documento", largura: 16, tipo: "texto", celula: (m) => m.documento },
    { cabecalho: "Descrição", largura: 36, tipo: "texto", celula: (m) => m.descricao },
    // Posição não move dinheiro: vai na própria coluna para não somar com o resto.
    { cabecalho: "Efeito no saldo", largura: 18, tipo: "dinheiro", celula: (m) => (m.tipo === "posicao" ? null : m.valor), somar: true },
    { cabecalho: "Saldo líquido (posição)", largura: 18, tipo: "dinheiro", celula: (m) => (m.tipo === "posicao" ? m.valor : null) },
  ];
}

export function montarPlanilhaAplicacoes(
  painel: PainelAplicacoes,
  dados: DadosAplicacoes,
  hoje: string,
): ExcelJS.Workbook {
  const nomes = new Map(dados.aplicacoes.map((a) => [a.id, a.nome]));
  const data = formatarData(hoje);
  return montarPlanilhaDeRelatorio([
    aba({
      nome: "Aplicações",
      titulo: `Aplicações financeiras · posição em ${data}`,
      colunas: COLUNAS_APLICACAO,
      linhas: painel.aplicacoes,
      rotuloTotal: `Total (${painel.aplicacoes.length} aplicação(ões))`,
    }),
    aba({
      nome: "Mês a mês",
      titulo: `Aplicações · mês a mês · até ${data} · rendimento em branco = mês sem posição do extrato`,
      colunas: COLUNAS_MES,
      linhas: painel.meses,
      rotuloTotal: "Total do período",
    }),
    aba({
      nome: "Movimentos",
      titulo: `Aplicações · aplicações, resgates, rendimentos e posições · até ${data}`,
      colunas: colunasMovimento(nomes),
      linhas: dados.movimentos,
      rotuloTotal: `Total (${dados.movimentos.length} movimento(s))`,
    }),
  ]);
}
