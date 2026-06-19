import { format } from "date-fns";
import { tz, TZDate } from "@date-fns/tz";
import { ptBR } from "date-fns/locale";

/** Timezone de exibição de todo o sistema. Banco guarda UTC. */
export const TIMEZONE = "America/Rio_Branco";

const formatadorBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** R$ 1.234,56. Exibir sempre com tabular-nums e alinhado à direita. */
export function formatarBRL(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "R$ 0,00";
  const numero = typeof valor === "string" ? Number(valor) : valor;
  if (Number.isNaN(numero)) return "R$ 0,00";
  return formatadorBRL.format(numero);
}

const formatadorQuantidade = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

/** Quantidades com até 3 casas (NUMERIC(14,3) no banco). */
export function formatarQuantidade(
  valor: number | string | null | undefined,
): string {
  if (valor === null || valor === undefined || valor === "") return "0";
  const numero = typeof valor === "string" ? Number(valor) : valor;
  if (Number.isNaN(numero)) return "0";
  return formatadorQuantidade.format(numero);
}

const formatadorPercentual = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatarPercentual(
  valor: number | string | null | undefined,
): string {
  if (valor === null || valor === undefined || valor === "") return "0%";
  const numero = typeof valor === "string" ? Number(valor) : valor;
  if (Number.isNaN(numero)) return "0%";
  return `${formatadorPercentual.format(numero)}%`;
}

/** Strings date-only do Postgres (coluna `date`), ex: "2026-06-12". */
const DATA_SO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Converte a entrada num Date. Strings date-only (sem hora) o JS parseia como
 * UTC meia-noite e, ao formatar em Rio Branco (UTC-5), caem no dia anterior.
 * Para essas, ancora na meia-noite de Rio Branco (independe do fuso do host,
 * ex: Vercel em UTC), preservando o dia literal. Strings com timestamptz
 * (com hora/Z) seguem como UTC, convertidas pelo fuso na exibição.
 */
function paraDate(data: Date | string): Date {
  if (typeof data !== "string") return data;
  if (DATA_SO_DIA.test(data)) {
    const [ano, mes, dia] = data.split("-").map(Number);
    return new TZDate(ano, mes - 1, dia, TIMEZONE);
  }
  return new Date(data);
}

/** dd/MM/yyyy no fuso de Rio Branco. */
export function formatarData(data: Date | string | null | undefined): string {
  if (!data) return "";
  const d = paraDate(data);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "dd/MM/yyyy", { in: tz(TIMEZONE), locale: ptBR });
}

/** dd/MM/yyyy HH:mm no fuso de Rio Branco. */
export function formatarDataHora(
  data: Date | string | null | undefined,
): string {
  if (!data) return "";
  const d = paraDate(data);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "dd/MM/yyyy HH:mm", { in: tz(TIMEZONE), locale: ptBR });
}

/**
 * Data de hoje (yyyy-MM-dd) no fuso de Rio Branco, para default de input date.
 * Usa o fuso do sistema, não o ISO em UTC, para não pular um dia à noite.
 */
export function dataHojeISO(): string {
  return format(new Date(), "yyyy-MM-dd", { in: tz(TIMEZONE) });
}
