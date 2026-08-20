import {
  escreverRecorte,
  type FaixaAgingRecorte,
  type TipoLancamentoRecorte,
} from "@/modules/financeiro/lancamentos/recorte";

/**
 * A URL de destino de cada clique nos relatórios: qual lista abre, e com que
 * filtro.
 *
 * Mora num módulo próprio, e não dentro de cada componente de tabela, pelo mesmo
 * motivo que `lancamentos/filtros.ts` existe para a exportação: duas montagens da
 * mesma URL divergem no primeiro filtro que alguém acrescenta de um lado só, e o
 * sintoma é o pior possível — a lista abre sem erro nenhum mostrando um conjunto
 * diferente do que a célula somou.
 *
 * REGRA DO MÓDULO: o drill carrega a chave da dimensão do PRÓPRIO relatório, nunca
 * uma reconstrução dela. Ver `lancamentos/recorte.ts` para o porquê medido (694
 * parcelas pagas em mês diferente do vencimento).
 *
 * SEGUNDA REGRA: os filtros implícitos do relatório viajam. O custo por centro de
 * custo soma `tipo = 'a_pagar'` e `status <> 'cancelado'`; se esses dois não forem
 * na URL, a lista traz linha que a célula não contou. Hoje a base não tem
 * cancelado nem lançamento a receber, então a falta deles não apareceria na tela —
 * e é justamente por isso que ela está travada por teste.
 *
 * Cada função aceita só o recorte do REGIME do seu relatório (competência ou
 * caixa), então trocar um pelo outro não compila em vez de abrir a lista errada.
 *
 * Módulo puro: nada de React, nada de banco.
 */

export const ROTA_LANCAMENTOS = "/financeiro/lancamentos";

/** Período em regime de COMPETÊNCIA. Vazio significa sem limite (tudo). */
export interface PeriodoCompetencia {
  /** Um mês só (yyyy-MM). Quando presente, ganha de `de`/`ate`. */
  mes?: string;
  /** Primeiro mês da janela (yyyy-MM). */
  de?: string;
  /** Último mês da janela (yyyy-MM), incluído. */
  ate?: string;
}

/**
 * Os filtros do relatório de custo que viajam no clique.
 *
 * Todos os de escolha são LISTAS, como no relatório. A lista de lançamentos lê o
 * mesmo formato (`listas-na-url.ts`), então o clique com três fornecedores
 * marcados abre a lista com os três — e não com todos, que é o que aconteceria se
 * só o primeiro viajasse.
 */
export interface FiltrosDoRelatorioDeCusto {
  categoriaIds?: string[];
  fornecedorIds?: string[];
  formaIds?: string[];
  /** O relatório está incluindo os lançamentos sem forma informada? */
  semForma?: boolean;
  /**
   * Status LITERAIS que o relatório está somando.
   *
   * Viaja em `status_in`, e não no `status` da lista, porque lá "A pagar" quer
   * dizer a situação do dinheiro (inclui `aprovado` com saldo em aberto) e aqui é
   * a coluna crua. Mesma chave para dois sentidos abriria um conjunto diferente
   * do que a célula somou.
   */
  status?: string[];
  /**
   * O relatório está somando SEM os previstos? Então a lista também tem que
   * excluí-los, senão ela traz linha que a célula não contou.
   *
   * Falso é o padrão porque é o comportamento do relatório de hoje (ele só exclui
   * cancelado). Hoje a base tem 0 previsto, então a diferença não apareceria na
   * tela — e é por isso que o teste trava o parâmetro em vez de confiar no olho.
   */
  excluirPrevisto?: boolean;
}

/** Lista de valores no formato da URL, ou `undefined` quando não filtra nada. */
function lista(valores?: string[]): string | undefined {
  return valores && valores.length > 0 ? valores.join(",") : undefined;
}

function montar(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (valor !== undefined && valor !== "") query.set(chave, valor);
  }
  const texto = query.toString();
  return texto ? `${ROTA_LANCAMENTOS}?${texto}` : ROTA_LANCAMENTOS;
}

/**
 * Último dia do mês (yyyy-MM-dd), para fechar a ponta de cima da janela.
 *
 * `Date.UTC(ano, mes, 0)` é o dia 0 do mês SEGUINTE, que é o último do mês
 * pedido, e resolve fevereiro e ano bissexto sem tabela de dias. Em UTC de
 * propósito: é um dia de calendário, não um instante, e o fuso local faria a data
 * pular um dia à noite.
 */
function fimDoMes(mes: string): string {
  const [ano, mesNumero] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, mesNumero, 0)).toISOString().slice(0, 10);
}

function periodoNaUrl(
  periodo: PeriodoCompetencia,
): Record<string, string | undefined> {
  if (periodo.mes) return { mes: periodo.mes };
  return {
    comp_de: periodo.de ? `${periodo.de}-01` : undefined,
    comp_ate: periodo.ate ? fimDoMes(periodo.ate) : undefined,
  };
}

/**
 * Filtros que os relatórios de custo aplicam SEMPRE (ver `fn_rel_custo_*`), e que
 * precisam viajar para o total da lista fechar com a célula.
 */
const IMPLICITOS_CUSTO = { tipo: "a_pagar", sem_cancelado: "1" } as const;

/**
 * Custo por centro de custo: a linha da tabela, a barra do gráfico e o mês da
 * série.
 *
 * `centroCustoIds` é uma LISTA porque o destino aceita lista e porque os cliques
 * desta tela não têm todos a mesma cardinalidade: a linha da tabela e a barra são
 * de um centro só, e o mês do gráfico de vida é dos centros que estão desenhados
 * ali. Em qualquer um dos casos, o que vai na URL é exatamente o conjunto que a
 * coisa clicada somou.
 */
export function drillCentroCusto({
  centroCustoIds,
  periodo,
  filtros,
}: {
  centroCustoIds: string[];
  periodo: PeriodoCompetencia;
  filtros: FiltrosDoRelatorioDeCusto;
}): string {
  return montar({
    ...IMPLICITOS_CUSTO,
    centro: lista(centroCustoIds),
    ...periodoNaUrl(periodo),
    categoria: lista(filtros.categoriaIds),
    fornecedor: lista(filtros.fornecedorIds),
    forma: lista(filtros.formaIds),
    sem_forma: filtros.semForma ? "1" : undefined,
    status_in: lista(filtros.status),
    sem_previsto: filtros.excluirPrevisto ? "1" : undefined,
  });
}

/**
 * DRE gerencial: a linha de categoria. O `tipo` vem da seção clicada (receita ou
 * despesa) e não de um padrão, porque a mesma categoria pode aparecer nas duas.
 */
export function drillCategoriaCompetencia({
  categoriaId,
  mes,
  tipo,
}: {
  categoriaId: string;
  mes: string;
  tipo: TipoLancamentoRecorte;
}): string {
  return montar({
    categoria: categoriaId,
    mes,
    tipo,
    sem_cancelado: "1",
  });
}

/**
 * Custo por grupo de insumo: só a linha do grupo SEM insumo (o lançamento
 * avulso), que é a única cujo total a lista de lançamentos fecha.
 */
export function drillGrupoInsumo({
  grupoId,
  periodo,
}: {
  grupoId: string | null;
  periodo: PeriodoCompetencia;
}): string {
  if (grupoId !== null) {
    // Grupo com insumo soma `oc_itens.quantidade * preco_unitario`, não o valor do
    // lançamento. Abrir a lista de lançamentos aqui daria um total diferente da
    // célula clicada, que é exatamente o defeito que este módulo existe para
    // matar. Não acontece hoje (0 ordens de compra no banco) e falha alto no dia
    // em que a primeira OC entrar, em vez de mentir em silêncio.
    throw new Error(
      "Drill de grupo com insumo não está implementado: o grupo soma item de OC, e a lista de lançamentos não fecharia com ele.",
    );
  }
  return montar({ ...IMPLICITOS_CUSTO, ...periodoNaUrl(periodo) });
}

/**
 * Fluxo de caixa: a barra de um mês. Regime de CAIXA, então o mês vai no recorte
 * (que reusa a expressão de `fn_rel_fluxo_caixa`) e NÃO como `mes`, que é
 * competência.
 */
export function drillFluxoCaixa({
  mes,
  tipo,
  realizado,
}: {
  mes: string;
  tipo: TipoLancamentoRecorte;
  realizado: boolean;
}): string {
  return montar({
    tipo,
    recorte: escreverRecorte({ tipo: "fluxo", mes, realizado }),
  });
}

/** Aging: a faixa de vencimento, pela classificação de `fn_rel_aging`. */
export function drillAging({
  faixa,
  tipo,
}: {
  faixa: FaixaAgingRecorte;
  tipo: TipoLancamentoRecorte;
}): string {
  return montar({
    recorte: escreverRecorte({ tipo: "aging", faixa, tipoLancamento: tipo }),
  });
}

/**
 * Posição bancária: a conta. O recorte diz "parcelas pagas" porque é isso que a
 * posição soma (pelo líquido), e sem ele a lista traria também o que ainda não
 * passou por aquela conta.
 */
export function drillContaBancaria({
  contaId,
  tipo,
}: {
  contaId: string;
  tipo: TipoLancamentoRecorte;
}): string {
  return montar({
    conta: contaId,
    tipo,
    recorte: escreverRecorte({ tipo: "conta_paga" }),
  });
}
