import { formatarData } from "@/lib/formatadores";

/** Dia (yyyy-mm-dd) de um instante no fuso de Rio Branco. */
function diaEmRioBranco(instante: string): string | null {
  const d = new Date(instante);
  if (Number.isNaN(d.getTime())) return null;
  // en-CA formata como yyyy-mm-dd.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Rio_Branco",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Desde quando a máquina está no estado, em dias de calendário de Rio Branco: "desde hoje",
 * "desde ontem" ou "desde 12/10/2026 · há 4 dias". O `dias_no_estado` da view conta 24 horas
 * corridas, e a US-001 marcada parada às 17h de 15/10 aparecia "há 0 dias" na manhã de 16/10.
 * `hoje` é o yyyy-mm-dd que o servidor manda (estado.hoje).
 */
export function textoDesde(
  estadoDesde: string | null,
  hoje: string,
): string | null {
  if (!estadoDesde) return null;
  const dia = diaEmRioBranco(estadoDesde);
  if (!dia) return null;
  const dias = Math.round(
    (Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${dia}T00:00:00Z`)) /
      86_400_000,
  );
  if (!Number.isFinite(dias)) return null;
  if (dias <= 0) return "desde hoje";
  if (dias === 1) return "desde ontem";
  return `desde ${formatarData(`${dia}T12:00:00Z`)} · há ${dias} dias`;
}
