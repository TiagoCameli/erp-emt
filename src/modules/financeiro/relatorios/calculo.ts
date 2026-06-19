/**
 * Regras puras dos relatórios financeiros. Sem React, sem Supabase, sem fuso.
 *
 * A query (queries.ts) busca as linhas no banco e delega aqui a classificação
 * por faixa de aging e a soma por categoria. Mantendo essas regras puras dá
 * para testá-las isoladas, sem mockar o banco, e garante que tabela e gráfico
 * usem exatamente a mesma conta.
 *
 * Dinheiro: NUMERIC(14,2) chega como number pelo supabase-js. Somamos em
 * centavos (inteiro) para não acumular erro de ponto flutuante e dividimos por
 * 100 só na borda de saída.
 */

// ---------- dinheiro em centavos ----------

/** Converte valor (number, string pt do banco, null) para centavos inteiros. */
export function paraCentavos(
  valor: number | string | null | undefined,
): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  const numero = typeof valor === "string" ? Number(valor) : valor;
  if (Number.isNaN(numero)) return 0;
  return Math.round(numero * 100);
}

/** Centavos inteiros de volta para reais. */
export function paraReais(centavos: number): number {
  return centavos / 100;
}

// ---------- datas (só pela data, sem hora nem fuso) ----------

/** Mês "YYYY-MM" de uma data `date` do banco. Null para data ausente. */
export function mesDe(data: string | null | undefined): string | null {
  if (!data) return null;
  return data.slice(0, 7);
}

/** Rótulo "mm/aaaa" a partir de "YYYY-MM". */
export function rotuloMes(anoMes: string): string {
  const [ano, mes] = anoMes.split("-");
  return `${mes}/${ano}`;
}

/** Primeiro dia do mês seguinte a "YYYY-MM", como "YYYY-MM-01". */
export function proximoMes(anoMes: string): string {
  const [ano, mes] = anoMes.split("-").map(Number);
  const proximoAno = mes === 12 ? ano + 1 : ano;
  const proximo = mes === 12 ? 1 : mes + 1;
  return `${proximoAno}-${String(proximo).padStart(2, "0")}-01`;
}

/** Diferença em dias entre duas datas "YYYY-MM-DD" (ate - de), só pela data. */
export function diasEntre(de: string, ate: string): number {
  const [ay, am, ad] = de.split("-").map(Number);
  const [by, bm, bd] = ate.split("-").map(Number);
  const aUtc = Date.UTC(ay, am - 1, ad);
  const bUtc = Date.UTC(by, bm - 1, bd);
  return Math.round((bUtc - aUtc) / 86_400_000);
}

// =====================================================================
// Aging (idade dos vencimentos)
// =====================================================================

export type FaixaAging =
  | "a_vencer"
  | "v_1_7"
  | "v_8_15"
  | "v_16_30"
  | "v_31_60"
  | "v_60_mais";

export const ROTULO_FAIXA_AGING: Record<FaixaAging, string> = {
  a_vencer: "A vencer",
  v_1_7: "Vencido 1 a 7 dias",
  v_8_15: "Vencido 8 a 15 dias",
  v_16_30: "Vencido 16 a 30 dias",
  v_31_60: "Vencido 31 a 60 dias",
  v_60_mais: "Vencido mais de 60 dias",
};

export const ORDEM_FAIXA_AGING: FaixaAging[] = [
  "a_vencer",
  "v_1_7",
  "v_8_15",
  "v_16_30",
  "v_31_60",
  "v_60_mais",
];

/**
 * Classifica pela quantidade de dias vencido (hoje - vencimento). Zero ou
 * negativo (vence hoje ou no futuro) é "a vencer"; daí as faixas 1-7, 8-15,
 * 16-30, 31-60 e acima de 60. As bordas pertencem à faixa de baixo: 7 dias é
 * v_1_7, 8 dias é v_8_15.
 */
export function classificarFaixa(diasVencido: number): FaixaAging {
  if (diasVencido <= 0) return "a_vencer";
  if (diasVencido <= 7) return "v_1_7";
  if (diasVencido <= 15) return "v_8_15";
  if (diasVencido <= 30) return "v_16_30";
  if (diasVencido <= 60) return "v_31_60";
  return "v_60_mais";
}

/**
 * Faixa de aging de uma parcela pela data de vencimento contra hoje (ambas
 * "YYYY-MM-DD"). Parcela sem vencimento conta como "a vencer".
 */
export function faixaDaParcela(
  dataVencimento: string | null | undefined,
  hoje: string,
): FaixaAging {
  if (!dataVencimento) return "a_vencer";
  return classificarFaixa(diasEntre(dataVencimento, hoje));
}

export interface AgingFaixa {
  faixa: FaixaAging;
  rotulo: string;
  valor: number;
}

/** Parcela mínima para agrupar no aging. */
export interface ParcelaAging {
  valor: number | string | null | undefined;
  dataVencimento: string | null | undefined;
}

/**
 * Soma as parcelas por faixa de aging, sempre devolvendo as seis faixas na
 * ordem fixa (zero quando não há parcela). `hoje` em "YYYY-MM-DD".
 */
export function agregarAging(
  parcelas: ParcelaAging[],
  hoje: string,
): AgingFaixa[] {
  const porFaixa = new Map<FaixaAging, number>();
  for (const parcela of parcelas) {
    const faixa = faixaDaParcela(parcela.dataVencimento, hoje);
    porFaixa.set(faixa, (porFaixa.get(faixa) ?? 0) + paraCentavos(parcela.valor));
  }
  return ORDEM_FAIXA_AGING.map((faixa) => ({
    faixa,
    rotulo: ROTULO_FAIXA_AGING[faixa],
    valor: paraReais(porFaixa.get(faixa) ?? 0),
  }));
}

/** Total de uma lista de faixas. */
export function totalAging(lista: AgingFaixa[]): number {
  return lista.reduce((soma, f) => soma + f.valor, 0);
}

/** Soma só do que está vencido (tudo fora de "a vencer"). */
export function vencidoAging(lista: AgingFaixa[]): number {
  return lista
    .filter((f) => f.faixa !== "a_vencer")
    .reduce((soma, f) => soma + f.valor, 0);
}

// =====================================================================
// Soma por categoria (base do DRE)
// =====================================================================

export interface DreLinha {
  categoriaId: string | null;
  categoria: string;
  valor: number;
}

/** Lançamento mínimo para somar por categoria. */
export interface LancamentoCategoria {
  categoriaId: string | null | undefined;
  categoria: string | null | undefined;
  valor: number | string | null | undefined;
}

const CHAVE_SEM_CATEGORIA = "__sem_categoria__";
const NOME_SEM_CATEGORIA = "Sem categoria";

/**
 * Soma lançamentos por categoria financeira (lançamentos sem categoria caem
 * num grupo "Sem categoria"). Devolve em reais, do maior valor para o menor.
 */
export function somarPorCategoria(
  lancamentos: LancamentoCategoria[],
): DreLinha[] {
  const porCategoria = new Map<string, DreLinha>();
  for (const lancamento of lancamentos) {
    const chave = lancamento.categoriaId ?? CHAVE_SEM_CATEGORIA;
    const nome = lancamento.categoria ?? NOME_SEM_CATEGORIA;
    const centavos = paraCentavos(lancamento.valor);
    const atual = porCategoria.get(chave);
    if (atual) {
      atual.valor += centavos;
    } else {
      porCategoria.set(chave, {
        categoriaId: lancamento.categoriaId ?? null,
        categoria: nome,
        valor: centavos,
      });
    }
  }
  return [...porCategoria.values()]
    .map((linha) => ({ ...linha, valor: paraReais(linha.valor) }))
    .sort((a, b) => b.valor - a.valor);
}

/** Soma dos valores de uma lista de linhas de DRE. */
export function totalCategorias(linhas: DreLinha[]): number {
  return linhas.reduce((soma, l) => soma + l.valor, 0);
}
