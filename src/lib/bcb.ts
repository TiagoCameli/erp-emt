/**
 * CDI do Banco Central (SGS). Duas séries:
 *
 * - **12**: CDI diário, % ao dia com 6 casas. É a que dá o % do CDI exato em
 *   qualquer período entre duas posições da aplicação (a posição raramente cai
 *   no último dia do mês).
 * - **4391**: CDI acumulado no mês, % com 2 casas. Conferência e reserva: se a
 *   diária falhar, a aba usa a mensal quando o período é o mês cheio.
 *
 * Conferido em 25/09/2026: a 12 composta no mês bate com a 4391 dentro do
 * arredondamento de 2 casas em jan a set/2026 (ago: 1,0931 contra 1,09).
 *
 * O mês corrente da 4391 é PARCIAL (acumulado até ontem), e vai marcado.
 */

const URL_SGS = "https://api.bcb.gov.br/dados/serie/bcdata.sgs";

export interface PontoSerieBcb {
  /** yyyy-MM-dd */
  data: string;
  valor: number;
}

export interface CargaCdi {
  diario: { data: string; taxa: number }[];
  mensal: { mes: string; taxa: number; parcial: boolean }[];
}

/** "02/01/2026" -> "2026-01-02". Qualquer outra coisa vira null. */
export function dataBcbParaIso(texto: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim());
  if (!m) return null;
  const [, dia, mes, ano] = m;
  const iso = `${ano}-${mes}-${dia}`;
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

/** "2026-09-25" -> "25/09/2026", o formato que a API do SGS pede na URL. */
export function isoParaDataBcb(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * Lê a resposta JSON do SGS (`[{ data: "dd/MM/yyyy", valor: "0.055131" }]`).
 * Linha com data ou valor inválido é DESCARTADA, não vira zero: CDI zero num dia
 * derrubaria o % do CDI do período inteiro sem ninguém perceber.
 */
export function lerSerieBcb(json: unknown): PontoSerieBcb[] {
  if (!Array.isArray(json)) {
    throw new Error("Resposta do Banco Central fora do formato esperado");
  }
  const pontos: PontoSerieBcb[] = [];
  for (const item of json) {
    if (typeof item !== "object" || item === null) continue;
    const { data, valor } = item as { data?: unknown; valor?: unknown };
    if (typeof data !== "string" || typeof valor !== "string") continue;
    const iso = dataBcbParaIso(data);
    const numero = Number(valor);
    if (!iso || valor.trim() === "" || !Number.isFinite(numero)) continue;
    pontos.push({ data: iso, valor: numero });
  }
  return pontos;
}

/**
 * Monta o que `fn_cdi_gravar` recebe. `hoje` é yyyy-MM-dd no fuso de Rio
 * Branco: o mês dele é o mês parcial da 4391.
 */
export function montarCargaCdi(
  diaria: PontoSerieBcb[],
  mensal: PontoSerieBcb[],
  hoje: string,
): CargaCdi {
  const mesCorrente = `${hoje.slice(0, 7)}-01`;
  return {
    diario: diaria.map((p) => ({ data: p.data, taxa: p.valor })),
    mensal: mensal.map((p) => ({
      mes: `${p.data.slice(0, 7)}-01`,
      taxa: p.valor,
      parcial: `${p.data.slice(0, 7)}-01` === mesCorrente,
    })),
  };
}

async function buscarSerie(serie: 12 | 4391, de: string, ate: string): Promise<PontoSerieBcb[]> {
  const url = `${URL_SGS}.${serie}/dados?formato=json&dataInicial=${isoParaDataBcb(de)}&dataFinal=${isoParaDataBcb(ate)}`;
  const resposta = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    headers: { accept: "application/json" },
  });
  if (!resposta.ok) {
    throw new Error(`Banco Central respondeu ${resposta.status} para a série ${serie}`);
  }
  return lerSerieBcb(await resposta.json());
}

/** Busca as duas séries entre `de` e `ate` (yyyy-MM-dd, inclusive). */
export async function buscarCdiBcb(de: string, ate: string, hoje: string): Promise<CargaCdi> {
  const [diaria, mensal] = await Promise.all([
    buscarSerie(12, de, ate),
    buscarSerie(4391, `${de.slice(0, 7)}-01`, ate),
  ]);
  return montarCargaCdi(diaria, mensal, hoje);
}
