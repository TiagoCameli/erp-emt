import { paraCentavos, paraReais } from "@/modules/financeiro/relatorios/calculo";
import {
  TIPOS_CONTA_APLICADA,
  TIPOS_CONTA_DO_CAIXA,
} from "@/modules/financeiro/relatorios/fluxo-caixa";

/**
 * A aritmética da Posição bancária, separada da consulta (15/10/2026).
 *
 * ## Disponível não é aplicado
 *
 * O "Saldo total" somava as contas correntes com as subcontas de investimento:
 * R$ 9,89 mi em 15/10, sendo −690 mil disponível e 10,58 mi aplicados. O número
 * estava certo e dizia a coisa errada: quem olha o total acha que há dinheiro
 * para pagar o boleto de amanhã, e não há sem um resgate antes. Os dois saem
 * separados, com os mesmos tipos de conta do Fluxo de caixa.
 *
 * ## O extrato é a prova do saldo
 *
 * O saldo do sistema é o saldo inicial mais o que foi lançado. O do banco é o
 * do último OFX importado. Cada conta ganha a comparação NA DATA do extrato
 * (`fn_conferencia_extrato_contas`), que separa dois problemas:
 *
 * - divergente: na data do extrato o sistema já não bate com o banco, falta ou
 *   sobra lançamento;
 * - atrasada: o sistema tem movimento DEPOIS do último extrato, que o banco
 *   ainda não confirmou. Em 15/10 a BB 30.893-5 mostrava −640.000,00 no sistema
 *   e 0,00 no OFX de 08/10: a transferência de 13/10 entrou, o extrato que a
 *   confirma não.
 *
 * Módulo puro: nada de banco, nada de React.
 */

/** Onde o dinheiro da conta está: livre para pagar, aplicado, ou outro. */
export type ClasseConta = "disponivel" | "aplicado";

export function classeDaConta(tipo: string): ClasseConta {
  return TIPOS_CONTA_APLICADA.includes(tipo) ? "aplicado" : "disponivel";
}

/** O que `fn_conferencia_extrato_contas` devolve de uma conta, em número. */
export interface ConferenciaExtrato {
  /** Data do saldo final do último OFX (yyyy-MM-dd). */
  data: string;
  /** Saldo final do último OFX. */
  saldoExtrato: number;
  /** Soma do que o sistema registra depois da data do extrato. */
  movimentoDepois: number;
  /** Quantos movimentos (parcelas e transferências) depois do extrato. */
  lancamentosDepois: number;
  /** O saldo do sistema na data do extrato. */
  saldoNaData: number;
  /** `saldoNaData - saldoExtrato`. Zero = bate. */
  diferencaNaData: number;
}

export type SituacaoExtrato =
  /** Conta sem extrato importado, e é conta que deveria ter (corrente). */
  | "sem_extrato"
  /** Caixa e subconta de investimento: não há OFX para elas. */
  | "nao_se_aplica"
  | "em_dia"
  | "atrasado"
  | "divergente";

/**
 * A situação da conta contra o extrato. Divergente vence atrasada: a diferença
 * na data é erro de lançamento, e importar o extrato novo não a resolve.
 */
export function situacaoDoExtrato(
  tipo: string,
  extrato: ConferenciaExtrato | null,
): SituacaoExtrato {
  if (!extrato) return tipo === "corrente" ? "sem_extrato" : "nao_se_aplica";
  if (paraCentavos(extrato.diferencaNaData) !== 0) return "divergente";
  if (extrato.lancamentosDepois > 0 && paraCentavos(extrato.movimentoDepois) !== 0) {
    return "atrasado";
  }
  return "em_dia";
}

/** O mínimo de uma conta que o resumo precisa. */
export interface ContaNaPosicao {
  nome: string;
  tipo: string;
  saldoAtual: number;
  extrato: ConferenciaExtrato | null;
}

export interface ResumoDaPosicao {
  disponivel: number;
  aplicado: number;
  total: number;
  contasDisponiveis: number;
  contasAplicadas: number;
  /** Contas com extrato a conferir, na ordem em que vieram. */
  aConferir: { nome: string; situacao: SituacaoExtrato; extrato: ConferenciaExtrato | null }[];
}

const A_CONFERIR: readonly SituacaoExtrato[] = ["divergente", "atrasado", "sem_extrato"];

export function resumoDaPosicao(contas: readonly ContaNaPosicao[]): ResumoDaPosicao {
  let disponivel = 0;
  let aplicado = 0;
  let contasDisponiveis = 0;
  let contasAplicadas = 0;
  const aConferir: ResumoDaPosicao["aConferir"] = [];
  for (const conta of contas) {
    const centavos = paraCentavos(conta.saldoAtual);
    if (classeDaConta(conta.tipo) === "aplicado") {
      aplicado += centavos;
      contasAplicadas += 1;
    } else {
      disponivel += centavos;
      contasDisponiveis += 1;
    }
    const situacao = situacaoDoExtrato(conta.tipo, conta.extrato);
    if (A_CONFERIR.includes(situacao)) {
      aConferir.push({ nome: conta.nome, situacao, extrato: conta.extrato });
    }
  }
  return {
    disponivel: paraReais(disponivel),
    aplicado: paraReais(aplicado),
    total: paraReais(disponivel + aplicado),
    contasDisponiveis,
    contasAplicadas,
    aConferir,
  };
}

/**
 * A frase do topo: quanto a empresa tem, onde está, e o que conferir. Uma
 * linha para quem não vai ler a tabela.
 */
export function fraseDaPosicao(
  resumo: ResumoDaPosicao,
  brl: (valor: number) => string,
  data: (iso: string) => string,
): string {
  let frase = `A empresa tem ${brl(resumo.total)} nas contas: ${brl(resumo.disponivel)} disponível nas contas correntes e caixa e ${brl(resumo.aplicado)} aplicado.`;
  if (resumo.disponivel < 0 && resumo.aplicado > 0) {
    frase += " O disponível está negativo: pagar exige resgatar.";
  }
  const partes = resumo.aConferir.map((conta) => {
    const e = conta.extrato;
    switch (conta.situacao) {
      case "divergente":
        return `${conta.nome} não bate com o extrato de ${data(e!.data)} (diferença de ${brl(e!.diferencaNaData)})`;
      case "atrasado":
        return `${conta.nome} tem ${brl(e!.movimentoDepois)} lançados depois do extrato de ${data(e!.data)}, ainda sem confirmação do banco`;
      default:
        return `${conta.nome} não tem extrato importado`;
    }
  });
  if (partes.length === 0) {
    frase += " Todas as contas com extrato batem com o banco.";
  } else {
    frase += ` A conferir: ${partes.join("; ")}.`;
    const faltaExtrato = resumo.aConferir.some((c) => c.situacao !== "divergente");
    if (faltaExtrato) frase += " Importar o extrato mais recente confirma ou corrige o saldo.";
  }
  return frase;
}
