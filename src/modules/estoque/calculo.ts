import { CASAS_TAXA } from "@/lib/casas-decimais";
import { arredondar } from "@/modules/manutencao/almoxarifado/calculo";

/**
 * Conta do saldo para MOSTRAR no formulário da saída. Quem decide é o banco: o PEPS
 * (`fn_estoque_recalcular_peps`) recusa a saída sem saldo na data, inclusive a
 * retroativa. Aqui é só para a pessoa ver quanto há antes de digitar.
 */

export interface MovimentoSaldo {
  depositoId: string;
  insumoId: string;
  quantidade: number;
}

export function chaveSaldo(depositoId: string, insumoId: string): string {
  return `${depositoId}:${insumoId}`;
}

/** Saldo por depósito × insumo: entradas menos saídas (ignorando a saída em edição). */
export function saldosPorDepositoInsumo(
  entradas: readonly MovimentoSaldo[],
  saidas: readonly (MovimentoSaldo & { id: string })[],
  ignorarSaidaId: string | null = null,
): Map<string, number> {
  const saldos = new Map<string, number>();
  for (const entrada of entradas) {
    const chave = chaveSaldo(entrada.depositoId, entrada.insumoId);
    saldos.set(chave, (saldos.get(chave) ?? 0) + entrada.quantidade);
  }
  for (const saida of saidas) {
    if (saida.id === ignorarSaidaId) continue;
    const chave = chaveSaldo(saida.depositoId, saida.insumoId);
    saldos.set(chave, (saldos.get(chave) ?? 0) - saida.quantidade);
  }
  for (const [chave, valor] of saldos) saldos.set(chave, arredondar(valor, CASAS_TAXA));
  return saldos;
}
