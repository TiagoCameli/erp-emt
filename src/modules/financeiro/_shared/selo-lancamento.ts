import type { StatusPadrao } from "@/components/canonicos";
import {
  STATUS_LANCAMENTO,
  type StatusLancamento,
  type TipoLancamento,
} from "@/modules/financeiro/_shared/formato";

/**
 * O selo de status de um lançamento, como ele aparece em TODAS as telas.
 *
 * A regra que este módulo existe para carregar: **o selo principal fala de
 * dívida, não de etapa do processo.**
 *
 * Medido no banco em 15/08/2026: os 107 lançamentos com status `aprovado` têm
 * TODOS saldo em aberto, somando R$ 9.835.752,05 — 84% de tudo que a empresa
 * deve. Eles apareciam com o selo verde "Aprovado", que qualquer pessoa lê como
 * resolvido, enquanto só os R$ 1,90 mi restantes apareciam como "A pagar". Quem
 * batia o olho na tela via 16% da dívida.
 *
 * `aprovado` continua sendo uma etapa real e útil (é o que o financeiro está
 * liberado para pagar hoje), então ela NÃO some: vira um selo secundário ao lado.
 * Trocar um problema de leitura por uma perda de informação não seria conserto.
 *
 * Módulo puro, e separado de `formato.ts` de propósito: ali mora a tabela de
 * rótulo por status, que é um mapa burro; aqui mora a REGRA, que precisa saber
 * quanto ainda está em aberto. Misturar as duas faria a tabela depender de
 * dinheiro.
 */

export interface SeloLancamento {
  rotulo: string;
  badge: StatusPadrao;
  /**
   * Etapa já vencida que o rótulo principal deixou de mostrar, quando existe.
   * A tela desenha como um segundo selo, menor e discreto.
   */
  etapa?: string;
}

/**
 * Rótulo do status considerando o tipo. Num recebível, `a_pagar` (o status com
 * que todo lançamento nasce) tem que ler "A receber": a dívida é do cliente.
 */
function rotuloBase(status: StatusLancamento, tipo: TipoLancamento): string {
  if (status === "a_pagar" && tipo === "a_receber") return "A receber";
  return STATUS_LANCAMENTO[status].rotulo;
}

/**
 * O selo de um lançamento.
 *
 * `valorAberto` é quanto ainda falta pagar, somado pelas PARCELAS (é onde o
 * pagamento acontece). `null` significa "esta tela não carregou as parcelas" —
 * e aí o selo cai no rótulo do status, sem inventar: afirmar dívida sem ter
 * olhado o saldo seria trocar um erro por outro.
 */
export function seloDoLancamento(
  status: StatusLancamento,
  tipo: TipoLancamento,
  valorAberto: number | null,
): SeloLancamento {
  const temSaldo = valorAberto !== null && valorAberto > 0;

  if (status === "aprovado" && temSaldo) {
    return {
      // "A pagar" num pagável, "A receber" num recebível: a mesma regra do
      // rótulo base, aplicada ao status que descreve a dívida viva.
      rotulo: rotuloBase("a_pagar", tipo),
      badge: STATUS_LANCAMENTO.a_pagar.badge,
      etapa: STATUS_LANCAMENTO.aprovado.rotulo,
    };
  }

  return {
    rotulo: rotuloBase(status, tipo),
    badge: STATUS_LANCAMENTO[status].badge,
  };
}
