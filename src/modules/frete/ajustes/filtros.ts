import { ehStatusAjuste, type StatusAjuste } from "@/modules/frete/ajustes/regras";
import { SINAIS_AJUSTE, type SinalAjuste } from "@/modules/frete/ajustes/schemas";

/**
 * Filtros da lista de ajustes, na URL. Módulo puro: a página lê, a tabela
 * escreve e o teste confere. Valor desconhecido é ignorado (link velho não
 * derruba a tela).
 */

export const CHAVES_FILTRO_AJUSTES = {
  transportadora: "transportadora",
  status: "status",
  sinal: "sinal",
  de: "de",
  ate: "ate",
} as const;

export interface FiltrosAjustes {
  transportadoraId?: string;
  status?: StatusAjuste;
  sinal?: SinalAjuste;
  /** AAAA-MM-DD, dia de Rio Branco. */
  de?: string;
  ate?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

function primeiro(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? "";
}

export function lerFiltrosAjustes(params: Record<string, string | string[] | undefined>): FiltrosAjustes {
  const transportadora = primeiro(params[CHAVES_FILTRO_AJUSTES.transportadora]);
  const status = primeiro(params[CHAVES_FILTRO_AJUSTES.status]);
  const sinal = primeiro(params[CHAVES_FILTRO_AJUSTES.sinal]);
  const de = primeiro(params[CHAVES_FILTRO_AJUSTES.de]);
  const ate = primeiro(params[CHAVES_FILTRO_AJUSTES.ate]);
  return {
    transportadoraId: UUID.test(transportadora) ? transportadora : undefined,
    status: ehStatusAjuste(status) ? status : undefined,
    sinal: (SINAIS_AJUSTE as readonly string[]).includes(sinal) ? (sinal as SinalAjuste) : undefined,
    de: DIA.test(de) ? de : undefined,
    ate: DIA.test(ate) ? ate : undefined,
  };
}

/** Link da lista já filtrada (o aviso de pendentes do extrato usa). */
export function rotaDosAjustes(filtros: FiltrosAjustes): string {
  const busca = new URLSearchParams();
  if (filtros.transportadoraId) busca.set(CHAVES_FILTRO_AJUSTES.transportadora, filtros.transportadoraId);
  if (filtros.status) busca.set(CHAVES_FILTRO_AJUSTES.status, filtros.status);
  if (filtros.sinal) busca.set(CHAVES_FILTRO_AJUSTES.sinal, filtros.sinal);
  if (filtros.de) busca.set(CHAVES_FILTRO_AJUSTES.de, filtros.de);
  if (filtros.ate) busca.set(CHAVES_FILTRO_AJUSTES.ate, filtros.ate);
  const texto = busca.toString();
  return texto ? `/frete/ajustes?${texto}` : "/frete/ajustes";
}

export function rotaDoAjuste(id: string): string {
  return `/frete/ajustes/${id}`;
}

/**
 * Início e fim do período em instante (a coluna `data` é timestamptz): o dia de
 * Rio Branco vai de 00:00 a 23:59:59.999 em UTC-5.
 */
export function limitesDoPeriodo(filtros: FiltrosAjustes): { desde?: string; antes?: string } {
  const proximoDia = (dia: string) => {
    const d = new Date(`${dia}T00:00:00-05:00`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString();
  };
  return {
    desde: filtros.de ? new Date(`${filtros.de}T00:00:00-05:00`).toISOString() : undefined,
    antes: filtros.ate ? proximoDia(filtros.ate) : undefined,
  };
}

/** O pedaço do builder do PostgREST que os filtros dos ajustes usam. */
interface ConsultaFiltravelAjustes<T> {
  eq: (coluna: string, valor: string) => T;
  gte: (coluna: string, valor: string) => T;
  lt: (coluna: string, valor: string) => T;
}

/**
 * Aplica os filtros da lista na consulta recebida. Serve a lista e as facetas
 * (`facetasAjustes`), que precisam do MESMO recorte. Síncrona: o builder é
 * "thenable" (ver `aplicarFiltrosPagas` em financeiro/pagamentos/filtros-pagas.ts).
 */
export function aplicarFiltrosAjustes<T extends ConsultaFiltravelAjustes<T>>(consultaInicial: T, filtros: FiltrosAjustes): T {
  const { desde, antes } = limitesDoPeriodo(filtros);
  let consulta = consultaInicial;
  if (filtros.transportadoraId) consulta = consulta.eq("transportadora_id", filtros.transportadoraId);
  if (filtros.status) consulta = consulta.eq("status", filtros.status);
  if (filtros.sinal) consulta = consulta.eq("sinal", filtros.sinal);
  if (desde) consulta = consulta.gte("data", desde);
  if (antes) consulta = consulta.lt("data", antes);
  return consulta;
}

/** Os filtros de seleção da lista de ajustes (o período restringe, mas não é facetado). */
export type FacetaAjustes = "transportadora" | "status" | "sinal";

/** O filtro que cada faceta solta quando calcula as próprias opções. */
export function filtrosSemFaceta(filtros: FiltrosAjustes, faceta: FacetaAjustes | null): FiltrosAjustes {
  if (faceta === "transportadora") return { ...filtros, transportadoraId: undefined };
  if (faceta === "status") return { ...filtros, status: undefined };
  if (faceta === "sinal") return { ...filtros, sinal: undefined };
  return filtros;
}
