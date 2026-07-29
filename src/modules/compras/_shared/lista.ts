import "server-only";

import { TZDate } from "@date-fns/tz";

import { mesParaCompetencia, TIMEZONE } from "@/lib/formatadores";
import type { createClient } from "@/lib/supabase/server";

/** Paginação, busca e filtros lidos dos searchParams de uma listagem de Compras. */
export interface ParametrosLista {
  /** Página base 0 (na URL o parâmetro `pagina` é base 1). */
  pagina: number;
  tamanho: number;
  busca?: string;
  /** Filtro por fornecedor (parâmetro `fornecedor`, uuid). */
  fornecedorId?: string;
  /** Início do período (parâmetro `de`, yyyy-mm-dd). */
  de?: string;
  /** Fim do período (parâmetro `ate`, yyyy-mm-dd). */
  ate?: string;
  /** Mês de referência (parâmetro `mes`, yyyy-MM na URL) como yyyy-MM-01. */
  mesCompetencia?: string;
}

const TAMANHO_PADRAO = 25;

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Data yyyy-mm-dd vinda da URL, ou undefined se não for uma data. */
export function parametroData(
  valor: string | string[] | undefined,
): string | undefined {
  if (typeof valor !== "string" || !DATA_ISO.test(valor)) return undefined;
  return Number.isNaN(new Date(valor).getTime()) ? undefined : valor;
}

/** Uuid vindo da URL, ou undefined. Evita mandar lixo pro filtro do PostgREST. */
export function parametroUuid(
  valor: string | string[] | undefined,
): string | undefined {
  return typeof valor === "string" && UUID.test(valor) ? valor : undefined;
}

/**
 * Instante UTC da meia-noite do dia informado, no fuso de exibição do sistema
 * (Rio Branco). Filtro de período em coluna `timestamptz` precisa disso: o dia
 * do usuário começa às 05:00 UTC, não às 00:00 UTC. Sem isso, um registro
 * criado de manhã em Rio Branco cairia no dia anterior do filtro.
 * Para coluna `date` (ex. data_compra) não use: lá a string crua já basta.
 */
export function inicioDoDiaISO(data: string, deslocamentoDias = 0): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new TZDate(ano, mes - 1, dia + deslocamentoDias, TIMEZONE).toISOString();
}

/** Mês do filtro (yyyy-MM na URL) como competência do banco (yyyy-MM-01). */
export function parametroMes(
  valor: string | string[] | undefined,
): string | undefined {
  if (typeof valor !== "string") return undefined;
  const competencia = mesParaCompetencia(valor);
  return competencia === "" ? undefined : competencia;
}

/** Lê e valida um parâmetro de filtro contra a lista de valores aceitos. */
export function parametroValido<T extends string>(
  valor: string | string[] | undefined,
  validos: readonly T[],
): T | undefined {
  if (typeof valor !== "string") return undefined;
  return (validos as readonly string[]).includes(valor)
    ? (valor as T)
    : undefined;
}

/**
 * Lê página (base 1 na URL), tamanho (padrão 25), termo de busca e os filtros
 * de fornecedor e período. Parâmetro inválido é ignorado, nunca vai pro banco.
 * Período invertido (de > ate) é trocado de lado, senão a lista vem vazia sem
 * explicação nenhuma pro usuário.
 */
export function lerParametrosLista(
  params: Record<string, string | string[] | undefined>,
): ParametrosLista {
  const paginaParam = Number(params.pagina);
  const pagina =
    Number.isInteger(paginaParam) && paginaParam > 0 ? paginaParam - 1 : 0;

  const tamanhoParam = Number(params.tamanho);
  const tamanho =
    Number.isInteger(tamanhoParam) && tamanhoParam > 0
      ? tamanhoParam
      : TAMANHO_PADRAO;

  const busca = typeof params.busca === "string" ? params.busca.trim() : "";

  let de = parametroData(params.de);
  let ate = parametroData(params.ate);
  if (de && ate && de > ate) [de, ate] = [ate, de];

  return {
    pagina,
    tamanho,
    busca: busca === "" ? undefined : busca,
    fornecedorId: parametroUuid(params.fornecedor),
    de,
    ate,
    mesCompetencia: parametroMes(params.mes),
  };
}

/**
 * Padrão ilike (%termo%) do termo de busca. Remove caracteres que quebram a
 * sintaxe dos filtros or() do PostgREST (vírgula, parênteses, aspas, barra).
 */
export function padraoBusca(termo: string): string {
  return `%${termo.replace(/[,()"'\\]/g, "").trim()}%`;
}

/** Máximo de fornecedores resolvidos por nome numa busca (limite do filtro in). */
const MAX_FORNECEDORES_BUSCA = 50;

/**
 * Ids de fornecedores cujo nome (razão social ou fantasia) bate com o padrão.
 * Permite busca server-side por fornecedor em listagens cuja tabela só guarda
 * o fornecedor_id (o or() do PostgREST não mistura colunas do pai com joins).
 */
export async function idsFornecedoresPorNome(
  supabase: Awaited<ReturnType<typeof createClient>>,
  padrao: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("fornecedores")
    .select("id")
    .or(`razao_social.ilike.${padrao},nome_fantasia.ilike.${padrao}`)
    .limit(MAX_FORNECEDORES_BUSCA);

  if (error) {
    throw new Error("Não foi possível aplicar a busca por fornecedor");
  }
  return (data ?? []).map((fornecedor) => fornecedor.id);
}
