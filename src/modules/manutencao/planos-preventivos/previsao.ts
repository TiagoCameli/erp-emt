import type { IntervaloTipo } from "@/modules/manutencao/planos-preventivos/schemas";

/**
 * Previsão de manutenção preventiva. Lógica pura (sem banco, sem server-only),
 * extraída para teste. Regra fixa por intervalo: horímetro/km comparam a última
 * leitura com a base mais o intervalo; dias compara a data de hoje com a base
 * mais o intervalo em dias.
 */

/** Atividade de um plano, na ordem definida. */
export interface PlanoAtividade {
  id: string;
  descricao: string;
  intervaloTipo: IntervaloTipo;
  intervaloValor: number;
  ordem: number;
}

/** Última leitura por tipo de um equipamento. */
export interface UltimasLeituras {
  horimetro: number | null;
  km: number | null;
}

/** Base de cálculo da atribuição (leituras/data no último ciclo). */
export interface BaseAtribuicao {
  horimetro: number | null;
  km: number | null;
  data: string;
}

/** Previsão de uma atividade dentro de uma atribuição. */
export interface PrevisaoAtividade {
  descricao: string;
  intervaloTipo: IntervaloTipo;
  intervaloValor: number;
  /** Próxima marca: número (horímetro/km) ou data yyyy-MM-dd (dias). */
  proxima: number | null;
  proximaData: string | null;
  /**
   * Quanto falta: horas/km restantes, ou dias restantes. Negativo quando
   * vencido. null quando não dá para calcular (sem leitura ou sem base).
   */
  faltam: number | null;
  vencido: boolean;
  /** Sem leitura/base para calcular a previsão desta atividade. */
  semLeitura: boolean;
}

/** Soma `dias` a uma data yyyy-MM-dd e devolve outra data yyyy-MM-dd (UTC). */
export function somarDias(dataISO: string, dias: number): string {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const base = new Date(Date.UTC(ano, mes - 1, dia));
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

/** Diferença em dias inteiros entre duas datas yyyy-MM-dd (de - ate). */
export function diferencaDias(de: string, ate: string): number {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  const t1 = Date.UTC(a1, m1 - 1, d1);
  const t2 = Date.UTC(a2, m2 - 1, d2);
  return Math.round((t2 - t1) / 86_400_000);
}

/**
 * Calcula a previsão de uma atividade a partir da base da atribuição e da
 * última leitura do equipamento.
 */
export function preverAtividade(
  atividade: PlanoAtividade,
  base: BaseAtribuicao,
  ultimas: UltimasLeituras,
  hoje: string,
): PrevisaoAtividade {
  const comum = {
    descricao: atividade.descricao,
    intervaloTipo: atividade.intervaloTipo,
    intervaloValor: atividade.intervaloValor,
  };

  if (atividade.intervaloTipo === "horimetro" || atividade.intervaloTipo === "km") {
    const baseValor =
      atividade.intervaloTipo === "horimetro" ? base.horimetro : base.km;
    const ultimo =
      atividade.intervaloTipo === "horimetro" ? ultimas.horimetro : ultimas.km;
    if (baseValor === null || ultimo === null) {
      return { ...comum, proxima: null, proximaData: null, faltam: null, vencido: false, semLeitura: true };
    }
    const proxima = baseValor + atividade.intervaloValor;
    return {
      ...comum,
      proxima,
      proximaData: null,
      faltam: proxima - ultimo,
      vencido: ultimo >= proxima,
      semLeitura: false,
    };
  }

  // intervalo_tipo === "dias": base_data nunca é nula.
  const proximaData = somarDias(base.data, atividade.intervaloValor);
  const faltamDias = diferencaDias(hoje, proximaData);
  return {
    ...comum,
    proxima: null,
    proximaData,
    faltam: faltamDias,
    vencido: faltamDias <= 0,
    semLeitura: false,
  };
}
