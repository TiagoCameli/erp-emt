/**
 * A aritmética do relatório de créditos, separada da consulta.
 *
 * Módulo puro de propósito: as duas RPCs já devolvem agregado, e o que sobra
 * para o app é somar, ordenar e rotular. Sem `server-only` aqui, é isso que o
 * Vitest consegue exercitar sem banco.
 */

import { paraCentavos, paraReais, rotuloMes } from "./calculo";

/** Uma linha de `fn_rel_creditos`, como o Postgres devolve. */
export interface LinhaContratoRpc {
  lancamento_id: string;
  numero: string;
  credor: string;
  descricao: string;
  categoria: string;
  valor_contratado: number;
  total_pago: number;
  saldo_devedor: number;
  parcelas: number;
  parcelas_pagas: number;
  proximo_vencimento: string | null;
}

/** Uma linha de `fn_rel_creditos_por_mes`. */
export interface LinhaMesRpc {
  mes: string;
  valor: number;
  parcelas: number;
}

/** Um contrato: empréstimo, financiamento ou consórcio tomado pela empresa. */
export interface CreditoContrato {
  lancamentoId: string;
  numero: string;
  credor: string;
  descricao: string;
  categoria: string;
  valorContratado: number;
  totalPago: number;
  saldoDevedor: number;
  parcelas: number;
  parcelasPagas: number;
  /** Null = contrato quitado: não sobrou parcela em aberto. */
  proximoVencimento: string | null;
}

/** O que vence num mês, somando todos os contratos. */
export interface CreditoMes {
  /** Primeiro dia do mês, "YYYY-MM-DD". */
  mes: string;
  /** "08/2026", como nos outros relatórios. */
  rotulo: string;
  valor: number;
  parcelas: number;
}

export interface Creditos {
  contratos: CreditoContrato[];
  proximosMeses: CreditoMes[];
  totalContratado: number;
  totalPago: number;
  totalSaldo: number;
  /** Soma dos `proximosMeses`: o compromisso do período. */
  totalProximosMeses: number;
}

/**
 * Monta o relatório a partir do que as duas RPCs devolveram.
 *
 * As somas passam por centavos inteiros e só voltam a reais no fim. Somar
 * `number` de dinheiro doze vezes é o caminho conhecido para o total da tela
 * discordar do total do banco por um centavo, e num relatório de R$ 11 mi
 * ninguém enxerga de onde veio.
 */
export function montarCreditos(
  linhasContratos: LinhaContratoRpc[],
  linhasMeses: LinhaMesRpc[],
): Creditos {
  let contratadoCentavos = 0;
  let pagoCentavos = 0;
  let saldoCentavos = 0;

  const contratos: CreditoContrato[] = linhasContratos.map((linha) => {
    const contratado = paraCentavos(linha.valor_contratado);
    const pago = paraCentavos(linha.total_pago);
    const saldo = paraCentavos(linha.saldo_devedor);
    contratadoCentavos += contratado;
    pagoCentavos += pago;
    saldoCentavos += saldo;
    return {
      lancamentoId: linha.lancamento_id,
      numero: linha.numero,
      credor: linha.credor,
      descricao: linha.descricao,
      categoria: linha.categoria,
      valorContratado: paraReais(contratado),
      totalPago: paraReais(pago),
      saldoDevedor: paraReais(saldo),
      parcelas: Number(linha.parcelas ?? 0),
      parcelasPagas: Number(linha.parcelas_pagas ?? 0),
      proximoVencimento: linha.proximo_vencimento,
    };
  });

  // Quem deve mais primeiro: é a leitura que a tela precisa dar de cara. Os
  // quitados (saldo zero) caem naturalmente para o fim.
  contratos.sort((a, b) => b.saldoDevedor - a.saldoDevedor);

  let proximosCentavos = 0;
  const proximosMeses: CreditoMes[] = linhasMeses.map((linha) => {
    const centavos = paraCentavos(linha.valor);
    proximosCentavos += centavos;
    return {
      mes: linha.mes,
      // A RPC devolve o primeiro dia do mês; o rótulo quer "MM/YYYY".
      rotulo: rotuloMes(linha.mes.slice(0, 7)),
      valor: paraReais(centavos),
      parcelas: Number(linha.parcelas ?? 0),
    };
  });

  return {
    contratos,
    proximosMeses,
    totalContratado: paraReais(contratadoCentavos),
    totalPago: paraReais(pagoCentavos),
    totalSaldo: paraReais(saldoCentavos),
    totalProximosMeses: paraReais(proximosCentavos),
  };
}
