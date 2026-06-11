import { format } from "date-fns";
import { tz } from "@date-fns/tz";
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

/** dd/MM/yyyy no fuso de Rio Branco. */
export function formatarData(data: Date | string | null | undefined): string {
  if (!data) return "";
  const d = typeof data === "string" ? new Date(data) : data;
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "dd/MM/yyyy", { in: tz(TIMEZONE), locale: ptBR });
}

/** dd/MM/yyyy HH:mm no fuso de Rio Branco. */
export function formatarDataHora(
  data: Date | string | null | undefined,
): string {
  if (!data) return "";
  const d = typeof data === "string" ? new Date(data) : data;
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "dd/MM/yyyy HH:mm", { in: tz(TIMEZONE), locale: ptBR });
}
