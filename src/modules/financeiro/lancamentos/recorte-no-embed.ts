import type { Recorte } from "@/modules/financeiro/lancamentos/recorte";

/**
 * O recorte de relatório traduzido em FILTRO DE EMBED, em vez de lista de ids.
 *
 * ## O defeito que isto conserta
 *
 * O drill resolvia o recorte em `fn_lancamentos_do_recorte`, trazia os ids dos
 * lançamentos e os mandava de volta ao PostgREST num `id=in.(...)`. Isso viaja na
 * query string de um GET, 37 caracteres por uuid. Medido nos `edge_logs` em
 * 01/09/2026: `GET /rest/v1/lancamentos` devolvendo **400 com URL de 29.342
 * caracteres**, quatro vezes, no clique de um mês do fluxo de caixa — a barra
 * mais pesada tem 732 lançamentos.
 *
 * O `conta_paga` era pior e mais calado: 4.818 lançamentos numa conta. Acima de
 * ~1.800 ids a requisição **não completa** e não deixa log em lugar nenhum, nem
 * no `edge_logs`, nem no `postgres_logs` — na tela é só "algo deu errado".
 *
 * Lote não resolve, e isso já estava escrito no módulo: a lista aqui é FILTRO, e
 * ordenação, paginação e `count: "exact"` são do servidor sobre o filtro inteiro.
 * Quebrar em lotes trocaria a ordem entre páginas.
 *
 * ## Por que embed
 *
 * É a saída que o filtro de centro de custo já usa neste mesmo arquivo:
 * `.in("filho.coluna", ...)` + `not.is.null` (o equivalente a um `!inner`). O
 * embed é subconsulta lateral independente, então filtrá-lo **não** mexe no
 * `count: "exact"` e **não** duplica a linha do pai. E o que viaja na URL passa a
 * ser um punhado de caracteres em vez de 30 KB.
 *
 * O embed usado aqui é **aliasado** (`recorte:lancamento_parcelas`), e não o
 * `lancamento_parcelas` que o `select` já traz. Esse outro alimenta a coluna
 * "Revisão" e o dinheiro de cada linha: filtrá-lo esconderia parcela da conta.
 * Dois aliases da mesma tabela são duas subconsultas independentes.
 *
 * ## O que NÃO muda de lugar
 *
 * O VALOR de cada linha continua vindo de `fn_lancamentos_do_recorte` (uma RPC,
 * POST, sem limite de URL). Só o FILTRO desceu. As duas coisas têm de concordar,
 * e é por isso que o mês do caixa virou a coluna gerada `mes_fluxo`: a RPC agrupa
 * por ela e este módulo filtra por ela, uma definição só.
 *
 * Módulo puro: nada de banco, nada de React.
 */

/** Uma comparação simples sobre uma coluna do embed. */
export interface CondicaoDeEmbed {
  coluna: string;
  operador: "eq" | "neq" | "gte" | "lt" | "in" | "not.in";
  valor: string | readonly string[];
}

/** O que aplicar no embed aliasado para reproduzir o recorte. */
export interface RecorteNoEmbed {
  /** Comparações ANDadas. */
  condicoes: CondicaoDeEmbed[];
  /**
   * Expressão para o `.or()` do embed, quando o recorte tem um ramo nulo.
   *
   * Só o aging precisa: "a vencer" inclui a parcela SEM vencimento, e um filtro
   * de data sozinho a descartaria — que é exatamente o erro que
   * `lancamentos/recorte.ts` existe para não cometer.
   */
  ou?: string;
}

/**
 * Contexto que o recorte precisa e que só o banco sabe.
 *
 * Vem por parâmetro para este módulo continuar puro e testável.
 */
export interface ContextoDoRecorte {
  /** Hoje em `yyyy-MM-dd`, no fuso de Rio Branco. O mesmo que a RPC usa. */
  hojeISO: string;
  /**
   * `saldo_inicial_data` da conta clicada (ou `null`). A posição bancária só
   * conta o que passou DEPOIS do saldo inicial digitado, senão o movimento
   * antigo entra de novo por cima de um saldo que já o embute.
   */
  saldoInicialData?: string | null;
  /**
   * A conta clicada. Escopa o `conta_paga`, como o `p_conta` da RPC: sem ela, um
   * lançamento com parcelas pagas em DUAS contas entraria na fatia de uma só, e
   * o total da lista passaria da célula da posição bancária.
   */
  contaBancariaId?: string;
}

/** Os status de parcela que o aging considera em aberto. Igual à RPC. */
const STATUS_EM_ABERTO = ["pendente", "em_revisao", "aprovado"] as const;

/** Soma dias a uma data `yyyy-MM-dd`. Em UTC: é dia de calendário, não instante. */
export function somarDias(dataISO: string, dias: number): string {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const base = Date.UTC(ano, mes - 1, dia + dias);
  return new Date(base).toISOString().slice(0, 10);
}

/**
 * As pontas de cada faixa do aging, em dias de atraso, como a RPC as classifica:
 * `dias = data_vencimento - hoje`, e a faixa é escolhida por `>=` decrescente.
 *
 * `de` e `ate` são deslocamentos em dias sobre hoje, e o intervalo é
 * `[hoje+de, hoje+ate)` — fechado embaixo, aberto em cima, que é o que faz as
 * cinco faixas se encaixarem sem sobrepor nem deixar buraco.
 */
const FAIXA_EM_DIAS: Record<string, { de: number; ate: number }> = {
  v_1_7: { de: -7, ate: 0 },
  v_8_15: { de: -15, ate: -7 },
  v_16_30: { de: -30, ate: -15 },
  v_31_60: { de: -60, ate: -30 },
};

/**
 * Traduz o recorte nas condições do embed.
 *
 * A natureza (`movimentacao` fora) NÃO entra aqui: ela mora no LANÇAMENTO, não na
 * parcela, então é filtro do pai. Quem monta a consulta a aplica.
 */
export function recorteNoEmbed(
  recorte: Recorte,
  contexto: ContextoDoRecorte,
): RecorteNoEmbed {
  switch (recorte.tipo) {
    case "fluxo": {
      // A coluna guarda o dia 1 do mês; o recorte da URL é `yyyy-MM`.
      const condicoes: CondicaoDeEmbed[] = [
        { coluna: "mes_fluxo", operador: "eq", valor: `${recorte.mes}-01` },
      ];
      // Realizado é `status = 'pago'`; previsto é todo o resto que não foi
      // cancelado. `neq` sozinho traria a cancelada de volta.
      if (recorte.realizado) {
        condicoes.push({ coluna: "status", operador: "eq", valor: "pago" });
      } else {
        condicoes.push({
          coluna: "status",
          operador: "not.in",
          valor: ["pago", "cancelado"],
        });
      }
      return { condicoes };
    }

    case "aging": {
      const condicoes: CondicaoDeEmbed[] = [
        { coluna: "status", operador: "in", valor: [...STATUS_EM_ABERTO] },
      ];
      if (recorte.faixa === "a_vencer") {
        // Sem vencimento conta como a vencer — é a regra da RPC, e descartá-la
        // seria perder parcela que a célula somou.
        return {
          condicoes,
          ou: `data_vencimento.is.null,data_vencimento.gte.${contexto.hojeISO}`,
        };
      }
      if (recorte.faixa === "v_60_mais") {
        condicoes.push({
          coluna: "data_vencimento",
          operador: "lt",
          valor: somarDias(contexto.hojeISO, -60),
        });
        return { condicoes };
      }
      const faixa = FAIXA_EM_DIAS[recorte.faixa];
      condicoes.push(
        {
          coluna: "data_vencimento",
          operador: "gte",
          valor: somarDias(contexto.hojeISO, faixa.de),
        },
        {
          coluna: "data_vencimento",
          operador: "lt",
          valor: somarDias(contexto.hojeISO, faixa.ate),
        },
      );
      return { condicoes };
    }

    case "conta_paga": {
      const condicoes: CondicaoDeEmbed[] = [
        { coluna: "status", operador: "eq", valor: "pago" },
      ];
      if (contexto.contaBancariaId) {
        condicoes.push({
          coluna: "conta_bancaria_id",
          operador: "eq",
          valor: contexto.contaBancariaId,
        });
      }
      // O corte do saldo inicial. Sem data de corte na conta, tudo entra; com
      // ela, só o que se moveu depois — e a parcela paga sem data de pagamento
      // entra também, como na RPC.
      if (contexto.saldoInicialData) {
        return {
          condicoes,
          ou: `data_pagamento.is.null,data_pagamento.gt.${contexto.saldoInicialData}`,
        };
      }
      return { condicoes };
    }
  }
}

/**
 * O pedaço do builder do PostgREST que este módulo usa.
 *
 * Mesma técnica de `pagamentos/filtros-pagas.ts`: com a interface declarada aqui,
 * a montagem da consulta se testa com um dublê, sem banco. E SÍNCRONA de
 * propósito — o builder do PostgREST é "thenable", então uma função `async` que
 * devolvesse o builder o awaitaria no return, disparando a consulta ali dentro.
 */
export interface ConsultaComEmbed<T> {
  eq: (coluna: string, valor: string) => T;
  neq: (coluna: string, valor: string) => T;
  gte: (coluna: string, valor: string) => T;
  lt: (coluna: string, valor: string) => T;
  in: (coluna: string, valores: readonly string[]) => T;
  not: (coluna: string, operador: string, valor: string | null) => T;
  or: (filtro: string, opcoes?: { referencedTable?: string }) => T;
}

/**
 * Aplica o recorte no embed aliasado.
 *
 * O `not(alias, "is", null)` no fim é o que faz o filtro valer para o PAI. Sem
 * ele o embed só viria vazio e o lançamento continuaria na lista — é o mesmo par
 * (`filtro no embed` + `not.is.null`) que o filtro de centro de custo usa.
 */
export function aplicarRecorteNoEmbed<T extends ConsultaComEmbed<T>>(
  consultaInicial: T,
  alias: string,
  recorte: RecorteNoEmbed,
): T {
  let consulta = consultaInicial;

  for (const condicao of recorte.condicoes) {
    const coluna = `${alias}.${condicao.coluna}`;
    switch (condicao.operador) {
      case "eq":
        consulta = consulta.eq(coluna, condicao.valor as string);
        break;
      case "neq":
        consulta = consulta.neq(coluna, condicao.valor as string);
        break;
      case "gte":
        consulta = consulta.gte(coluna, condicao.valor as string);
        break;
      case "lt":
        consulta = consulta.lt(coluna, condicao.valor as string);
        break;
      case "in":
        consulta = consulta.in(coluna, condicao.valor as readonly string[]);
        break;
      case "not.in":
        // O `in` do `not` quer a lista entre parênteses, não um array.
        consulta = consulta.not(
          coluna,
          "in",
          `(${(condicao.valor as readonly string[]).join(",")})`,
        );
        break;
    }
  }

  if (recorte.ou) {
    consulta = consulta.or(recorte.ou, { referencedTable: alias });
  }

  return consulta.not(alias, "is", null);
}

/**
 * A natureza `movimentacao` fora, no nível do LANÇAMENTO.
 *
 * Os três recortes descartam aplicação e resgate do principal, e essa regra mora
 * na categoria do lançamento, não na parcela. Vai como `or` porque `not.in`
 * sozinho descartaria também o lançamento SEM categoria (em SQL, `null not in
 * (...)` é nulo, e nulo não passa no where) — e existem três deles na base.
 *
 * Lista vazia devolve a consulta intacta: sem categoria de movimentação
 * cadastrada não há o que excluir.
 */
export function aplicarNaturezaOperacional<T extends ConsultaComEmbed<T>>(
  consulta: T,
  categoriasDeMovimentacao: readonly string[],
): T {
  if (categoriasDeMovimentacao.length === 0) return consulta;
  return consulta.or(
    `categoria_id.is.null,categoria_id.not.in.(${categoriasDeMovimentacao.join(",")})`,
  );
}
