/**
 * Regras puras da fila de pagamento programado. Sem React, sem Supabase,
 * sem fuso — só a data efetiva de programação (data_programada ou, na
 * falta dela, o vencimento) e a soma dos KPIs por janela (atrasado / hoje /
 * próximos 7 dias).
 *
 * Datas em "YYYY-MM-DD": comparação por string funciona pra igualdade e
 * ordem nesse formato, sem precisar de Date/fuso. Dinheiro somado em
 * centavos (paraCentavos/paraReais, já usados em financeiro/relatorios)
 * pra não acumular erro de ponto flutuante.
 */
import { paraCentavos, paraReais } from "@/modules/financeiro/relatorios/calculo";

/**
 * Data efetiva de programação de uma parcela: usa `data_programada` quando
 * existe; sem programação, cai no vencimento (coalesce).
 */
export function dataEfetivaProgramacao(
  dataProgramada: string | null,
  vencimento: string | null,
): string | null {
  return dataProgramada ?? vencimento;
}

export type BucketProgramacao = "atrasada" | "hoje" | "proxima";

/**
 * Classifica a data efetiva contra hoje (ambas "YYYY-MM-DD"): antes de hoje
 * é atrasada, igual a hoje é hoje, depois de hoje é próxima.
 */
export function bucketProgramacao(
  dataEfetivaISO: string,
  hojeISO: string,
): BucketProgramacao {
  if (dataEfetivaISO < hojeISO) return "atrasada";
  if (dataEfetivaISO === hojeISO) return "hoje";
  return "proxima";
}

/** Item mínimo para somar os KPIs da fila de programados. */
export interface ItemResumoProgramados {
  dataEfetiva: string | null;
  valor: number;
}

export interface ResumoProgramados {
  atrasado: number;
  hoje: number;
  proximos7: number;
}

/** Soma `dias` a uma data ISO "YYYY-MM-DD" (aritmética em UTC, sem fuso). */
function somaDias(dataISO: string, dias: number): string {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia + dias));
  const anoOut = data.getUTCFullYear();
  const mesOut = String(data.getUTCMonth() + 1).padStart(2, "0");
  const diaOut = String(data.getUTCDate()).padStart(2, "0");
  return `${anoOut}-${mesOut}-${diaOut}`;
}

/**
 * Soma os valores da fila por janela: atrasado (efetiva < hoje), hoje
 * (efetiva == hoje) e próximos 7 dias (hoje < efetiva <= hoje+7). Item sem
 * data efetiva (sem programação nem vencimento) não entra em nenhum
 * bucket.
 */
export function resumoProgramados(
  itens: ItemResumoProgramados[],
  hojeISO: string,
): ResumoProgramados {
  const limite7 = somaDias(hojeISO, 7);

  let atrasadoCentavos = 0;
  let hojeCentavos = 0;
  let proximos7Centavos = 0;

  for (const item of itens) {
    if (!item.dataEfetiva) continue;
    const centavos = paraCentavos(item.valor);
    if (item.dataEfetiva < hojeISO) {
      atrasadoCentavos += centavos;
    } else if (item.dataEfetiva === hojeISO) {
      hojeCentavos += centavos;
    } else if (item.dataEfetiva <= limite7) {
      proximos7Centavos += centavos;
    }
  }

  return {
    atrasado: paraReais(atrasadoCentavos),
    hoje: paraReais(hojeCentavos),
    proximos7: paraReais(proximos7Centavos),
  };
}
