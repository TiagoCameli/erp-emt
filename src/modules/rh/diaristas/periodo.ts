/**
 * Cálculo da diária por período, para a prévia do formulário.
 *
 * É a MESMA regra da `fn_diaria_calcular` no banco, que é quem grava: dias do
 * período, menos os dias sem trabalho, menos meio dia por meia diária. O período
 * fica dentro de um mês (o fechamento é por competência). Datas como texto
 * yyyy-MM-dd e conta em UTC, para fuso e horário de verão não comerem um dia.
 */

export type TipoDia = "integral" | "meia" | "falta";

const UM_DIA_MS = 24 * 60 * 60 * 1000;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function paraUtc(data: string): number | null {
  if (!DATA_ISO.test(data)) return null;
  const [ano, mes, dia] = data.split("-").map(Number);
  return Date.UTC(ano, mes - 1, dia);
}

/** Dias do início ao fim, inclusive. Vazio se faltar data ou estiver invertido. */
export function diasDoPeriodo(inicio: string, fim: string): string[] {
  const a = paraUtc(inicio);
  const b = paraUtc(fim);
  if (a === null || b === null || b < a) return [];
  const dias: string[] = [];
  for (let t = a; t <= b; t += UM_DIA_MS) {
    dias.push(new Date(t).toISOString().slice(0, 10));
  }
  return dias;
}

/** Clique no dia: integral → meia → não trabalhou → integral. */
export function proximoTipoDia(tipo: TipoDia): TipoDia {
  if (tipo === "integral") return "meia";
  if (tipo === "meia") return "falta";
  return "integral";
}

export interface EntradaPeriodo {
  inicio: string;
  fim: string;
  meias: readonly string[];
  faltas: readonly string[];
  valorDiaria: number;
}

export interface ResultadoPeriodo {
  dias: string[];
  integrais: number;
  qtdMeias: number;
  qtdFaltas: number;
  /** Diárias: integrais + 0,5 por meia. */
  qtd: number;
  /** qtd × valor da diária, no centavo. */
  total: number;
}

/**
 * Quantidade e total do período. Marcação fora do período é ignorada (a tela
 * pode ter encolhido o período depois de marcar); o banco recebe só as de dentro.
 */
export function calcularPeriodo(
  entrada: EntradaPeriodo,
): ResultadoPeriodo | { erro: string } {
  const { inicio, fim } = entrada;
  if (!DATA_ISO.test(inicio) || !DATA_ISO.test(fim)) {
    return { erro: "Informe o início e o fim do período" };
  }
  if (fim < inicio) return { erro: "O fim do período é antes do início" };
  if (inicio.slice(0, 7) !== fim.slice(0, 7)) {
    return {
      erro: "O período cruza o mês: divida em dois lançamentos, um por mês",
    };
  }

  const dias = diasDoPeriodo(inicio, fim);
  const dentro = new Set(dias);
  const meias = new Set(entrada.meias.filter((d) => dentro.has(d)));
  const faltas = new Set(
    entrada.faltas.filter((d) => dentro.has(d) && !meias.has(d)),
  );

  const integrais = dias.length - meias.size - faltas.size;
  const qtd = integrais + meias.size * 0.5;
  if (qtd <= 0) return { erro: "Nenhum dia trabalhado no período" };

  const valor = Math.round(entrada.valorDiaria * 100) / 100;
  const total = Math.round(qtd * valor * 100 + Number.EPSILON) / 100;

  return {
    dias,
    integrais,
    qtdMeias: meias.size,
    qtdFaltas: faltas.size,
    qtd,
    total,
  };
}

/** Só as marcações que caem dentro do período, ordenadas: o que vai pro banco. */
export function marcacoesNoPeriodo(
  inicio: string,
  fim: string,
  datas: readonly string[],
): string[] {
  const dentro = new Set(diasDoPeriodo(inicio, fim));
  return [...new Set(datas.filter((d) => dentro.has(d)))].sort();
}
