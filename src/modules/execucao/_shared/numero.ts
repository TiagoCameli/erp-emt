import { CASAS_TAXA } from "@/lib/casas-decimais";

/**
 * Número que veio colado do Excel ou digitado na grade (pt-BR). Nunca adivinha: "1.234" pode ser mil
 * ou um vírgula duzentos e trinta e quatro, então vira erro e a pessoa escolhe.
 */
export function lerNumeroColado(
  texto: string,
  casas: number = CASAS_TAXA,
): { ok: true; valor: string | null } | { ok: false; erro: string } {
  const t = texto.trim().replace(/\s/g, "");
  if (t === "") return { ok: true, valor: null };
  let normal: string;
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(t) || /^-?\d+,\d+$/.test(t)) {
    normal = t.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    return { ok: false, erro: `Número ambíguo: ${texto.trim()}. Use vírgula para decimal (1,234) ou tire o ponto (1234)` };
  } else if (/^-?\d+(\.\d+)?$/.test(t)) {
    normal = t;
  } else {
    return { ok: false, erro: `Não é número: ${texto.trim()}` };
  }
  const fracao = normal.split(".")[1] ?? "";
  if (fracao.length > casas) return { ok: false, erro: `No máximo ${casas} casas decimais: ${texto.trim()}` };
  return { ok: true, valor: normal };
}
