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

/** Um formatador por número de casas decimais, montado sob demanda e reaproveitado. */
const formatadoresPercentual = new Map<number, Intl.NumberFormat>();

function formatadorPercentual(maximoCasas: number): Intl.NumberFormat {
  let formatador = formatadoresPercentual.get(maximoCasas);
  if (!formatador) {
    formatador = new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: maximoCasas,
    });
    formatadoresPercentual.set(maximoCasas, formatador);
  }
  return formatador;
}

/**
 * Formata um percentual em pt-BR com sufixo "%" (ex: "12,5%", "100%").
 * `maximoCasas` (padrão 2) limita as casas decimais exibidas — os encargos
 * da folha usam 3 (NUMERIC(6,3)), os demais percentuais do sistema usam 2.
 */
export function formatarPercentual(
  valor: number | string | null | undefined,
  maximoCasas = 2,
): string {
  if (valor === null || valor === undefined || valor === "") return "0%";
  const numero = typeof valor === "string" ? Number(valor) : valor;
  if (Number.isNaN(numero)) return "0%";
  return `${formatadorPercentual(maximoCasas).format(numero)}%`;
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

/**
 * Data (yyyy-MM-dd) no fuso de Rio Branco a partir de um timestamptz (ou
 * `Date`/string date-only). Usada para comparar uma coluna `timestamptz` (ex:
 * `aprovado_em`) contra um filtro de período que pensa em dia local, com
 * `noPeriodo` (`@/modules/rh/_shared/filtros`): sem essa conversão, um evento
 * às 19h+ em Rio Branco (já no dia seguinte em UTC) cairia no dia errado do
 * filtro, embora a coluna exibida (via `formatarData`) mostre o dia certo.
 */
export function dataLocalISO(
  data: Date | string | null | undefined,
): string | null {
  if (!data) return null;
  const d = paraDate(data);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, "yyyy-MM-dd", { in: tz(TIMEZONE) });
}

/**
 * Mês de referência (competência) sempre viaja em dois formatos:
 * "yyyy-MM" no input type="month" da tela e "yyyy-MM-01" no banco, que guarda
 * DATE normalizado no dia 1. As duas conversões ficam aqui para nenhuma tela
 * inventar a sua, e são puras (não dependem de fuso: só manipulam a string).
 */

/** "2026-07" -> "2026-07-01". String fora do formato volta vazia. */
export function mesParaCompetencia(mes: string): string {
  const limpo = (mes ?? "").trim();
  return /^\d{4}-\d{2}$/.test(limpo) ? `${limpo}-01` : "";
}

/** "2026-07-01" -> "2026-07". String fora do formato volta vazia. */
export function competenciaParaMes(competencia: string | null): string {
  const limpo = (competencia ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(limpo) ? limpo.slice(0, 7) : "";
}

/** "2026-07-01" -> "07/2026", para exibir em tabela e detalhe. */
export function formatarMesAno(competencia: string | null): string {
  const mes = competenciaParaMes(competencia);
  if (mes === "") return "";
  return `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
}

/** Mês de hoje (yyyy-MM) no fuso de Rio Branco, para default de input month. */
export function mesHojeISO(): string {
  return format(new Date(), "yyyy-MM", { in: tz(TIMEZONE) });
}

/**
 * "2026-07" -> "2026-08", virando o ano em dezembro. String fora do formato
 * volta vazia. Pura (só manipula a string, não depende de fuso), para telas
 * cujo default seguro é o mês seguinte, não o corrente: o mês corrente
 * normalmente já tem folha gerada.
 */
export function mesSeguinte(mes: string): string {
  const limpo = (mes ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(limpo)) return "";
  const ano = Number(limpo.slice(0, 4));
  const numero = Number(limpo.slice(5, 7));
  if (numero < 1 || numero > 12) return "";
  const proximoAno = numero === 12 ? ano + 1 : ano;
  const proximoMes = numero === 12 ? 1 : numero + 1;
  return `${String(proximoAno).padStart(4, "0")}-${String(proximoMes).padStart(2, "0")}`;
}

/**
 * Quantos dias atrás está uma data yyyy-MM-dd, contra hoje no fuso de Rio
 * Branco. Negativo quando a data é no futuro. Comparação por string de data,
 * sem hora, então não pula dia por fuso.
 */
export function diasAtras(data: string): number {
  const limpo = (data ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpo)) return 0;
  const umDia = 24 * 60 * 60 * 1000;
  const alvo = Date.parse(`${limpo}T00:00:00Z`);
  const hoje = Date.parse(`${dataHojeISO()}T00:00:00Z`);
  return Math.round((hoje - alvo) / umDia);
}
