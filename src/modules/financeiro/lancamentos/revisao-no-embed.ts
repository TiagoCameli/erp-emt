import type { FiltroRevisao } from "@/modules/financeiro/lancamentos/schemas";

/**
 * O filtro de REVISÃO da listagem de lançamentos traduzido em filtro de EMBED,
 * em vez de lista de ids.
 *
 * ## O defeito que isto conserta
 *
 * `idsPorRevisao` lia as parcelas todas, classificava cada lançamento em
 * `sem_conta`/`parcial`/`revisado` na memória do servidor e devolvia os ids do
 * estado pedido para um `id=in.(...)` no PostgREST. Isso viaja na query string de
 * um GET, 37 caracteres por uuid.
 *
 * Medido no banco em 03/09/2026, sobre os lançamentos A PAGAR:
 *
 * - `revisado`     = **6.106** lançamentos -> **~226 KB de URL**
 * - `parcial`      = 1
 * - `sem_conta`    = 0
 * - `nao_revisado` = 1 (o complemento de `revisado`)
 *
 * A faixa medida em 20/08/2026 (ver `filtro-centro-sem-url-gigante.test.ts`) diz
 * o que acontece com 226 KB: 1.115 ids já dão HTTP 400, 1.753 dão 520 e a partir
 * de ~1.871 **a requisição não completa e não deixa log em lugar nenhum** — nem
 * no `edge_logs`, nem no `postgres_logs`. Na tela é só "Algo deu errado ao
 * carregar esta tela", com o digest do Next, que não diz nada.
 *
 * Foi exatamente o que aconteceu: escolher "Revisado" no filtro derrubava a
 * página inteira, porque `listarLancamentos` é `await`ado direto no Server
 * Component (os cartões estão em Suspense, a lista não).
 *
 * **O `revisado` não tinha como não estourar.** Ele é quase a base inteira: 6.106
 * de 6.107. E trocar por lista do COMPLEMENTO não salva — os dois são complemento
 * um do outro dentro de `a_pagar`, então basta a empresa parar de informar conta
 * bancária para o lado pequeno virar o lado grande. Quem tem que responder é o
 * banco.
 *
 * ## Por que embed, e por que DOIS
 *
 * O estado de revisão é um agregado sobre as parcelas ("todas resolvidas",
 * "nenhuma", "algumas"), e agregado não se expressa com um `!inner`. Mas ele se
 * expressa com duas perguntas de existência, e essas o PostgREST responde:
 *
 * - `revisao_pendentes`  -> existe parcela PENDENTE (sem conta e não paga)?
 * - `revisao_resolvidas` -> existe parcela RESOLVIDA (com conta ou paga)?
 *
 * | estado         | pendentes | resolvidas |
 * | -------------- | --------- | ---------- |
 * | `revisado`     | vazio     | tem        |
 * | `sem_conta`    | tem       | vazio      |
 * | `parcial`      | tem       | tem        |
 * | `nao_revisado` | tem       | -          |
 * | `em_revisao`   | tem (¹)   | -          |
 *
 * (¹) `em_revisao` é STATUS de parcela, não estado de conta: a sonda de pendentes
 * troca o filtro por `status.eq.em_revisao` e o tipo do lançamento não entra.
 *
 * "tem" é o par `filtro no embed` + `embed=not.is.null`, que este arquivo já usa
 * para o centro de custo e para o recorte. "vazio" é o mesmo par com
 * `embed=is.null`, o anti-join que Cotações usa em "sem OC gerada" e Ordens em
 * "sem nota fiscal". Cada alias é subconsulta lateral independente, então nenhuma
 * das duas mexe no `count: "exact"` nem multiplica a linha do lançamento.
 *
 * O `resolvidas` na linha do `revisado` não é enfeite: ele é o que exige
 * `total > 0`. Sem ele, lançamento SEM NENHUMA parcela passaria por "não tem
 * parcela pendente" e entraria em Revisado — e na coluna da tela ele aparece como
 * "-" (`nao-se-aplica`), porque `idsPorRevisao` só conhecia lançamento com
 * parcela. Filtro e coluna divergindo é o defeito que esta tela não pode ter.
 *
 * ## O que NÃO muda de lugar
 *
 * O embed `lancamento_parcelas` do `select` continua inteiro e sem filtro: é ele
 * que alimenta o dinheiro da linha e a coluna "Revisão". As duas sondas são
 * ALIASES da mesma tabela, e existem só para filtrar. Filtrar aquele outro
 * esconderia parcela da conta e a linha passaria a somar um pedaço do lançamento.
 *
 * Módulo puro: nada de banco, nada de React.
 */

/** Alias do embed que responde "existe parcela pendente de revisão?". */
export const ALIAS_PENDENTES = "revisao_pendentes";
/** Alias do embed que responde "existe parcela já resolvida?". */
export const ALIAS_RESOLVIDAS = "revisao_resolvidas";

/**
 * Uma comparação sobre coluna do embed.
 *
 * `is-null` não existe em `recorte-no-embed.ts` e é justamente o que a pendência
 * precisa: "conta bancária em branco". Por isso o tipo é próprio daqui em vez de
 * emprestado de lá.
 */
export type CondicaoDeRevisao =
  | { coluna: string; operador: "eq" | "neq"; valor: string }
  | { coluna: string; operador: "is-null" };

/** Uma pergunta de existência sobre as parcelas do lançamento. */
export interface SondaDeRevisao {
  /** Comparações ANDadas dentro do embed. */
  condicoes: CondicaoDeRevisao[];
  /** Expressão do `or` do embed, quando a condição tem dois ramos. */
  ou?: string;
  /**
   * `true` = o lançamento entra só se o embed filtrado vier VAZIO (anti-join).
   * `false` = entra só se vier com alguma linha (o equivalente ao `!inner`).
   */
  vazio: boolean;
}

/** O que aplicar nas duas sondas para reproduzir o estado de revisão pedido. */
export interface RevisaoNoEmbed {
  pendentes?: SondaDeRevisao;
  resolvidas?: SondaDeRevisao;
  /**
   * `true` quando o estado só existe em lançamento A PAGAR.
   *
   * Revisão aqui é "a parcela já tem conta bancária?", e conta bancária de saída
   * só faz sentido no que a empresa paga: a coluna da tela mostra "-" para
   * `a_receber`, e `idsPorRevisao` filtrava `lancamentos.tipo = 'a_pagar'` na
   * própria consulta. Quem monta a consulta reproduz isso; `em_revisao` fica de
   * fora, porque status de parcela existe nos dois tipos.
   */
  soAPagar: boolean;
}

/** Parcela pendente: sem conta bancária e ainda não paga. */
const PENDENTE: CondicaoDeRevisao[] = [
  { coluna: "status", operador: "neq", valor: "pago" },
  { coluna: "conta_bancaria_id", operador: "is-null" },
];

/**
 * Parcela resolvida: com conta bancária OU paga.
 *
 * Paga conta como resolvida porque pagar EXIGE conta bancária
 * (`fn_pagar_parcela` recusa sem ela), então é o caso mais resolvido que existe.
 * Vai como `or` porque são dois ramos, e o `or` do embed é ANDado com o resto.
 */
const RESOLVIDA_OU = "status.eq.pago,conta_bancaria_id.not.is.null";

/** Traduz o estado de revisão pedido nas duas sondas de existência. */
export function revisaoNoEmbed(revisao: FiltroRevisao): RevisaoNoEmbed {
  switch (revisao) {
    case "em_revisao":
      // Status da parcela, e nos DOIS tipos: um lançamento a receber pode ter
      // parcela em revisão, e a consulta antiga não filtrava tipo neste ramo.
      return {
        pendentes: {
          condicoes: [
            { coluna: "status", operador: "eq", valor: "em_revisao" },
          ],
          vazio: false,
        },
        soAPagar: false,
      };

    case "revisado":
      return {
        pendentes: { condicoes: PENDENTE, vazio: true },
        // Exige `total > 0`: lançamento sem parcela não é "revisado", é
        // "não se aplica".
        resolvidas: { condicoes: [], ou: RESOLVIDA_OU, vazio: false },
        soAPagar: true,
      };

    case "sem_conta":
      return {
        resolvidas: { condicoes: [], ou: RESOLVIDA_OU, vazio: true },
        // Mesmo papel do `resolvidas` no `revisado`: garante que há parcela.
        pendentes: { condicoes: PENDENTE, vazio: false },
        soAPagar: true,
      };

    case "parcial":
      return {
        pendentes: { condicoes: PENDENTE, vazio: false },
        resolvidas: { condicoes: [], ou: RESOLVIDA_OU, vazio: false },
        soAPagar: true,
      };

    case "nao_revisado":
      // O complemento de `revisado`: sem conta nenhuma ou conta em parte. Uma
      // parcela pendente já basta, e ela também garante que há parcela.
      return {
        pendentes: { condicoes: PENDENTE, vazio: false },
        soAPagar: true,
      };
  }
}

/**
 * O pedaço do builder do PostgREST que este módulo usa.
 *
 * Mesma técnica de `recorte-no-embed.ts`: com a interface declarada aqui a
 * montagem se testa com um dublê, sem banco. E SÍNCRONA de propósito — o builder
 * do PostgREST é "thenable", então uma função `async` awaitaria o builder no
 * return e dispararia a consulta ali dentro.
 */
export interface ConsultaComSondaDeRevisao<T> {
  eq: (coluna: string, valor: string) => T;
  neq: (coluna: string, valor: string) => T;
  is: (coluna: string, valor: null) => T;
  not: (coluna: string, operador: string, valor: string | null) => T;
  or: (filtro: string, opcoes?: { referencedTable?: string }) => T;
}

/**
 * Aplica as sondas nos embeds aliasados.
 *
 * O que faz o filtro valer para o PAI é a última linha de cada sonda:
 * `not(alias, "is", null)` quando o estado pede que exista, `is(alias, null)`
 * quando pede que não exista. Sem ela o embed só viria vazio e o lançamento
 * continuaria na lista.
 */
export function aplicarRevisaoNoEmbed<T extends ConsultaComSondaDeRevisao<T>>(
  consultaInicial: T,
  revisao: RevisaoNoEmbed,
): T {
  let consulta = consultaInicial;

  const sondas = [
    [ALIAS_PENDENTES, revisao.pendentes],
    [ALIAS_RESOLVIDAS, revisao.resolvidas],
  ] as const;

  for (const [alias, sonda] of sondas) {
    if (!sonda) continue;

    for (const condicao of sonda.condicoes) {
      const coluna = `${alias}.${condicao.coluna}`;
      switch (condicao.operador) {
        case "eq":
          consulta = consulta.eq(coluna, condicao.valor);
          break;
        case "neq":
          consulta = consulta.neq(coluna, condicao.valor);
          break;
        case "is-null":
          consulta = consulta.is(coluna, null);
          break;
      }
    }

    if (sonda.ou) {
      consulta = consulta.or(sonda.ou, { referencedTable: alias });
    }

    consulta = sonda.vazio
      ? consulta.is(alias, null)
      : consulta.not(alias, "is", null);
  }

  return consulta;
}
