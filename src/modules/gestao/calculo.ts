/**
 * Regras puras do painel de Gestão: janela de meses, série mensal com os meses
 * vazios preenchidos e faixa de vencimento do que está a pagar.
 *
 * Ficam fora das queries porque são o que precisa de teste: o banco só devolve
 * os meses que têm custo, e um painel de tendência precisa dos seis meses na
 * linha do tempo, com zero onde não houve gasto.
 *
 * Duplicação conhecida: paraCentavos/paraReais e a ideia de faixa existem em
 * src/modules/financeiro/relatorios/calculo.ts. O painel não importa de lá para
 * não acoplar Gestão ao Financeiro, e a faixa daqui é outra pergunta (quanto
 * vence pela frente, não há quantos dias venceu).
 */

/** Quantos meses de competência o painel mostra. */
export const MESES_PAINEL = 6;

/** Dinheiro soma em centavos: NUMERIC(14,2) em float acumula erro de arredondamento. */
export function paraCentavos(valor: number | string | null | undefined): number {
  return Math.round(Number(valor ?? 0) * 100);
}

export function paraReais(centavos: number): number {
  return centavos / 100;
}

const NOME_MES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** "2026-07-01" -> "jul/26", o rótulo curto do eixo do gráfico. */
export function rotuloMesCurto(competencia: string): string {
  const mes = Number(competencia.slice(5, 7));
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return competencia;
  return `${NOME_MES[mes - 1]}/${competencia.slice(2, 4)}`;
}

/** Soma (ou subtrai) meses de uma competência "yyyy-MM-01". */
export function somarMeses(competencia: string, delta: number): string {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7));
  const total = ano * 12 + (mes - 1) + delta;
  const novoAno = Math.floor(total / 12);
  const novoMes = total - novoAno * 12 + 1;
  return `${novoAno}-${String(novoMes).padStart(2, "0")}-01`;
}

export interface JanelaPainel {
  /** Primeiro dia do mês mais antigo da janela. */
  inicio: string;
  /** Primeiro dia do mês SEGUINTE ao atual (limite exclusivo). */
  fim: string;
  /** Competências da janela em ordem crescente, a última é o mês corrente. */
  meses: string[];
}

/**
 * Janela de competência do painel, terminando no mês corrente. Todos os cortes
 * de custo (mês, centro de custo, grupo, maiores lançamentos) usam esta mesma
 * janela para os totais fecharem entre si.
 *
 * `mesHoje` vem em "yyyy-MM" (mesHojeISO, já no fuso de Rio Branco).
 */
export function janelaPainel(
  mesHoje: string,
  quantidade = MESES_PAINEL,
): JanelaPainel {
  const atual = `${mesHoje}-01`;
  const total = Math.max(quantidade, 1);
  const meses = Array.from({ length: total }, (_, i) =>
    somarMeses(atual, i - (total - 1)),
  );
  return {
    inicio: meses[0],
    fim: somarMeses(atual, 1),
    meses,
  };
}

export interface PontoMes {
  /** Competência "yyyy-MM-01". */
  mes: string;
  /** "jul/26", para o eixo. */
  rotulo: string;
  valor: number;
  lancamentos: number;
}

interface LinhaMes {
  mes: string;
  total: number | string | null;
  lancamentos?: number | null;
}

/**
 * Encaixa as linhas do banco na janela de meses, com zero nos meses sem custo.
 * Linha fora da janela é descartada (a RPC não tem limite superior, então
 * competência no futuro apareceria e não bateria com os outros cortes).
 */
export function serieMensal(linhas: LinhaMes[], meses: string[]): PontoMes[] {
  const porMes = new Map<string, { centavos: number; lancamentos: number }>();

  for (const linha of linhas) {
    const atual = porMes.get(linha.mes) ?? { centavos: 0, lancamentos: 0 };
    atual.centavos += paraCentavos(linha.total);
    atual.lancamentos += linha.lancamentos ?? 0;
    porMes.set(linha.mes, atual);
  }

  return meses.map((mes) => {
    const encontrado = porMes.get(mes);
    return {
      mes,
      rotulo: rotuloMesCurto(mes),
      valor: paraReais(encontrado?.centavos ?? 0),
      lancamentos: encontrado?.lancamentos ?? 0,
    };
  });
}

/**
 * Variação percentual entre dois valores. Devolve null quando não há base de
 * comparação (mês anterior zerado), porque "+100%" em cima de zero mente.
 */
export function variacaoPercentual(
  atual: number,
  anterior: number,
): number | null {
  if (anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

// =====================================================================
// Faixa de vencimento do que está a pagar
// =====================================================================

export type FaixaPrazo =
  | "vencido"
  | "ate_7"
  | "d_8_15"
  | "d_16_30"
  | "d_31_60"
  | "acima_60"
  | "sem_data";

export const ROTULO_FAIXA_PRAZO: Record<FaixaPrazo, string> = {
  vencido: "Vencido",
  ate_7: "Até 7 dias",
  d_8_15: "8 a 15 dias",
  d_16_30: "16 a 30 dias",
  d_31_60: "31 a 60 dias",
  acima_60: "Mais de 60 dias",
  sem_data: "Sem vencimento",
};

/** Ordem fixa do eixo: passado à esquerda, futuro à direita. */
export const ORDEM_FAIXA_PRAZO: FaixaPrazo[] = [
  "vencido",
  "ate_7",
  "d_8_15",
  "d_16_30",
  "d_31_60",
  "acima_60",
];

export interface FaixaVencimento {
  faixa: FaixaPrazo;
  rotulo: string;
  valor: number;
}

/** Uma faixa já classificada e somada pelo banco (fn_rel_aging.faixa_prazo). */
export interface LinhaFaixaPrazo {
  faixa: string;
  valor: number | string | null | undefined;
}

/**
 * A faixa vem do banco como texto livre. Faixa que esta lista não conhece é
 * contrato quebrado entre fn_rel_aging e o TypeScript, e o único desfecho
 * aceitável é falhar: somar em silêncio na faixa errada, ou descartar a linha,
 * é dinheiro sumindo da tela sem aviso, que é exatamente o defeito que a
 * agregação no banco veio consertar.
 */
function comoFaixaPrazo(faixa: string): FaixaPrazo {
  if (!(faixa in ROTULO_FAIXA_PRAZO)) {
    throw new Error(`Faixa de prazo desconhecida vinda do banco: ${faixa}`);
  }
  return faixa as FaixaPrazo;
}

/**
 * Soma por faixa de prazo o que o banco já classificou, sempre devolvendo as
 * seis faixas na ordem (zero onde não há nada). "Sem vencimento" só entra na
 * lista quando existe de fato, para não poluir o gráfico com uma coluna morta.
 *
 * A classificação em si (quantos dias até vencer cai em qual faixa) mora em
 * fn_rel_aging, não aqui: é o que permite a RPC devolver meia dúzia de linhas
 * em vez de uma por data de vencimento, e assim nunca esbarrar no teto de 1000
 * linhas do PostgREST. As bordas continuam iguais, e a prova
 * supabase/provas/aging_agregado_por_faixa.sql confere isso dia a dia.
 */
export function agregarPorPrazo(linhas: LinhaFaixaPrazo[]): FaixaVencimento[] {
  const porFaixa = new Map<FaixaPrazo, number>();

  for (const linha of linhas) {
    const faixa = comoFaixaPrazo(linha.faixa);
    porFaixa.set(faixa, (porFaixa.get(faixa) ?? 0) + paraCentavos(linha.valor));
  }

  const lista: FaixaPrazo[] = [...ORDEM_FAIXA_PRAZO];
  if ((porFaixa.get("sem_data") ?? 0) > 0) lista.push("sem_data");

  return lista.map((faixa) => ({
    faixa,
    rotulo: ROTULO_FAIXA_PRAZO[faixa],
    valor: paraReais(porFaixa.get(faixa) ?? 0),
  }));
}

/** Participação de cada valor no total, em percentual (0 quando total é zero). */
export function participacao(valor: number, total: number): number {
  if (total === 0) return 0;
  return (valor / total) * 100;
}
