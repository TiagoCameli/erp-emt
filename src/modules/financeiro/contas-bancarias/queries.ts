import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  BancoConta,
  TipoConta,
} from "@/modules/financeiro/contas-bancarias/schemas";

/** Linha da listagem de contas, já com o saldo atual calculado. */
export interface ContaLista {
  id: string;
  nome: string;
  banco: BancoConta;
  agencia: string | null;
  conta: string | null;
  tipo: TipoConta;
  saldoInicial: number;
  /** Saldo inicial + movimento das parcelas pagas nesta conta. Ver listarContas. */
  saldoAtual: number;
  ativo: boolean;
}

/**
 * Lista todas as contas bancárias com o saldo atual calculado.
 *
 * Cálculo do saldo atual de cada conta:
 *   saldoAtual = saldo_inicial + soma do movimento das parcelas PAGAS desta conta
 *
 * Uma parcela entra no cálculo quando, e só quando:
 *   - status = 'pago'
 *   - conta_bancaria_id aponta para esta conta
 *
 * O sinal do movimento vem do tipo do lançamento dono da parcela:
 *   - a_receber: entra somando   (+valor)  dinheiro que entrou na conta
 *   - a_pagar:   entra subtraindo (-valor)  dinheiro que saiu da conta
 *
 * Parcela sem conta_bancaria_id ou em qualquer status diferente de 'pago'
 * não afeta saldo nenhum. Os valores do banco são NUMERIC(14,2); somamos em
 * centavos (inteiros) para não acumular erro de ponto flutuante e só dividimos
 * por 100 no fim.
 */
export async function listarContas(): Promise<ContaLista[]> {
  const supabase = await createClient();

  const [contasResultado, parcelasResultado] = await Promise.all([
    supabase
      .from("contas_bancarias")
      .select("id, nome, banco, agencia, conta, tipo, saldo_inicial, ativo")
      .order("nome"),
    supabase
      .from("lancamento_parcelas")
      .select("conta_bancaria_id, valor, lancamentos(tipo)")
      .eq("status", "pago")
      .not("conta_bancaria_id", "is", null),
  ]);

  if (contasResultado.error) {
    throw new Error("Não foi possível carregar as contas bancárias");
  }
  if (parcelasResultado.error) {
    throw new Error("Não foi possível calcular o saldo das contas");
  }

  // Movimento por conta, somado em centavos para precisão exata.
  const movimentoCentavos = new Map<string, number>();
  for (const parcela of parcelasResultado.data ?? []) {
    const contaId = parcela.conta_bancaria_id;
    const tipo = parcela.lancamentos?.tipo;
    if (!contaId || !tipo) continue;

    const sinal = tipo === "a_receber" ? 1 : -1;
    const centavos = Math.round(Number(parcela.valor) * 100) * sinal;
    movimentoCentavos.set(
      contaId,
      (movimentoCentavos.get(contaId) ?? 0) + centavos,
    );
  }

  return (contasResultado.data ?? []).map((conta) => {
    const inicialCentavos = Math.round(Number(conta.saldo_inicial) * 100);
    const atualCentavos =
      inicialCentavos + (movimentoCentavos.get(conta.id) ?? 0);

    return {
      id: conta.id,
      nome: conta.nome,
      banco: conta.banco as BancoConta,
      agencia: conta.agencia,
      conta: conta.conta,
      tipo: conta.tipo as TipoConta,
      saldoInicial: Number(conta.saldo_inicial),
      saldoAtual: atualCentavos / 100,
      ativo: conta.ativo,
    };
  });
}
