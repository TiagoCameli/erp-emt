import {
  lerPeriodoDaUrl,
  type ParametrosUrl,
  type PeriodoNaUrl,
} from "@/modules/financeiro/relatorios/filtros-periodo";

/**
 * O ranking que abre o "Extrato por fornecedor" (15/10/2026): uma linha por
 * fornecedor, agregada no banco por `fn_rel_fornecedores_ranking`.
 *
 * Responde "a quem devo mais, e a quem mais paguei?" antes de pedir para a
 * pessoa escolher um fornecedor. O extrato de um fornecedor continua existindo,
 * como o clique numa linha daqui.
 *
 * Módulo puro: nada de banco, nada de React.
 */
export interface FornecedorRankingLinha {
  /** Null = lançamentos sem fornecedor. */
  fornecedorId: string | null;
  nome: string;
  /** Lançamentos com mês de referência no período. */
  lancamentos: number;
  /** Valor dos documentos com mês de referência no período (competência). */
  lancado: number;
  /** Parcelas pagas no período, pelo líquido (caixa). */
  pago: number;
  /** Parcelas não pagas nem canceladas, hoje. */
  emAberto: number;
  /** Parte do em aberto vencida antes de hoje. */
  vencido: number;
  /** Parte do em aberto que vence de hoje a 30 dias. */
  proximos30: number;
}

export interface TotaisRanking {
  lancado: number;
  pago: number;
  emAberto: number;
  vencido: number;
  proximos30: number;
}

export interface ResumoRanking {
  totais: TotaisRanking;
  /** Quantos fornecedores têm alguma coisa em aberto hoje. */
  comAberto: number;
  /**
   * Fração do em aberto que está nos 5 maiores credores. Null quando não há
   * nada em aberto (fração de zero não diz nada).
   */
  concentracaoTop5: number | null;
  /** Os maiores credores de hoje, do maior para o menor (só quem tem aberto). */
  maioresEmAberto: FornecedorRankingLinha[];
}

/** Quantos credores a lista de barras mostra. O resto fica na tabela. */
export const TOPO_DO_RANKING = 10;

const centavos = (v: number) => Math.round(v * 100);

export function resumirRanking(linhas: FornecedorRankingLinha[]): ResumoRanking {
  const soma = { lancado: 0, pago: 0, emAberto: 0, vencido: 0, proximos30: 0 };
  for (const l of linhas) {
    soma.lancado += centavos(l.lancado);
    soma.pago += centavos(l.pago);
    soma.emAberto += centavos(l.emAberto);
    soma.vencido += centavos(l.vencido);
    soma.proximos30 += centavos(l.proximos30);
  }

  const comAberto = linhas
    .filter((l) => centavos(l.emAberto) > 0)
    .sort((a, b) => b.emAberto - a.emAberto || a.nome.localeCompare(b.nome));
  const top5 = comAberto.slice(0, 5).reduce((s, l) => s + centavos(l.emAberto), 0);

  return {
    totais: {
      lancado: soma.lancado / 100,
      pago: soma.pago / 100,
      emAberto: soma.emAberto / 100,
      vencido: soma.vencido / 100,
      proximos30: soma.proximos30 / 100,
    },
    comAberto: comAberto.length,
    concentracaoTop5: soma.emAberto > 0 ? top5 / soma.emAberto : null,
    maioresEmAberto: comAberto.slice(0, TOPO_DO_RANKING),
  };
}

/**
 * O período do ranking. Mesmos parâmetros dos outros relatórios (`modo`, `mes`,
 * `de`, `ate`), mas o padrão é o ANO corrente até o mês corrente, e não um mês
 * só: "a quem mais paguei" num mês só é uma pergunta pequena demais.
 */
export function lerPeriodoFornecedores(
  params: ParametrosUrl,
  mesCorrente: string,
): PeriodoNaUrl {
  const lido = lerPeriodoDaUrl(params, mesCorrente);
  if (params.modo === undefined && params.mes === undefined) {
    return { modo: "periodo", mes: mesCorrente, de: `${mesCorrente.slice(0, 4)}-01`, ate: mesCorrente };
  }
  return lido;
}
