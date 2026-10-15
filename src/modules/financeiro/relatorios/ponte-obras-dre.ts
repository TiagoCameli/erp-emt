import { paraCentavos } from "@/modules/financeiro/relatorios/calculo";

/**
 * Por que o custo das obras não é o custo operacional do DRE, no mesmo período.
 *
 * As duas telas contam o mesmo dinheiro com recortes diferentes, e sem a ponte
 * a diferença parece erro. Medido em jan-set/2026 (91.134,02 de diferença no
 * custo, zero na receita):
 *
 * - o DRE conta custo operacional lançado em centros que não são obra
 *   (imobilizado: 77.130,08), e o resultado por obra não;
 * - o DRE reclassifica para operacional parte dos juros do cronograma dos
 *   contratos (28.721,28), que não tem centro e não está em obra nenhuma;
 * - o custo da obra inclui a despesa financeira lançada nela (14.717,34), que
 *   no DRE fica no bloco financeiro, abaixo do operacional.
 *
 * Os termos vêm de `fn_rel_obras_ponte_dre`, calculados direto dos lançamentos.
 * O que sobrar depois deles é "não explicado" e aparece na tela: a ponte não
 * fecha por subtração.
 *
 * Módulo puro.
 */

export interface TermosPonteDre {
  custoForaDasObras: number;
  receitaForaDasObras: number;
  financeiraNasObras: number;
  cronogramaOperacional: number;
}

export interface PassoPonte {
  id: string;
  rotulo: string;
  /** Com sinal: o que se soma ao número do DRE para chegar ao das obras. */
  valor: number;
}

export interface LadoPonte {
  dre: number;
  passos: PassoPonte[];
  obras: number;
  /** Obras menos (DRE + passos). Zero quando a ponte fecha. */
  naoExplicado: number;
}

export interface PonteObrasDre {
  custo: LadoPonte;
  receita: LadoPonte;
}

function lado(dre: number, passos: PassoPonte[], obras: number): LadoPonte {
  const chegada = paraCentavos(dre) + passos.reduce((s, p) => s + paraCentavos(p.valor), 0);
  return {
    dre,
    passos: passos.filter((p) => paraCentavos(p.valor) !== 0),
    obras,
    naoExplicado: (paraCentavos(obras) - chegada) / 100,
  };
}

export function ponteObrasDre({
  dre,
  obras,
  termos,
}: {
  /** Receita e despesa OPERACIONAIS do DRE no período. */
  dre: { receita: number; custo: number };
  /** Receita e custo do custo x receita no mesmo período, sem rateio. */
  obras: { receita: number; custo: number };
  termos: TermosPonteDre;
}): PonteObrasDre {
  return {
    custo: lado(
      dre.custo,
      [
        { id: "fora", rotulo: "Custo operacional em centro que não é obra (imobilizado, empréstimos)", valor: -termos.custoForaDasObras },
        { id: "cronograma", rotulo: "Juros do cronograma que o DRE reclassifica para operacional", valor: -termos.cronogramaOperacional },
        { id: "financeira", rotulo: "Despesa financeira lançada nas obras (no DRE fica no bloco financeiro)", valor: termos.financeiraNasObras },
      ],
      obras.custo,
    ),
    receita: lado(
      dre.receita,
      [{ id: "fora", rotulo: "Receita operacional em centro que não é obra", valor: -termos.receitaForaDasObras }],
      obras.receita,
    ),
  };
}
