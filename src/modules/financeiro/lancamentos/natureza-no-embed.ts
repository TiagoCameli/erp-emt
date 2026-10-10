/**
 * O filtro de NATUREZA da lista de lançamentos, pela categoria do RATEIO.
 *
 * ## Por que pelo rateio
 *
 * Desde a decisão D4 (03/10/2026), "entra no resultado?" é medido em todas as
 * funções de resultado por `coalesce(r.categoria_id, l.categoria_id)`: a
 * categoria do rateio, caindo na do lançamento quando o rateio não tem. Os
 * R$ 1,32 mi de "Investimentos" de 2026 só existem na categoria do RATEIO (o
 * lançamento diz outra coisa), e 911 dos 7.507 rateios não têm categoria
 * nenhuma (medido em 03/10/2026). Filtrar pela categoria do lançamento abriria,
 * no clique de um relatório de custo, uma lista com a escavadeira que a célula
 * não somou.
 *
 * ## Como, sem lista de ids
 *
 * Pelo mesmo caminho do filtro de centro de custo: o rateio é EMBED, e o embed
 * filtrado vira condição do pai pelo `not.is.null`. Aqui são dois embeds
 * aliasados da mesma tabela, porque a regra tem dois ramos:
 *
 *   existe rateio COM categoria aceita                       (ramo 1)
 *   OU existe rateio SEM categoria E o lançamento tem uma aceita (ramo 2)
 *
 * O ramo 2 compara a categoria do PAI, que nenhum filtro de embed alcança, então
 * os dois ramos se juntam num `or` do topo, que o PostgREST aceita com embed
 * dentro (`or=(a.not.is.null,and(b.not.is.null,categoria_id...))`).
 *
 * Viaja na URL a lista MAIS CURTA: as recusadas (`not.in`) quando o corte é
 * `sem_movimentacao`/`sem_investimento` (7 hoje, contra mais de cem aceitas), e
 * as aceitas (`in`) quando o pedido é uma natureza só, como no drill do DRE.
 * Mandar as recusadas nesse caso poria uns cem uuids duas vezes na URL e passaria
 * dos 8 KB que proxy e CDN cortam (ver `lib/lotes-de-ids.ts`).
 *
 * Os embeds existem SÓ para filtrar, como `recorte_parcelas`: o
 * `lancamento_rateios` do select continua inteiro, porque é ele que dá nome à
 * coluna Centro de custo.
 *
 * Módulo puro: nada de banco, nada de React.
 */

/** As naturezas de categoria financeira, como o banco as aceita. */
export const NATUREZAS_CATEGORIA = [
  "operacional",
  "financeira",
  "movimentacao",
  "investimento",
  "distribuicao",
  "mutuo",
] as const;

/**
 * Fora do resultado como a movimentação: retirada de sócio (D3) e mútuo com
 * empresa ligada (D4). `sem_movimentacao=1` tira os três; não há parâmetro
 * próprio porque nenhuma tela quer custo com retirada de sócio dentro.
 */
const SAEM_COM_A_MOVIMENTACAO: readonly NaturezaCategoria[] = ["movimentacao", "distribuicao", "mutuo"];

export type NaturezaCategoria = (typeof NATUREZAS_CATEGORIA)[number];

/** O que a URL pediu sobre natureza. */
export interface PedidoDeNatureza {
  /** `natureza=` (lista). Vazio = todas. */
  naturezas?: readonly NaturezaCategoria[];
  /** `sem_movimentacao=1`. */
  semMovimentacao?: boolean;
  /** `sem_investimento=1`. */
  semInvestimento?: boolean;
}

/**
 * As naturezas aceitas, juntando os três parâmetros. `null` = nenhum deles veio,
 * e a lista não filtra natureza nenhuma.
 *
 * Os três se COMBINAM (interseção), em vez de um mandar no outro: um link que
 * peça `natureza=movimentacao&sem_movimentacao=1` é contraditório e a resposta
 * honesta é a lista vazia, não ignorar metade do pedido.
 */
export function naturezasAceitas(
  pedido: PedidoDeNatureza,
): NaturezaCategoria[] | null {
  const escolhidas = pedido.naturezas?.length ? pedido.naturezas : null;
  if (!escolhidas && !pedido.semMovimentacao && !pedido.semInvestimento) {
    return null;
  }
  return (escolhidas ?? NATUREZAS_CATEGORIA).filter(
    (natureza) =>
      !(pedido.semMovimentacao && SAEM_COM_A_MOVIMENTACAO.includes(natureza)) &&
      !(pedido.semInvestimento && natureza === "investimento"),
  );
}

/** Uma categoria do cadastro, só com o que este filtro precisa. */
export interface CategoriaComNatureza {
  id: string;
  natureza: string | null;
}

/** O filtro pronto para a consulta. */
export interface FiltroDeNatureza {
  /** Categorias cuja natureza NÃO foi aceita. */
  recusadas: string[];
  /** Categorias cuja natureza foi aceita. */
  aceitas: string[];
  /**
   * Rateio e lançamento SEM categoria contam como `operacional` (é o
   * `coalesce(cat.natureza, 'operacional')` das funções). Aceito quando a
   * natureza operacional está entre as aceitas.
   */
  semCategoriaAceita: boolean;
}

/**
 * Traduz as naturezas aceitas na lista de categorias recusadas.
 *
 * Natureza que o cadastro tiver e esta lista não conhecer é RECUSADA quando há
 * filtro: um link de custo que trouxesse natureza nova sem ninguém decidir se ela
 * é resultado abriria linha que a célula, pela regra do banco, também não somou.
 * Categoria com natureza nula é tratada como operacional, igual ao banco.
 */
export function filtroDeNatureza(
  aceitas: readonly NaturezaCategoria[],
  categorias: readonly CategoriaComNatureza[],
): FiltroDeNatureza {
  const aceitasTexto = aceitas as readonly string[];
  const aceita = (categoria: CategoriaComNatureza) =>
    aceitasTexto.includes(categoria.natureza ?? "operacional");
  return {
    recusadas: categorias
      .filter((categoria) => !aceita(categoria))
      .map((categoria) => categoria.id),
    aceitas: categorias.filter(aceita).map((categoria) => categoria.id),
    semCategoriaAceita: aceitasTexto.includes("operacional"),
  };
}

/** Os dois embeds aliasados de `lancamento_rateios` que o filtro usa. */
export const EMBED_RATEIO_COM_CATEGORIA = "natureza_rateios";
export const EMBED_RATEIO_SEM_CATEGORIA = "natureza_rateios_herdados";

/** O trecho do `select` que os dois embeds precisam (só para filtrar). */
export const SELECT_NATUREZA = `${EMBED_RATEIO_COM_CATEGORIA}:lancamento_rateios(id), ${EMBED_RATEIO_SEM_CATEGORIA}:lancamento_rateios(id)`;

/** O pedaço do builder do PostgREST que este filtro usa. */
export interface ConsultaComNatureza<T> {
  is: (coluna: string, valor: null) => T;
  not: (coluna: string, operador: string, valor: string | null) => T;
  or: (filtro: string, opcoes?: { referencedTable?: string }) => T;
  filter: (coluna: string, operador: string, valor: string) => T;
}

/**
 * A lista de categorias que vai na URL, a mais curta das duas. `in` com as
 * aceitas só quando ela é menor E não vazia: `in.()` é sintaxe inválida.
 */
function listaMaisCurta(
  filtro: FiltroDeNatureza,
): { operador: "in" | "not.in"; lista: string } | null {
  if (filtro.aceitas.length > 0 && filtro.aceitas.length < filtro.recusadas.length) {
    return { operador: "in", lista: `(${filtro.aceitas.join(",")})` };
  }
  if (filtro.recusadas.length === 0) return null;
  return { operador: "not.in", lista: `(${filtro.recusadas.join(",")})` };
}

/**
 * A condição do PAI no ramo 2: a categoria do lançamento é aceita.
 *
 * `null` quando qualquer categoria do pai serve (nada recusado e sem categoria
 * aceito), e aí o ramo 2 é só "existe rateio sem categoria".
 */
function categoriaDoPaiAceita(filtro: FiltroDeNatureza): string | null {
  const corte = listaMaisCurta(filtro);
  if (!corte) {
    return filtro.semCategoriaAceita ? null : "categoria_id.not.is.null";
  }
  // `in`/`not.in` sozinho recusa o nulo (em SQL, `null not in (...)` é nulo), e
  // é exatamente o que se quer quando a operacional NÃO foi aceita.
  const condicao = `categoria_id.${corte.operador}.${corte.lista}`;
  return filtro.semCategoriaAceita
    ? `or(categoria_id.is.null,${condicao})`
    : condicao;
}

/**
 * Aplica o filtro de natureza na consulta da lista.
 *
 * Síncrona de propósito, como `aplicarRecorteNoEmbed`: o builder do PostgREST é
 * "thenable", e uma função async o dispararia no return.
 */
export function aplicarNaturezaNoRateio<T extends ConsultaComNatureza<T>>(
  consultaInicial: T,
  filtro: FiltroDeNatureza,
): T {
  let consulta = consultaInicial;
  const comCategoria = EMBED_RATEIO_COM_CATEGORIA;
  const semCategoria = EMBED_RATEIO_SEM_CATEGORIA;

  // Ramo 1: o rateio tem categoria, e ela é aceita.
  consulta = consulta.not(`${comCategoria}.categoria_id`, "is", null);
  const corte = listaMaisCurta(filtro);
  if (corte?.operador === "in") {
    consulta = consulta.filter(`${comCategoria}.categoria_id`, "in", corte.lista);
  } else if (corte) {
    consulta = consulta.not(`${comCategoria}.categoria_id`, "in", corte.lista);
  }
  // Ramo 2: o rateio herda a categoria do lançamento.
  consulta = consulta.is(`${semCategoria}.categoria_id`, null);

  const doPai = categoriaDoPaiAceita(filtro);
  const ramo2 = doPai
    ? `and(${semCategoria}.not.is.null,${doPai})`
    : `${semCategoria}.not.is.null`;
  return consulta.or(`${comCategoria}.not.is.null,${ramo2}`);
}
