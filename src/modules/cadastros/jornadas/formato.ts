/**
 * Formatação e metadados dos 7 dias da semana da jornada. Só dado e funções
 * puras, sem 'use server' — usado por queries, tabela e formulário.
 */

/** Chave dos 7 campos de horas (mesmo nome nos schemas e nas queries). */
export type ChaveHoraDia =
  | "horasSegunda"
  | "horasTerca"
  | "horasQuarta"
  | "horasQuinta"
  | "horasSexta"
  | "horasSabado"
  | "horasDomingo";

/** As 7 horas de uma jornada, na forma usada por queries e formulário. */
export type JornadaHoras = Record<ChaveHoraDia, number>;

interface DiaSemana {
  chave: ChaveHoraDia;
  rotulo: string;
  abreviacao: string;
}

/** Os 7 dias da semana, em ordem (segunda a domingo). */
export const DIAS_SEMANA: readonly DiaSemana[] = [
  { chave: "horasSegunda", rotulo: "Segunda", abreviacao: "Seg" },
  { chave: "horasTerca", rotulo: "Terça", abreviacao: "Ter" },
  { chave: "horasQuarta", rotulo: "Quarta", abreviacao: "Qua" },
  { chave: "horasQuinta", rotulo: "Quinta", abreviacao: "Qui" },
  { chave: "horasSexta", rotulo: "Sexta", abreviacao: "Sex" },
  { chave: "horasSabado", rotulo: "Sábado", abreviacao: "Sáb" },
  { chave: "horasDomingo", rotulo: "Domingo", abreviacao: "Dom" },
] as const;

/**
 * Carga semanal da jornada: a soma dos 7 dias, arredondada em 2 casas.
 *
 * O arredondamento não é enfeite: somar decimais em float dá 43,99999999, e o
 * filtro de faixa ("de 44 até 44") deixaria a jornada de 44h de fora.
 */
export function horasSemanais(jornada: JornadaHoras): number {
  const total = DIAS_SEMANA.reduce((soma, dia) => soma + jornada[dia.chave], 0);
  return Math.round(total * 100) / 100;
}

/** Formata horas como "8h" (inteiro) ou "8,5h" (decimal, vírgula pt-BR). */
function formatarHoras(horas: number): string {
  const texto = Number.isInteger(horas)
    ? String(horas)
    : horas.toFixed(2).replace(/0$/, "").replace(".", ",");
  return `${texto}h`;
}

/**
 * Resume as 7 horas da jornada agrupando dias consecutivos com a mesma
 * carga, ex: "Seg-Sex 8h · Sáb 5h · Dom 0h". Um único dia destoante não
 * agrupa com o vizinho.
 */
export function resumoHoras(jornada: JornadaHoras): string {
  const dias = DIAS_SEMANA.map((dia) => ({
    abreviacao: dia.abreviacao,
    horas: jornada[dia.chave],
  }));

  const grupos: { inicio: string; fim: string; horas: number }[] = [];
  for (const dia of dias) {
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.horas === dia.horas) {
      ultimo.fim = dia.abreviacao;
    } else {
      grupos.push({ inicio: dia.abreviacao, fim: dia.abreviacao, horas: dia.horas });
    }
  }

  return grupos
    .map((grupo) =>
      grupo.inicio === grupo.fim
        ? `${grupo.inicio} ${formatarHoras(grupo.horas)}`
        : `${grupo.inicio}-${grupo.fim} ${formatarHoras(grupo.horas)}`,
    )
    .join(" · ");
}
