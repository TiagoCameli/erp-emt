/**
 * Unidade normalizada para casar a linha do SIAC com o item da planilha: sem acento, minúscula, sem
 * espaço, ponto e barra, com ² e ³ virando 2 e 3 (NFKD). "T/KM" = "tkm", "UN/DIA" = "un.dia",
 * "M²" = "m²", "MES" = "mês". "und" e "unid" viram "un".
 */
export function normalizarUnidade(unidade: string | null | undefined): string {
  const base = (unidade ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s./]/g, "");
  return base === "und" || base === "unid" ? "un" : base;
}
