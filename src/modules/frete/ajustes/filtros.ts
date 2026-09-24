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
