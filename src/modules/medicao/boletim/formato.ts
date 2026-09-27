import type { MedicaoBoletim } from "./tipos";

const formatadorPercentual = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * % do boletim com 2 casas. O texto vem pronto da RPC (acumulado / previsto no banco); o `Number`
 * aqui é só para o Intl desenhar o texto, nenhuma conta sai dele. Nulo (previsto zero ou contrato
 * sem regra de arredondamento) fica vazio.
 */
export function percentualExibicao(texto: string | null): string {
  if (texto === null || texto.trim() === "") return "";
  const numero = Number(texto);
  return Number.isNaN(numero) ? texto : formatadorPercentual.format(numero);
}

/** "yyyy-mm-dd" em partes, sem passar por Date (coluna `date`, sem fuso). */
function partes(data: string): { dia: string; mes: string; ano: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data);
  return m ? { ano: m[1], mes: m[2], dia: m[3] } : null;
}

/** "01/08 a 31/08/2026"; na virada de ano, o ano aparece nos dois lados. */
export function periodoMedicao(inicio: string, fim: string): string {
  const i = partes(inicio);
  const f = partes(fim);
  if (!i || !f) return `${inicio} a ${fim}`;
  const esquerda = i.ano === f.ano ? `${i.dia}/${i.mes}` : `${i.dia}/${i.mes}/${i.ano}`;
  return `${esquerda} a ${f.dia}/${f.mes}/${f.ano}`;
}

/** Rótulo da medição no seletor "Até a medição": "10ª (01/08 a 31/08/2026)". */
export function opcaoMedicao(m: Pick<MedicaoBoletim, "numero" | "periodo_inicio" | "periodo_fim">): string {
  return `${m.numero}ª (${periodoMedicao(m.periodo_inicio, m.periodo_fim)})`;
}
