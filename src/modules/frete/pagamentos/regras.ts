import { CASAS_VALOR_OPERACIONAL } from "@/lib/casas-decimais";
import { somarValoresOperacionais } from "@/modules/manutencao/servicos/formato";
import { textoParaNumero } from "@/modules/manutencao/servicos/numero";

/**
 * Regras da tela de Pagamentos de frete, iguais à origem (PagamentoFreteForm,
 * PagamentoFreteList e o filtro de Frete.tsx do Gestão Obras). Módulo puro: tela,
 * action e teste.
 */

export const METODOS_PAGAMENTO = ["pix", "boleto", "cheque", "dinheiro", "transferencia", "combustivel"] as const;
export type MetodoPagamento = (typeof METODOS_PAGAMENTO)[number];

/** Rótulos da origem (METODOS de PagamentoFreteForm). */
export const ROTULO_METODO: Record<MetodoPagamento, string> = {
  pix: "Pix",
  boleto: "Boleto",
  cheque: "Cheque",
  dinheiro: "Dinheiro",
  transferencia: "Transferência",
  combustivel: "Combustível",
};

export function ehMetodoPagamento(valor: string): valor is MetodoPagamento {
  return (METODOS_PAGAMENTO as readonly string[]).includes(valor);
}

export function rotuloMetodo(metodo: string): string {
  return ehMetodoPagamento(metodo) ? ROTULO_METODO[metodo] : metodo;
}

/** A opção fixa do "Pago por" da origem. */
export const PAGO_POR_EMPRESA = "EMT Construtora";

const NOMES_MES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const NOMES_MES_CURTO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export interface OpcaoMes {
  valor: string;
  rotulo: string;
}

/**
 * Opções do "Mês referência" da origem (`gerarMeses`): de 24 meses atrás a 6 à frente do
 * mês de hoje, valor "AAAA-MM" e rótulo "Março 2026". `mesHoje` é o "AAAA-MM" de Rio
 * Branco (a origem usava a hora local do navegador).
 */
export function gerarMeses(mesHoje: string): OpcaoMes[] {
  const ano = Number(mesHoje.slice(0, 4));
  const mes = Number(mesHoje.slice(5, 7)) - 1;
  const meses: OpcaoMes[] = [];
  for (let deslocamento = -24; deslocamento <= 6; deslocamento += 1) {
    const total = ano * 12 + mes + deslocamento;
    const a = Math.floor(total / 12);
    const m = total - a * 12;
    meses.push({ valor: `${a}-${String(m + 1).padStart(2, "0")}`, rotulo: `${NOMES_MES[m]} ${a}` });
  }
  return meses;
}

/** "2026-03" (ou "2026-03-01") -> "Março 2026". */
export function rotuloMesLongo(mes: string): string {
  const m = Number(mes.slice(5, 7)) - 1;
  return m >= 0 && m <= 11 ? `${NOMES_MES[m]} ${mes.slice(0, 4)}` : mes;
}

/** "2026-01" (ou "2026-01-01") -> "Jan/2026", como a lista da origem. */
export function rotuloMesCurto(mes: string): string {
  const m = Number(mes.slice(5, 7)) - 1;
  return m >= 0 && m <= 11 ? `${NOMES_MES_CURTO[m]}/${mes.slice(0, 4)}` : mes;
}

/** "AAAA-MM" -> "AAAA-MM-01" (o `mes_referencia` do banco é date do dia 1). Vazio: vazio. */
export function mesParaData(mes: string): string {
  const limpo = mes.trim();
  if (/^\d{4}-\d{2}$/.test(limpo)) return `${limpo}-01`;
  if (/^\d{4}-\d{2}-01$/.test(limpo)) return limpo;
  return "";
}

// ---------------------------------------------------------------------------
// Dividir entre meses
// ---------------------------------------------------------------------------

export interface ParcelaMes {
  mesReferencia: string;
  /** Texto do campo ("1234,5678"). */
  valor: string;
}

export function parcelaVazia(): ParcelaMes {
  return { mesReferencia: "", valor: "" };
}

/** A origem começa com duas parcelas vazias. */
export function parcelasIniciais(): ParcelaMes[] {
  return [parcelaVazia(), parcelaVazia()];
}

export function valorDaParcela(parcela: ParcelaMes): number | null {
  return textoParaNumero(parcela.valor, CASAS_VALOR_OPERACIONAL);
}

/** Válido como na origem: 2 ou mais parcelas, todas com mês e valor maior que zero. */
export function parcelasValidas(parcelas: readonly ParcelaMes[]): boolean {
  return (
    parcelas.length >= 2 &&
    parcelas.every((parcela) => {
      const valor = valorDaParcela(parcela);
      return parcela.mesReferencia !== "" && valor !== null && valor > 0;
    })
  );
}

/** "Total:" da origem: soma do que é número (o resto conta zero). */
export function totalDasParcelas(parcelas: readonly ParcelaMes[]): number {
  return somarValoresOperacionais(parcelas.map((parcela) => valorDaParcela(parcela) ?? 0));
}

/** Remover (×) só quando há mais de duas. */
export function podeRemoverParcela(parcelas: readonly ParcelaMes[]): boolean {
  return parcelas.length > 2;
}

// ---------------------------------------------------------------------------
// Payload da RPC fn_frete_pagamento_salvar
// ---------------------------------------------------------------------------

export interface DadosPagamento {
  data: string;
  transportadoraId: string;
  /** "AAAA-MM" ou vazio (o banco usa o mês da data). */
  mesReferencia: string;
  valor: number;
  metodo: MetodoPagamento;
  quantidadeCombustivel: number;
  responsavel: string;
  notaFiscal: string | null;
  pagoPor: string;
  observacoes: string | null;
}

/** As chaves de `p_dados` que a `fn_frete_pagamento_salvar` lê. */
export function pDadosDoPagamento(dados: DadosPagamento): Record<string, string | number | null> {
  return {
    data: dados.data,
    transportadora_id: dados.transportadoraId,
    mes_referencia: mesParaData(dados.mesReferencia) || null,
    valor: dados.valor,
    metodo: dados.metodo,
    // Como a origem: fora do combustível grava 0.
    quantidade_combustivel: dados.metodo === "combustivel" ? dados.quantidadeCombustivel : 0,
    responsavel: dados.responsavel,
    nota_fiscal: dados.notaFiscal,
    pago_por: dados.pagoPor,
    observacoes: dados.observacoes,
  };
}

/** Os N pagamentos do "Dividir entre meses": mesmos campos, mês e valor de cada parcela. */
export function pagamentosDasParcelas(base: DadosPagamento, parcelas: readonly ParcelaMes[]): DadosPagamento[] {
  return parcelas.map((parcela) => ({
    ...base,
    mesReferencia: parcela.mesReferencia,
    valor: valorDaParcela(parcela) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Filtro da lista (Frete.tsx e PagamentoFreteList da origem)
// ---------------------------------------------------------------------------

export interface PagamentoFiltravel {
  data: string;
  transportadoraId: string;
  /** "AAAA-MM-01". */
  mesReferencia: string;
  metodo: string;
  pagoPor: string;
  valor: number;
}

export interface FiltrosPagamentos {
  transportadoraId: string;
  /** "AAAA-MM". */
  mes: string;
  de: string;
  ate: string;
  metodo: string;
  pagoPor: string;
}

export const FILTROS_PAGAMENTOS_VAZIOS: FiltrosPagamentos = {
  transportadoraId: "",
  mes: "",
  de: "",
  ate: "",
  metodo: "",
  pagoPor: "",
};

/** Igualdade em tudo, período inclusivo sobre a data; ordem data desc (a origem). */
export function filtrarPagamentos<T extends PagamentoFiltravel>(pagamentos: readonly T[], filtros: FiltrosPagamentos): T[] {
  return pagamentos
    .filter((p) => {
      if (filtros.transportadoraId && p.transportadoraId !== filtros.transportadoraId) return false;
      if (filtros.mes && p.mesReferencia.slice(0, 7) !== filtros.mes) return false;
      if (filtros.metodo && p.metodo !== filtros.metodo) return false;
      if (filtros.pagoPor && p.pagoPor !== filtros.pagoPor) return false;
      if (filtros.de && p.data < filtros.de) return false;
      if (filtros.ate && p.data > filtros.ate) return false;
      return true;
    })
    .sort((a, b) => b.data.localeCompare(a.data));
}

/** Meses que aparecem nos pagamentos, do mais novo ao mais velho ("AAAA-MM"). */
export function mesesDosPagamentos(pagamentos: readonly PagamentoFiltravel[]): string[] {
  return [...new Set(pagamentos.map((p) => p.mesReferencia.slice(0, 7)))].sort().reverse();
}

/** "Pago por" distintos dos pagamentos, em ordem alfabética. */
export function pagoPorDosPagamentos(pagamentos: readonly PagamentoFiltravel[]): string[] {
  return [...new Set(pagamentos.map((p) => p.pagoPor).filter((v) => v !== ""))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}

/** "Total (N registros)" da origem. */
export function rotuloTotal(quantidade: number): string {
  return `Total (${quantidade} ${quantidade === 1 ? "registro" : "registros"})`;
}

export function totalDosPagamentos(pagamentos: readonly PagamentoFiltravel[]): number {
  return somarValoresOperacionais(pagamentos.map((p) => p.valor));
}
