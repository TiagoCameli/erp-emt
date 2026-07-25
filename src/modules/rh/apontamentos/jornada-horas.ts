/**
 * Lógica pura do split de horas do apontamento: dado o total de horas que o
 * encarregado lança no dia, separa em normais/extras pela jornada do
 * colaborador e sugere falta quando o total é zero num dia de jornada > 0.
 * Sem 'use server', sem I/O: usada pelo form (client) e por quem mais
 * precisar, sem depender de banco.
 */

import { DIAS_SEMANA, type JornadaHoras } from "@/modules/cadastros/jornadas/formato";

/** Arredonda em 2 casas (mesma precisão de horas do banco, NUMERIC(5,2)). */
function arredondar2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Horas normais esperadas no dia-da-semana da data (yyyy-MM-dd), segundo a
 * jornada do colaborador. O dia da semana é derivado da própria string, sem
 * `new Date(dataISO)` (que o JS interpretaria como UTC meia-noite e, a
 * depender do fuso do host, cairia no dia anterior): construímos a data em
 * UTC a partir de ano/mês/dia explícitos e lemos `getUTCDay()`, que não
 * sofre nenhum deslocamento de fuso. `getUTCDay()` vai de 0 (domingo) a 6
 * (sábado); somamos 6 e tiramos o módulo 7 para cair no índice 0 (segunda) a
 * 6 (domingo) usado por `DIAS_SEMANA`.
 */
export function jornadaDoDia(jornada: JornadaHoras, dataISO: string): number {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const diaSemana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  const indice = (diaSemana + 6) % 7;
  return jornada[DIAS_SEMANA[indice].chave];
}

/** Resultado do split do total de horas do dia. */
export interface SplitHoras {
  horasNormais: number;
  horasExtras: number;
}

/**
 * Separa o total de horas lançado no dia em normais/extras pela jornada:
 * normais é o mínimo entre total e jornada, extras é o que passar da
 * jornada (nunca negativo). 2 casas decimais.
 */
export function separaHoras(total: number, jornadaHoras: number): SplitHoras {
  const normais = Math.min(total, jornadaHoras);
  const extras = Math.max(0, total - jornadaHoras);
  return {
    horasNormais: arredondar2(normais),
    horasExtras: arredondar2(extras),
  };
}

/**
 * Sugere o tipo "falta": total zerado num dia em que a jornada esperava
 * horas (jornadaHoras > 0). Num dia de folga da jornada (jornadaHoras = 0,
 * ex: domingo do Padrão EMT) zero horas não é falta.
 */
export function sugereFalta(total: number, jornadaHoras: number): boolean {
  return total === 0 && jornadaHoras > 0;
}
