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
  /**
   * No consórcio com cota em Dívidas, vem do cronograma da cota (o que a
   * administradora cobra), e não do lançamento.
   */
  aPagar: number;
  /** Parcelas em aberto: do lançamento no bem, do cronograma na cota. */
  parcelasAbertas: number;
  /** yyyy-MM-dd da próxima parcela em aberto. */
  proximoVencimento: string | null;
  /** yyyy-MM-dd da última parcela em aberto: a quitação, se nada mudar. */
  ultimoVencimento: string | null;
  /**
   * Onde a dívida está cadastrada em Financeiro > Dívidas: "contrato"
   * (contratos_divida), "cota" (consorcio_cotas) ou null (não está).
   */
  divida: "contrato" | "cota" | null;
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

/**
 * Diferença, em reais, entre o que o lançamento da cota diz (valor - pago) e o
 * a pagar do cronograma de Dívidas. Zero quando as duas fontes concordam.
 */
export function divergenciaDaCota(linha: Pick<AquisicaoLinha, "valor" | "pago" | "aPagar">): number {
  return (Math.round(linha.valor * 100) - Math.round(linha.pago * 100) - Math.round(linha.aPagar * 100)) / 100;
}

export interface ResumoQuitacao {
  equipamentos: { aPagar: number; bens: number; quitacao: string | null };
  consorcios: { aPagar: number; cotas: number; quitacao: string | null };
  /** Bens com saldo cujo financiamento não está em Financeiro > Dívidas. */
  foraDeDividas: { nomes: string[]; aPagar: number };
  /** Bens e cotas com saldo, do maior a pagar para o menor. */
  maiores: AquisicaoLinha[];
}

function ultimaData(datas: (string | null)[]): string | null {
  return datas.reduce<string | null>((max, d) => (d !== null && (max === null || d > max) ? d : max), null);
}

/** "Quanto falta pagar das máquinas e até quando": a frase e a lista do topo. */
export function resumirQuitacao(linhas: AquisicaoLinha[]): ResumoQuitacao {
  const comSaldo = linhas.filter((l) => Math.round(l.aPagar * 100) > 0);
  const equip = comSaldo.filter((l) => l.tipo === "equipamento");
  const cotas = comSaldo.filter((l) => l.tipo === "consorcio");
  const fora = equip.filter((l) => l.divida === null);
  return {
    equipamentos: {
      aPagar: somarAquisicoes(equip).aPagar,
      bens: equip.length,
      quitacao: ultimaData(equip.map((l) => l.ultimoVencimento)),
    },
    consorcios: {
      aPagar: somarAquisicoes(cotas).aPagar,
      cotas: cotas.length,
      quitacao: ultimaData(cotas.map((l) => l.ultimoVencimento)),
    },
    foraDeDividas: { nomes: fora.map((l) => l.centro), aPagar: somarAquisicoes(fora).aPagar },
    maiores: [...comSaldo].sort((a, b) => b.aPagar - a.aPagar),
  };
}
