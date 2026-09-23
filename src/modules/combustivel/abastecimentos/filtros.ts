import {
  CANAIS,
  ORIGENS_SAIDA,
  TIPOS_CONSUMIDOR,
  type Canal,
  type OrigemSaida,
  type TipoConsumidor,
} from "@/modules/combustivel/_shared/rotulos";
import { UUID } from "@/modules/financeiro/_shared/listas-na-url";

/**
 * Filtros da lista de abastecimentos: como saem da URL e como entram na consulta.
 *
 * Módulo puro: a página lê daqui, a tabela usa as mesmas chaves, e a consulta da
 * PÁGINA e a da SOMA passam pelo mesmo `aplicarFiltrosAbastecimentos`. Duas
 * cópias do filtro divergiriam, e o total do rodapé somaria outro conjunto.
 */

export const CHAVES_FILTRO_ABASTECIMENTOS = {
  de: "de",
  ate: "ate",
  tanque: "tanque",
  equipamento: "equipamento",
  transportadora: "transportadora",
  tipo: "tipo",
  origem: "origem",
  canal: "canal",
  excluidos: "excluidos",
  pagina: "pagina",
  tamanho: "tamanho",
} as const;

export interface FiltrosAbastecimentos {
  /** Página base 0 (na URL é base 1). */
  pagina: number;
  tamanho: number;
  /** Dia em Rio Branco, yyyy-mm-dd. */
  de?: string;
  ate?: string;
  tanqueId?: string;
  equipamentoId?: string;
  transportadoraId?: string;
  tipo?: TipoConsumidor;
  origem?: OrigemSaida;
  canal?: Canal;
  /**
   * "Mostrar excluídos": a lista mostra as da lixeira. A página só aceita para quem
   * pode restaurar; para o resto, o parâmetro é ignorado.
   */
  excluidos?: boolean;
}

export const TAMANHO_PADRAO_ABASTECIMENTOS = 50;
export const TAMANHO_MAXIMO_ABASTECIMENTOS = 200;

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

type Parametros = Record<string, string | string[] | undefined>;

function texto(valor: string | string[] | undefined): string | undefined {
  return typeof valor === "string" ? valor : undefined;
}

function data(valor: string | string[] | undefined): string | undefined {
  const bruto = texto(valor);
  if (!bruto || !DATA_ISO.test(bruto)) return undefined;
  const [ano, mes, dia] = bruto.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return undefined;
  return bruto;
}

function uuid(valor: string | string[] | undefined): string | undefined {
  const bruto = texto(valor);
  return bruto && UUID.test(bruto) ? bruto : undefined;
}

function catalogo<T extends string>(valor: string | string[] | undefined, lista: readonly T[]): T | undefined {
  const bruto = texto(valor);
  return bruto && (lista as readonly string[]).includes(bruto) ? (bruto as T) : undefined;
}

/** Lê e valida. Parâmetro inválido é ignorado, nunca vai para o banco. */
export function lerFiltrosAbastecimentos(params: Parametros): FiltrosAbastecimentos {
  const paginaParam = Number(texto(params.pagina));
  const pagina = Number.isInteger(paginaParam) && paginaParam > 0 ? paginaParam - 1 : 0;
  const tamanhoParam = Number(texto(params.tamanho));
  const tamanho =
    Number.isInteger(tamanhoParam) && tamanhoParam > 0
      ? Math.min(tamanhoParam, TAMANHO_MAXIMO_ABASTECIMENTOS)
      : TAMANHO_PADRAO_ABASTECIMENTOS;

  let de = data(params.de);
  let ate = data(params.ate);
  // Período invertido é trocado de lado, senão a lista vem vazia sem explicação.
  if (de && ate && de > ate) [de, ate] = [ate, de];

  return {
    pagina,
    tamanho,
    de,
    ate,
    tanqueId: uuid(params.tanque),
    equipamentoId: uuid(params.equipamento),
    transportadoraId: uuid(params.transportadora),
    tipo: catalogo(params.tipo, TIPOS_CONSUMIDOR),
    origem: catalogo(params.origem, ORIGENS_SAIDA),
    canal: catalogo(params.canal, CANAIS),
    excluidos: texto(params.excluidos) === "sim" ? true : undefined,
  };
}

/**
 * `?saida=<uuid>`: o link que outra tela (Anomalias) monta para abrir UM
 * abastecimento. Válido, a página redireciona para o detalhe; inválido, é
 * ignorado e a lista abre normal.
 */
export function lerSaidaDoLink(params: Parametros): string | null {
  return uuid(params.saida) ?? null;
}

/** Rota do detalhe do abastecimento. */
export function rotaDoAbastecimento(id: string): string {
  return `/combustivel/abastecimentos/${id}`;
}

/** Rio Branco é UTC-5 o ano todo: o dia local vira faixa de instantes. */
export function inicioDoDia(dia: string): string {
  return `${dia}T00:00:00-05:00`;
}

/** Fim exclusivo: o começo do dia seguinte em Rio Branco. */
export function inicioDoDiaSeguinte(dia: string): string {
  const [ano, mes, d] = dia.split("-").map(Number);
  const seguinte = new Date(Date.UTC(ano, mes - 1, d + 1));
  return `${seguinte.toISOString().slice(0, 10)}T00:00:00-05:00`;
}

export interface ConsultaFiltravelAbastecimentos<T> {
  eq: (coluna: string, valor: string) => T;
  gte: (coluna: string, valor: string) => T;
  lt: (coluna: string, valor: string) => T;
}

/**
 * Aplica os filtros. SÍNCRONA: o builder é thenable, e uma função async o
 * dispararia no return em vez de devolvê-lo.
 */
export function aplicarFiltrosAbastecimentos<T extends ConsultaFiltravelAbastecimentos<T>>(
  consultaInicial: T,
  filtros: Omit<FiltrosAbastecimentos, "pagina" | "tamanho" | "excluidos">,
): T {
  let consulta = consultaInicial;
  if (filtros.de) consulta = consulta.gte("data", inicioDoDia(filtros.de));
  if (filtros.ate) consulta = consulta.lt("data", inicioDoDiaSeguinte(filtros.ate));
  if (filtros.tanqueId) consulta = consulta.eq("tanque_id", filtros.tanqueId);
  if (filtros.equipamentoId) consulta = consulta.eq("equipamento_id", filtros.equipamentoId);
  if (filtros.transportadoraId) consulta = consulta.eq("transportadora_id", filtros.transportadoraId);
  if (filtros.tipo) consulta = consulta.eq("tipo_consumidor", filtros.tipo);
  if (filtros.origem) consulta = consulta.eq("origem", filtros.origem);
  if (filtros.canal) consulta = consulta.eq("canal", filtros.canal);
  return consulta;
}
