import {
  CANAIS,
  ORIGENS_SAIDA,
  type Canal,
  type OrigemSaida,
  type TipoConsumidor,
} from "@/modules/combustivel/_shared/rotulos";
import { lerCatalogoDaUrl, lerListaDaUrl, lerUuidsDaUrl, UUID } from "@/modules/financeiro/_shared/listas-na-url";

/**
 * Filtros da lista de Saídas (abastecimentos): como saem da URL e como entram na consulta.
 *
 * Módulo puro: a página lê daqui, a tabela usa as mesmas chaves, e a consulta da
 * PÁGINA, a da SOMA e as das CONTAGENS das sub-abas passam pelo mesmo
 * `aplicarFiltrosAbastecimentos`. Duas cópias do filtro divergiriam, e o resumo acima
 * da tabela somaria outro conjunto.
 *
 * Três camadas, como na origem (SaidaCombustivelListV2 dentro do container):
 * 1. O recorte do cabeçalho do módulo (`modo`, `de`, `ate`, obra, equipamento, tanque,
 *    combustível, operador, transportadora, placa), que viaja de uma aba para outra.
 *    O modo decide o tipo de consumidor: próprios = equipamento da EMT, carretas =
 *    carreta de transportadora.
 * 2. A sub-aba (Todas / Internas / Externas) e, em Externas, as origens marcadas.
 * 3. Os filtros próprios da lista no ERP (origem, canal, "Mostrar excluídos").
 */

export const CHAVES_FILTRO_ABASTECIMENTOS = {
  modo: "modo",
  de: "de",
  ate: "ate",
  obra: "obra",
  equipamento: "equipamento",
  tanque: "tanque",
  combustivel: "combustivel",
  operador: "operador",
  transportadora: "transportadora",
  placa: "placa",
  visao: "visao",
  externa: "externa",
  origem: "origem",
  canal: "canal",
  excluidos: "excluidos",
  pagina: "pagina",
  tamanho: "tamanho",
  ordem: "ordem",
  direcao: "direcao",
} as const;

/**
 * Colunas que ordenam no servidor (a lista é paginada lá): id da coluna na tela -> coluna
 * no banco. Padrão: data, da mais nova para a mais antiga, como a origem abre.
 */
export const ORDENS_SAIDA = { data: "data", litros: "litros", valorTotal: "valor_total" } as const;
export type OrdemSaida = keyof typeof ORDENS_SAIDA;
const IDS_ORDEM = Object.keys(ORDENS_SAIDA) as OrdemSaida[];

/** Os dois mundos do cabeçalho (o ModeSwitch da origem). */
export const MODOS_SAIDA = ["proprios", "carretas"] as const;
export type ModoSaida = (typeof MODOS_SAIDA)[number];

export const TIPO_DO_MODO: Record<ModoSaida, TipoConsumidor> = {
  proprios: "equipamento_proprio",
  carretas: "carreta_transportadora",
};

/**
 * As sub-abas de Saídas da origem (`SaidasView`):
 * - internas = do tanque, e o tanque é da EMT;
 * - externas = do posto (dinheiro ou requisição) ou de tanque de terceiro.
 */
export const VISOES_SAIDA = ["todas", "internas", "externas"] as const;
export type VisaoSaida = (typeof VISOES_SAIDA)[number];

export const ROTULO_VISAO: Record<VisaoSaida, string> = {
  todas: "Todas",
  internas: "Internas",
  externas: "Externas",
};

/** O subconjunto de Externas (`OrigemExterna` da origem). Vazio = as três. */
export const ORIGENS_EXTERNAS = ["dinheiro", "requisicao", "tanque_externo"] as const;
export type OrigemExterna = (typeof ORIGENS_EXTERNAS)[number];

export const ROTULO_ORIGEM_EXTERNA: Record<OrigemExterna, string> = {
  dinheiro: "Dinheiro",
  requisicao: "Requisição",
  tanque_externo: "Tanque Externo",
};

export interface FiltrosAbastecimentos {
  /** Página base 0 (na URL é base 1). */
  pagina: number;
  tamanho: number;
  modo: ModoSaida;
  /** Sempre o do modo: a lista nunca mistura próprios com carretas. */
  tipo: TipoConsumidor;
  /** Dia em Rio Branco, yyyy-mm-dd. */
  de?: string;
  ate?: string;
  obraIds: string[];
  equipamentoIds: string[];
  tanqueIds: string[];
  combustivelIds: string[];
  operadores: string[];
  transportadoraIds: string[];
  placas: string[];
  visao: VisaoSaida;
  origensExternas: OrigemExterna[];
  origem?: OrigemSaida;
  canal?: Canal;
  /**
   * "Mostrar excluídos": a lista mostra as da lixeira. A página só aceita para quem
   * pode restaurar; para o resto, o parâmetro é ignorado.
   */
  excluidos?: boolean;
  ordem: OrdemSaida;
  direcao: "asc" | "desc";
}

/** 25 por página, como a lista da origem. */
export const TAMANHO_PADRAO_ABASTECIMENTOS = 25;
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

function catalogo<T extends string>(valor: string | string[] | undefined, lista: readonly T[]): T | undefined {
  const bruto = texto(valor);
  return bruto && (lista as readonly string[]).includes(bruto) ? (bruto as T) : undefined;
}

/** Texto livre (placa, operador): não vazio e curto. */
function textoLivre(item: string): boolean {
  return item.length > 0 && item.length <= 80;
}

export interface OpcoesLeitura {
  /**
   * Período quando a URL não traz nenhum (a origem abre nos últimos 30 dias, como o
   * painel do módulo). Sem ele, sem período.
   */
  periodoPadrao?: { de: string; ate: string };
}

/** Lê e valida. Parâmetro inválido é ignorado, nunca vai para o banco. */
export function lerFiltrosAbastecimentos(params: Parametros, opcoes: OpcoesLeitura = {}): FiltrosAbastecimentos {
  const paginaParam = Number(texto(params.pagina));
  const pagina = Number.isInteger(paginaParam) && paginaParam > 0 ? paginaParam - 1 : 0;
  const tamanhoParam = Number(texto(params.tamanho));
  const tamanho =
    Number.isInteger(tamanhoParam) && tamanhoParam > 0
      ? Math.min(tamanhoParam, TAMANHO_MAXIMO_ABASTECIMENTOS)
      : TAMANHO_PADRAO_ABASTECIMENTOS;

  let de = data(params.de);
  let ate = data(params.ate);
  if (!de && !ate && opcoes.periodoPadrao) ({ de, ate } = opcoes.periodoPadrao);
  // Período invertido é trocado de lado, senão a lista vem vazia sem explicação.
  if (de && ate && de > ate) [de, ate] = [ate, de];

  const modo = catalogo(params.modo, MODOS_SAIDA) ?? "proprios";
  const visao = catalogo(params.visao, VISOES_SAIDA) ?? "todas";

  return {
    pagina,
    tamanho,
    modo,
    tipo: TIPO_DO_MODO[modo],
    de,
    ate,
    obraIds: lerUuidsDaUrl(params.obra),
    // Equipamento só existe em próprios; transportadora e placa, só em carretas (a troca
    // de modo no cabeçalho já limpa, e link antigo não filtra às cegas).
    equipamentoIds: modo === "proprios" ? lerUuidsDaUrl(params.equipamento) : [],
    tanqueIds: lerUuidsDaUrl(params.tanque),
    combustivelIds: lerUuidsDaUrl(params.combustivel),
    operadores: lerListaDaUrl(params.operador, textoLivre),
    transportadoraIds: modo === "carretas" ? lerUuidsDaUrl(params.transportadora) : [],
    placas: modo === "carretas" ? lerListaDaUrl(params.placa, textoLivre) : [],
    visao,
    origensExternas: visao === "externas" ? lerCatalogoDaUrl(params.externa, ORIGENS_EXTERNAS) : [],
    origem: catalogo(params.origem, ORIGENS_SAIDA),
    canal: catalogo(params.canal, CANAIS),
    excluidos: texto(params.excluidos) === "sim" ? true : undefined,
    ordem: catalogo(params.ordem, IDS_ORDEM) ?? "data",
    direcao: texto(params.direcao) === "asc" ? "asc" : "desc",
  };
}

/**
 * `?saida=<uuid>`: o link que outra tela (Anomalias) monta para abrir UM
 * abastecimento. Válido, a página redireciona para o detalhe; inválido, é
 * ignorado e a lista abre normal.
 */
export function lerSaidaDoLink(params: Parametros): string | null {
  const bruto = texto(params.saida);
  return bruto && UUID.test(bruto) ? bruto : null;
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

/** Condição que nunca casa (o id é chave primária, nunca nulo). */
const NUNCA = "id.is.null";

/**
 * O `or` do PostgREST da sub-aba Externas: posto (dinheiro, requisição) ou tanque de
 * terceiro. `idsExternos` são os tanques de terceiro. Pura, para o teste fixar a string.
 */
export function condicaoExternas(origens: readonly OrigemExterna[], idsExternos: readonly string[]): string {
  const escolhidas = origens.length > 0 ? origens : ORIGENS_EXTERNAS;
  const partes: string[] = [];
  const postos = escolhidas.filter((o): o is "dinheiro" | "requisicao" => o !== "tanque_externo");
  if (postos.length > 0) partes.push(`origem.in.(${postos.join(",")})`);
  if (escolhidas.includes("tanque_externo") && idsExternos.length > 0) {
    partes.push(`and(origem.eq.tanque,tanque_id.in.(${idsExternos.join(",")}))`);
  }
  return partes.length > 0 ? partes.join(",") : NUNCA;
}

/**
 * Embed apelidado que filtra por obra (a obra é o centro da alocação). Vai SEMPRE no
 * select, sem `!inner`: com o filtro ligado, o `filtro_obra=not.is.null` faz dele um
 * inner join; desligado, não corta a saída sem alocação. O select fica literal (o tipo
 * da linha sai dele).
 */
export const EMBED_FILTRO_OBRA = "filtro_obra:abastecimento_alocacoes(centro_custo_id)";

export interface ConsultaFiltravelAbastecimentos<T> {
  eq: (coluna: string, valor: string) => T;
  gte: (coluna: string, valor: string) => T;
  lt: (coluna: string, valor: string) => T;
  in: (coluna: string, valores: readonly string[]) => T;
  or: (filtros: string) => T;
  filter: (coluna: string, operador: string, valor: unknown) => T;
}

/** O que o filtro precisa além da URL: os tanques de terceiro, para as sub-abas. */
export interface ContextoFiltro {
  idsTanquesExternos: readonly string[];
}

/**
 * Aplica os filtros. SÍNCRONA: o builder é thenable, e uma função async o
 * dispararia no return em vez de devolvê-lo. `visao` separada para as contagens das
 * sub-abas reusarem o resto do filtro. Filtro de obra exige `EMBED_FILTRO_OBRA` no
 * select.
 */
export function aplicarFiltrosAbastecimentos<T extends ConsultaFiltravelAbastecimentos<T>>(
  consultaInicial: T,
  filtros: Omit<FiltrosAbastecimentos, "pagina" | "tamanho" | "excluidos" | "modo" | "ordem" | "direcao">,
  contexto: ContextoFiltro,
  visao: VisaoSaida = filtros.visao,
): T {
  let consulta = consultaInicial.eq("tipo_consumidor", filtros.tipo);
  if (filtros.de) consulta = consulta.gte("data", inicioDoDia(filtros.de));
  if (filtros.ate) consulta = consulta.lt("data", inicioDoDiaSeguinte(filtros.ate));
  if (filtros.obraIds.length > 0) {
    consulta = consulta.in("filtro_obra.centro_custo_id", filtros.obraIds).filter("filtro_obra", "not.is", null);
  }
  if (filtros.equipamentoIds.length > 0) consulta = consulta.in("equipamento_id", filtros.equipamentoIds);
  if (filtros.tanqueIds.length > 0) consulta = consulta.in("tanque_id", filtros.tanqueIds);
  if (filtros.combustivelIds.length > 0) consulta = consulta.in("insumo_id", filtros.combustivelIds);
  if (filtros.operadores.length > 0) consulta = consulta.in("motorista", filtros.operadores);
  if (filtros.transportadoraIds.length > 0) consulta = consulta.in("transportadora_id", filtros.transportadoraIds);
  if (filtros.placas.length > 0) consulta = consulta.in("placa", filtros.placas);
  if (filtros.origem) consulta = consulta.eq("origem", filtros.origem);
  if (filtros.canal) consulta = consulta.eq("canal", filtros.canal);

  if (visao === "internas") {
    consulta = consulta.eq("origem", "tanque").filter("tanque_id", "not.is", null);
    if (contexto.idsTanquesExternos.length > 0) {
      consulta = consulta.filter("tanque_id", "not.in", `(${contexto.idsTanquesExternos.join(",")})`);
    }
  } else if (visao === "externas") {
    consulta = consulta.or(condicaoExternas(filtros.origensExternas, contexto.idsTanquesExternos));
  }
  return consulta;
}

