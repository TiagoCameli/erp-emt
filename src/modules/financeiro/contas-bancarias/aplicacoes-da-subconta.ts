/**
 * Os investimentos de uma subconta e quanto tem em cada um, para a linha
 * expandida de Contas bancárias (pedido do Tiago em 08/10/2026).
 *
 * O saldo de cada aplicação vem de `fn_saldos_das_aplicacoes`, que soma as
 * mesmas peças do saldo da subconta (saldo inicial, transferências da etapa,
 * rendimentos das posições). A soma das aplicações fecha com o saldo da
 * subconta por construção; o que sobrar é movimento lançado na subconta sem
 * aplicação, e a tela mostra essa diferença em vez de escondê-la.
 *
 * Função pura, em CENTAVOS INTEIROS: 0,1 + 0,2 não pode virar diferença de
 * R$ 0,00000000000000004 e acender um aviso falso.
 */

export interface SaldoDaAplicacao {
  aplicacaoId: string;
  /** A subconta de investimentos onde o dinheiro da aplicação mora. */
  subcontaId: string;
  /** Nome da etapa do centro Investimentos ("Caixa Econômica - CDB 95"). */
  nome: string;
  produto: string;
  ativa: boolean;
  saldo: number;
  /** Data da última posição de extrato gravada. Null = nenhuma. */
  ultimaPosicao: string | null;
}

export interface ResumoDaSubconta {
  aplicacoes: SaldoDaAplicacao[];
  /** Soma das aplicações. */
  total: number;
  /**
   * Saldo da subconta menos a soma das aplicações: movimento sem aplicação.
   * Null quando não há o que comparar (sem permissão de saldo) ou quando fecha.
   */
  foraDasAplicacoes: number | null;
}

const centavos = (valor: number) => Math.round(valor * 100);

/**
 * Monta o resumo de uma subconta. Aplicações de outras subcontas são
 * ignoradas, então a tela pode passar a lista inteira.
 */
export function resumoDaSubconta(
  subcontaId: string,
  saldoDaSubconta: number | null,
  todas: readonly SaldoDaAplicacao[],
): ResumoDaSubconta {
  const aplicacoes = todas.filter((a) => a.subcontaId === subcontaId);
  const totalC = aplicacoes.reduce((soma, a) => soma + centavos(a.saldo), 0);
  const restoC = saldoDaSubconta === null ? 0 : centavos(saldoDaSubconta) - totalC;
  return {
    aplicacoes,
    total: totalC / 100,
    foraDasAplicacoes: restoC === 0 ? null : restoC / 100,
  };
}
