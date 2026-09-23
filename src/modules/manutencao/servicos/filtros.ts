import { lerCatalogoDaUrl, UUID } from "@/modules/financeiro/_shared/listas-na-url";
import {
  STATUS_OS,
  TIPOS_OS,
  type StatusOs,
  type TipoOs,
} from "@/modules/manutencao/_shared/rotulos";

/**
 * Filtros do caderno de serviços: como saem da URL e como entram na consulta.
 *
 * Módulo puro de propósito: a página (servidor) lê daqui, a tabela (navegador)
 * usa as mesmas chaves, e a consulta da LISTA e a do TOTAL do período passam pelo
 * mesmo `aplicarFiltrosServicos`. Duas cópias do filtro divergiriam no primeiro
 * detalhe, e o total do rodapé passaria a somar outro conjunto que a lista.
 */

/** Chaves da URL. */
export const CHAVES_FILTRO_SERVICOS = {
  status: "status",
  equipamento: "equipamento",
  tipo: "tipo",
  conclusaoDe: "conclusaoDe",
  conclusaoAte: "conclusaoAte",
  busca: "busca",
  pagina: "pagina",
  tamanho: "tamanho",
} as const;

export interface FiltrosServicos {
  /** Página base 0 (na URL é base 1). */
  pagina: number;
  tamanho: number;
  /** Vazio = todos os status (as excluídas nunca entram). */
  status: StatusOs[];
  equipamentoId?: string;
  tipo?: TipoOs;
  /** Período de conclusão, yyyy-mm-dd (coluna `date`, sem conversão de fuso). */
  conclusaoDe?: string;
  conclusaoAte?: string;
  busca?: string;
}

export const TAMANHO_PADRAO_SERVICOS = 25;
/** Teto da página: ninguém lê mais que isso, e protege a consulta de URL maliciosa. */
export const TAMANHO_MAXIMO_SERVICOS = 200;

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
  // "2026-02-31" passa na regex e não é data: o Date rola para março.
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return undefined;
  }
  return bruto;
}

/** Lê e valida. Parâmetro inválido é ignorado, nunca vai para o banco. */
export function lerFiltrosServicos(params: Parametros): FiltrosServicos {
  const paginaParam = Number(texto(params.pagina));
  const pagina = Number.isInteger(paginaParam) && paginaParam > 0 ? paginaParam - 1 : 0;

  const tamanhoParam = Number(texto(params.tamanho));
  const tamanho =
    Number.isInteger(tamanhoParam) && tamanhoParam > 0
      ? Math.min(tamanhoParam, TAMANHO_MAXIMO_SERVICOS)
      : TAMANHO_PADRAO_SERVICOS;

  const equipamento = texto(params.equipamento);
  const tipo = texto(params.tipo);
  const busca = texto(params.busca)?.trim() ?? "";

  let conclusaoDe = data(params.conclusaoDe);
  let conclusaoAte = data(params.conclusaoAte);
  // Período invertido é trocado de lado, senão a lista vem vazia sem explicação.
  if (conclusaoDe && conclusaoAte && conclusaoDe > conclusaoAte) {
    [conclusaoDe, conclusaoAte] = [conclusaoAte, conclusaoDe];
  }

  return {
    pagina,
    tamanho,
    status: lerCatalogoDaUrl(params.status, STATUS_OS),
    equipamentoId: equipamento && UUID.test(equipamento) ? equipamento : undefined,
    tipo: tipo && (TIPOS_OS as readonly string[]).includes(tipo) ? (tipo as TipoOs) : undefined,
    conclusaoDe,
    conclusaoAte,
    busca: busca === "" ? undefined : busca,
  };
}

/** O pedaço do builder do PostgREST que o filtro usa (mesmo padrão de Pagamentos). */
export interface ConsultaFiltravelOs<T> {
  eq: (coluna: string, valor: string) => T;
  gte: (coluna: string, valor: string) => T;
  lte: (coluna: string, valor: string) => T;
  in: (coluna: string, valores: readonly string[]) => T;
  or: (filtro: string) => T;
}

/** Padrão ilike do termo, sem os caracteres que quebram o `or()` do PostgREST. */
export function padraoBuscaOs(termo: string): string {
  return `%${termo.replace(/[,()"'\\%*]/g, "").trim()}%`;
}

/**
 * Aplica os filtros na consulta. SÍNCRONA: o builder é thenable, e uma função
 * async o dispararia no return em vez de devolvê-lo.
 */
export function aplicarFiltrosServicos<T extends ConsultaFiltravelOs<T>>(
  consultaInicial: T,
  filtros: Omit<FiltrosServicos, "pagina" | "tamanho">,
): T {
  let consulta = consultaInicial;
  if (filtros.status.length > 0) consulta = consulta.in("status", filtros.status);
  if (filtros.equipamentoId) consulta = consulta.eq("equipamento_id", filtros.equipamentoId);
  if (filtros.tipo) consulta = consulta.eq("tipo", filtros.tipo);
  if (filtros.conclusaoDe) consulta = consulta.gte("data_conclusao", filtros.conclusaoDe);
  if (filtros.conclusaoAte) consulta = consulta.lte("data_conclusao", filtros.conclusaoAte);
  if (filtros.busca) {
    const padrao = padraoBuscaOs(filtros.busca);
    if (padrao !== "%%") {
      consulta = consulta.or(
        `numero.ilike.${padrao},numero_legado.ilike.${padrao},descricao.ilike.${padrao}`,
      );
    }
  }
  return consulta;
}
