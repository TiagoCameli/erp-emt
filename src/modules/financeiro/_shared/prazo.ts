import { ehParcelaAberta } from "@/modules/financeiro/_shared/formato";

/**
 * Dinheiro em aberto repartido por PRAZO até o vencimento: vencido, até 7 dias,
 * de 8 a 30 dias e mais de 30 dias.
 *
 * Duas regras que vêm de medição no banco (14/08/2026), não de gosto:
 *
 * 1. **Aberto se conta pela PARCELA, não pelo status do lançamento.** No extrato
 *    do fornecedor EMAM, 16 lançamentos somavam R$ 2.325.558,12 com 12 já pagos;
 *    o aberto de verdade é R$ 271.421,16. Mesmo somando "os não pagos" pelo
 *    documento daria R$ 451.878,12, porque 2 dos 4 abertos estão parcialmente
 *    pagos. Errar aqui não é detalhe de arredondamento, é ordem de grandeza.
 * 2. **As quatro faixas somam exatamente o aberto.** Vencido entra como faixa
 *    própria: sem ele, dívida atrasada não caberia em "vence em N dias" e sairia
 *    da conta em silêncio, e o usuário não teria como notar a falta.
 *
 * Módulo puro: nada de banco, nada de React.
 */

/** O mínimo de uma parcela para repartir por prazo. */
export interface ParcelaParaPrazo {
  status: string;
  valor: number;
  dataVencimento: string | null;
}

export interface AbertoPorPrazo {
  /** Soma de tudo que não está pago nem cancelado. */
  total: number;
  /** Vencimento anterior a hoje. */
  vencido: number;
  /** Vence de hoje até 7 dias à frente. */
  ate7: number;
  /** Vence de 8 a 30 dias à frente. */
  de8a30: number;
  /** Vence depois de 30 dias, ou não tem vencimento definido. */
  mais30: number;
}

export const ABERTO_ZERADO: AbertoPorPrazo = {
  total: 0,
  vencido: 0,
  ate7: 0,
  de8a30: 0,
  mais30: 0,
};

/** Dinheiro soma em centavos: float de duas casas acumula resto binário. */
function centavos(valor: number): number {
  return Math.round(valor * 100);
}

function reais(cents: number): number {
  return cents / 100;
}

/**
 * Dias de hoje até o vencimento. Negativo já venceu, zero vence hoje.
 *
 * Conta pelo UTC das duas datas (as duas são dia de calendário em yyyy-MM-dd),
 * então não existe hora nem fuso para atrapalhar, e a diferença sai inteira
 * mesmo em virada de horário de verão.
 */
export function diasAteVencer(dataISO: string, hojeISO: string): number {
  const dia = (iso: string) => {
    const [ano, mes, d] = iso.split("-").map(Number);
    return Date.UTC(ano, mes - 1, d);
  };
  return Math.round((dia(dataISO) - dia(hojeISO)) / 86_400_000);
}

/**
 * Reparte as parcelas em aberto pelas faixas de prazo.
 *
 * `hojeISO` entra por parâmetro (yyyy-MM-dd no fuso de Rio Branco) para a função
 * ser pura: assim o teste de "vence em 7 dias" não muda de resultado amanhã.
 *
 * Parcela sem vencimento cai em "mais de 30 dias" em vez de desaparecer: ela é
 * dívida viva e precisa aparecer em alguma faixa para as quatro fecharem com o
 * total. Não é o caso na base de hoje (nenhuma parcela sem vencimento), e é a
 * escolha menos alarmista das possíveis.
 */
export function abertoPorPrazo(
  parcelas: ParcelaParaPrazo[],
  hojeISO: string,
): AbertoPorPrazo {
  let total = 0;
  let vencido = 0;
  let ate7 = 0;
  let de8a30 = 0;
  let mais30 = 0;

  for (const parcela of parcelas) {
    if (!ehParcelaAberta(parcela.status)) continue;

    const cents = centavos(parcela.valor);
    total += cents;

    if (parcela.dataVencimento === null) {
      mais30 += cents;
      continue;
    }

    const dias = diasAteVencer(parcela.dataVencimento, hojeISO);
    if (dias < 0) vencido += cents;
    else if (dias <= 7) ate7 += cents;
    else if (dias <= 30) de8a30 += cents;
    else mais30 += cents;
  }

  return {
    total: reais(total),
    vencido: reais(vencido),
    ate7: reais(ate7),
    de8a30: reais(de8a30),
    mais30: reais(mais30),
  };
}

/** Soma faixa por faixa, para o resumo de várias linhas da tela. */
export function somarAberto(partes: AbertoPorPrazo[]): AbertoPorPrazo {
  const soma = { ...ABERTO_ZERADO };
  const cents = { total: 0, vencido: 0, ate7: 0, de8a30: 0, mais30: 0 };

  for (const parte of partes) {
    cents.total += centavos(parte.total);
    cents.vencido += centavos(parte.vencido);
    cents.ate7 += centavos(parte.ate7);
    cents.de8a30 += centavos(parte.de8a30);
    cents.mais30 += centavos(parte.mais30);
  }

  soma.total = reais(cents.total);
  soma.vencido = reais(cents.vencido);
  soma.ate7 = reais(cents.ate7);
  soma.de8a30 = reais(cents.de8a30);
  soma.mais30 = reais(cents.mais30);
  return soma;
}
