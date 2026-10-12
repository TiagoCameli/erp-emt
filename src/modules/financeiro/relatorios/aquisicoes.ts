/**
 * Relatório "Equipamentos e consórcios" (12/10/2026).
 *
 * O que foi comprado, por bem (centros de imobilizado, ou categoria Aquisição
 * de Equipamento em qualquer centro), e as cotas de consórcio, por lançamento.
 * O cálculo, inclusive o pago proporcional ao rateio, mora em
 * `fn_rel_aquisicoes`; aqui só o formato, o agrupamento e os totais.
 */
export interface AquisicaoLinha {
  tipo: "equipamento" | "consorcio";
  /** Nome do centro raiz: "Aquisição de Equipamentos", "001 - Carretas EMT"... */
  grupo: string;
  centroId: string;
  centro: string;
  /** Só no consórcio (uma linha por cota). */
  lancamentoId: string | null;
  numero: string | null;
  descricao: string | null;
  fornecedor: string | null;
  /** yyyy-MM-dd do primeiro mês de competência. */
  primeiraCompetencia: string | null;
  lancamentos: number;
  /** Só no consórcio. */
  parcelas: number | null;
  parcelasPagas: number | null;
  valor: number;
  pago: number;
  aPagar: number;
}

export interface TotaisAquisicao {
  valor: number;
  pago: number;
  aPagar: number;
}

export interface GrupoAquisicao {
  grupo: string;
  linhas: AquisicaoLinha[];
  totais: TotaisAquisicao;
}

/**
 * Soma em centavos: a linha de total não pode errar o centavo, e somar
 * dezenas de reais com fração em ponto flutuante erra.
 */
export function somarAquisicoes(linhas: AquisicaoLinha[]): TotaisAquisicao {
  let valor = 0;
  let pago = 0;
  let aPagar = 0;
  for (const l of linhas) {
    valor += Math.round(l.valor * 100);
    pago += Math.round(l.pago * 100);
    aPagar += Math.round(l.aPagar * 100);
  }
  return { valor: valor / 100, pago: pago / 100, aPagar: aPagar / 100 };
}

/**
 * Equipamentos agrupados pelo centro raiz, na ordem em que a função devolve
 * (já vem ordenada por grupo e por bem).
 */
export function agruparEquipamentos(linhas: AquisicaoLinha[]): GrupoAquisicao[] {
  const porGrupo = new Map<string, AquisicaoLinha[]>();
  for (const l of linhas) {
    if (l.tipo !== "equipamento") continue;
    const lista = porGrupo.get(l.grupo);
    if (lista) lista.push(l);
    else porGrupo.set(l.grupo, [l]);
  }
  return [...porGrupo].map(([grupo, doGrupo]) => ({
    grupo,
    linhas: doGrupo,
    totais: somarAquisicoes(doGrupo),
  }));
}

export function consorciosDe(linhas: AquisicaoLinha[]): AquisicaoLinha[] {
  return linhas.filter((l) => l.tipo === "consorcio");
}

/** "3/60": parcelas pagas sobre o total da cota. */
export function rotuloParcelas(linha: Pick<AquisicaoLinha, "parcelas" | "parcelasPagas">): string {
  if (linha.parcelas === null) return "";
  return `${linha.parcelasPagas ?? 0}/${linha.parcelas}`;
}
