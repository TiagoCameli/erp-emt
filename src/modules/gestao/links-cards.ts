/**
 * Para onde cada cartão do Painel leva, já filtrado.
 *
 * A regra é uma só: **o destino tem que mostrar o mesmo número do cartão**.
 * Cartão que leva para uma lista com outro total é pior do que cartão que não
 * leva a lugar nenhum — quem clica passa a duvidar dos dois números.
 *
 * Por isso os filtros aqui espelham, um a um, os cortes de
 * `fn_rel_gestao_financeiro_resumo` e de `fn_rel_custo_por_mes`. Conferidos
 * contra o banco em 19/08/2026, com os quatro números batendo ao centavo:
 *
 * | cartão               | corte no banco                              |
 * |----------------------|---------------------------------------------|
 * | Custo do mês         | competência do último mês da janela          |
 * | A pagar em aberto    | parcela em aberto (pendente/revisão/aprovada)|
 * | Vence em até 7 dias  | aprovada com vencimento <= hoje+7            |
 * | Pagamentos a aprovar | parcela pendente                             |
 * | Pago no mês          | paga, com pagamento dentro do mês corrente   |
 *
 * Módulo puro: recebe as datas prontas em vez de ler o relógio, para o teste
 * poder fixar o dia e para a tela usar a MESMA data do resto do painel (fuso de
 * Rio Branco).
 */

/** Soma dias a uma data yyyy-MM-dd. Aritmética em UTC: não pula dia por fuso. */
export function somarDias(data: string, dias: number): string {
  const umDia = 24 * 60 * 60 * 1000;
  const alvo = new Date(Date.parse(`${data}T00:00:00Z`) + dias * umDia);
  return alvo.toISOString().slice(0, 10);
}

/** Primeiro dia do mês de uma data yyyy-MM-dd. */
export function primeiroDiaDoMes(data: string): string {
  return `${data.slice(0, 7)}-01`;
}

/**
 * Último dia do mês de uma data yyyy-MM-dd.
 *
 * Dia 0 do mês seguinte é o último do mês atual, e o `Date` do JS já vira o ano
 * sozinho em dezembro.
 */
export function ultimoDiaDoMes(data: string): string {
  const ano = Number(data.slice(0, 4));
  const mes = Number(data.slice(5, 7));
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
}

export interface ContextoDosCards {
  /** Hoje, no fuso de Rio Branco (yyyy-MM-dd). */
  hoje: string;
  /** Mês do cartão de custo (yyyy-MM): o último da janela do painel. */
  mesDoCusto: string;
  /** Filtros do painel, para o cartão que OBEDECE a eles. Vazio = sem filtro. */
  centroCustoId?: string;
  categoriaId?: string;
}

export interface LinksDosCards {
  custoDoMes: string;
  aPagarEmAberto: string;
  venceEmSeteDias: string;
  pagamentosAAprovar: string;
  pagoNoMes: string;
}

/** Monta a query string ignorando o que estiver vazio. */
function comParametros(rota: string, params: Record<string, string | undefined>): string {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (valor !== undefined && valor !== "") busca.set(chave, valor);
  }
  const texto = busca.toString();
  return texto === "" ? rota : `${rota}?${texto}`;
}

export function linksDosCards(contexto: ContextoDosCards): LinksDosCards {
  const { hoje, mesDoCusto, centroCustoId, categoriaId } = contexto;

  return {
    // Obedece ao filtro do painel (é o único que obedece), então carrega centro
    // e categoria: o relatório sem eles somaria a empresa inteira e mostraria
    // um número maior que o do cartão que acabou de ser clicado.
    custoDoMes: comParametros("/financeiro/relatorios", {
      rel: "custo-cc",
      modo: "mes",
      mes: mesDoCusto,
      centro: centroCustoId,
      categoria: categoriaId,
    }),

    // A fila a pagar JÁ é o conjunto em aberto (pendente, em revisão e
    // aprovada): sem filtro, o total do topo é exatamente este cartão.
    aPagarEmAberto: "/financeiro/pagamentos",

    // Só aprovadas, e sem ponta inicial no vencimento: o cartão conta o que
    // vence até a data limite INCLUINDO o que já venceu (ele mostra as vencidas
    // à parte). Pôr um `venc_de` aqui esconderia justamente o atraso.
    venceEmSeteDias: comParametros("/financeiro/pagamentos", {
      situacao: "aprovado",
      venc_ate: somarDias(hoje, 7),
    }),

    // Vai para a fila de aprovação, que é onde a ação acontece — e que lista o
    // mesmo conjunto (parcela pendente de lançamento a pagar não cancelado).
    pagamentosAAprovar: "/financeiro/aprovacao-pagamentos",

    // Aba do histórico, recortada no mês corrente (o mesmo do cartão, que usa
    // `hoje`, e não a janela escolhida no painel).
    pagoNoMes: comParametros("/financeiro/pagamentos", {
      aba: "pagas",
      h_pago_de: primeiroDiaDoMes(hoje),
      h_pago_ate: ultimoDiaDoMes(hoje),
    }),
  };
}
