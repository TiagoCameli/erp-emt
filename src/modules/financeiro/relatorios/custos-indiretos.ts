/**
 * Relatório "Custos indiretos" (12/10/2026).
 *
 * O que compõe o custo indireto: Escritório Central, Manutenção/Documentação de
 * Equipamentos e 002 - Equipamentos Colorado, por mês, etapa e categoria. O
 * critério de custo mora em `fn_rel_custos_indiretos` (o mesmo do rateio do
 * indireto, então o total do mês é o que o rateio distribui); aqui só o
 * agrupamento e as somas, em centavos.
 */
export interface CustoIndiretoLinha {
  /** yyyy-MM-dd, primeiro dia do mês de competência. */
  mes: string;
  raizId: string;
  /** Centro raiz indireto: "Escritório Central"... */
  raiz: string;
  /** A etapa, ou a própria raiz quando o lançamento caiu nela. */
  centroId: string;
  centro: string;
  categoriaId: string | null;
  categoria: string;
  total: number;
}

export interface CentroIndireto {
  centroId: string;
  centro: string;
  /** Doze posições, janeiro a dezembro. */
  porMes: number[];
  total: number;
}

export interface RaizIndireta {
  raizId: string;
  raiz: string;
  centros: CentroIndireto[];
  porMes: number[];
  total: number;
}

export interface CustosPorCentro {
  raizes: RaizIndireta[];
  porMes: number[];
  total: number;
}

export interface CategoriaIndireta {
  categoriaId: string | null;
  categoria: string;
  total: number;
  /** Percentual do total do ano, 0 a 100. */
  pct: number;
}

export const ROTULOS_MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
] as const;

const centavos = (v: number) => Math.round(v * 100);
const zeros = () => Array.from({ length: 12 }, () => 0);

/** Índice 0..11 do mês de uma linha; -1 se a data não for válida. */
function indiceDoMes(mes: string): number {
  const m = Number(mes.slice(5, 7));
  return Number.isInteger(m) && m >= 1 && m <= 12 ? m - 1 : -1;
}

/** Ano do parâmetro `ano_indireto`, com fallback no padrão. */
export function anoDoIndireto(valor: string | undefined, padrao: number): number {
  if (!valor || !/^\d{4}$/.test(valor)) return padrao;
  const ano = Number(valor);
  return ano >= 2000 && ano <= 2100 ? ano : padrao;
}

interface Acumulador {
  id: string;
  nome: string;
  porMes: number[];
}

/**
 * Por centro: raiz (com subtotal) e, dentro dela, cada etapa. A raiz que maior
 * custo teve vem primeiro; dentro dela, a própria raiz (lançamento direto
 * nela) abre a lista e as etapas seguem pelo total.
 */
export function custosPorCentro(linhas: CustoIndiretoLinha[]): CustosPorCentro {
  const raizes = new Map<string, Acumulador & { centros: Map<string, Acumulador> }>();
  const geral = zeros();
  for (const l of linhas) {
    const i = indiceDoMes(l.mes);
    if (i < 0) continue;
    const c = centavos(l.total);
    let raiz = raizes.get(l.raizId);
    if (!raiz) {
      raiz = { id: l.raizId, nome: l.raiz, porMes: zeros(), centros: new Map() };
      raizes.set(l.raizId, raiz);
    }
    let centro = raiz.centros.get(l.centroId);
    if (!centro) {
      centro = { id: l.centroId, nome: l.centro, porMes: zeros() };
      raiz.centros.set(l.centroId, centro);
    }
    centro.porMes[i] += c;
    raiz.porMes[i] += c;
    geral[i] += c;
  }

  const soma = (porMes: number[]) => porMes.reduce((s, v) => s + v, 0);
  const emReais = (porMes: number[]) => porMes.map((v) => v / 100);
  const porTotal = (a: { nome: string; t: number }, b: { nome: string; t: number }) =>
    b.t - a.t || a.nome.localeCompare(b.nome, "pt-BR");

  const lista = [...raizes.values()]
    .map((r) => ({ ...r, t: soma(r.porMes) }))
    .sort(porTotal)
    .map((r) => {
      const centros = [...r.centros.values()]
        .map((c) => ({ ...c, t: soma(c.porMes) }))
        .sort((a, b) => Number(b.id === r.id) - Number(a.id === r.id) || porTotal(a, b))
        .map((c) => ({ centroId: c.id, centro: c.nome, porMes: emReais(c.porMes), total: c.t / 100 }));
      return { raizId: r.id, raiz: r.nome, centros, porMes: emReais(r.porMes), total: r.t / 100 };
    });

  return { raizes: lista, porMes: emReais(geral), total: soma(geral) / 100 };
}

/** Por categoria no ano, do maior para o menor, com o percentual do total. */
export function custosPorCategoria(linhas: CustoIndiretoLinha[]): CategoriaIndireta[] {
  const porCategoria = new Map<string, { categoriaId: string | null; categoria: string; c: number }>();
  let geral = 0;
  for (const l of linhas) {
    const chave = l.categoriaId ?? `sem:${l.categoria}`;
    const c = centavos(l.total);
    const atual = porCategoria.get(chave);
    if (atual) atual.c += c;
    else porCategoria.set(chave, { categoriaId: l.categoriaId, categoria: l.categoria, c });
    geral += c;
  }
  return [...porCategoria.values()]
    .sort((a, b) => b.c - a.c || a.categoria.localeCompare(b.categoria, "pt-BR"))
    .map((x) => ({
      categoriaId: x.categoriaId,
      categoria: x.categoria,
      total: x.c / 100,
      pct: geral === 0 ? 0 : (x.c / geral) * 100,
    }));
}

/**
 * Quantos meses (a partir de janeiro) a tabela mostra. Ano passado: os doze.
 * Ano corrente: até o mês corrente, ou até o último mês com custo se houver
 * competência adiante (senão o total da linha não bateria com as colunas).
 * Ano futuro: até o último mês com custo.
 *
 * `mesCorrente` é yyyy-MM.
 */
export function mesesVisiveis(ano: number, mesCorrente: string, porMes: number[]): number {
  const anoCorrente = Number(mesCorrente.slice(0, 4));
  if (ano < anoCorrente) return 12;
  let ultimoComCusto = 0;
  porMes.forEach((v, i) => {
    if (v !== 0) ultimoComCusto = i + 1;
  });
  if (ano > anoCorrente) return Math.max(1, ultimoComCusto);
  return Math.max(Number(mesCorrente.slice(5, 7)), ultimoComCusto);
}
