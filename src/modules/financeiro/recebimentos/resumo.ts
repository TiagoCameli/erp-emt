import type { ParcelaAReceber } from "@/modules/financeiro/recebimentos/queries";

/**
 * Resumo dos cards da aba "A receber".
 *
 * Existe fora do componente, e com teste, pelo mesmo motivo de
 * `pagamentos/resumo.ts`: são somas de dinheiro que aparecem no topo da tela e
 * têm de bater com a tabela embaixo. Regra de dinheiro dentro de JSX não se
 * testa e vira duas verdades na mesma tela.
 */
export interface ResumoAReceber {
  /** Soma de tudo que está em aberto. */
  total: number;
  parcelas: number;
  /** Em aberto com vencimento hoje ou no futuro, e o sem data. */
  aVencer: number;
  aVencerParcelas: number;
  /** Em aberto com vencimento já passado. */
  vencido: number;
  vencidas: number;
}

const VAZIO: ResumoAReceber = {
  total: 0,
  parcelas: 0,
  aVencer: 0,
  aVencerParcelas: 0,
  vencido: 0,
  vencidas: 0,
};

/**
 * Soma as parcelas a receber em aberto, separando vencido de a vencer.
 *
 * `vencido` e `aVencer` são complementares e somam `total`: cada parcela cai em
 * exatamente um dos dois. É diferente do resumo do a pagar, onde "vencido"
 * atravessa aprovado e aguardando e por isso não fecha com o total — aqui não há
 * aprovação, então a divisão é limpa e a tela pode ser lida como uma conta.
 *
 * Parcela SEM vencimento conta como a vencer, não como vencida: não há data para
 * dizer que atrasou, e mostrá-la em "Vencido" faria a empresa cobrar quem não
 * está devendo prazo nenhum.
 *
 * Vencimento igual a hoje NÃO é vencido: vence hoje, ainda dá para receber. A
 * comparação é de texto porque data ISO (yyyy-MM-dd) ordena igual à cronologia, e
 * `hoje` vem do servidor no fuso de Rio Branco.
 */
export function somarParaResumoAReceber(
  parcelas: readonly ParcelaAReceber[],
  hoje: string,
): ResumoAReceber {
  const resumo: ResumoAReceber = { ...VAZIO };

  for (const parcela of parcelas) {
    resumo.total += parcela.valor;
    resumo.parcelas += 1;

    if (parcela.dataVencimento !== null && parcela.dataVencimento < hoje) {
      resumo.vencido += parcela.valor;
      resumo.vencidas += 1;
    } else {
      resumo.aVencer += parcela.valor;
      resumo.aVencerParcelas += 1;
    }
  }

  return resumo;
}

/** "3 recebimentos" / "1 recebimento", para o detalhe do card. */
export function contagemRecebimentos(quantas: number): string {
  return quantas === 1 ? "1 recebimento" : `${quantas} recebimentos`;
}
