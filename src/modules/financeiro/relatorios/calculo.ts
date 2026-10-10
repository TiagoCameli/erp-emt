/**
 * Regras puras dos relatórios financeiros. Sem React, sem Supabase, sem fuso.
 *
 * A query (queries.ts) busca as linhas já agregadas no banco e delega aqui a
 * montagem da lista de faixas e a soma por categoria. Mantendo essas regras
 * puras dá para testá-las isoladas, sem mockar o banco, e garante que tabela e
 * gráfico usem exatamente a mesma conta.
 *
 * O que NÃO mora mais aqui é a classificação por faixa de aging: ela é do
 * fn_rel_aging, que agrega por faixa em vez de por data para não depender do
 * número de vencimentos em aberto.
 *
 * Dinheiro: NUMERIC(14,2) chega como number pelo supabase-js. Somamos em
 * centavos (inteiro) para não acumular erro de ponto flutuante e dividimos por
 * 100 só na borda de saída.
 */

// ---------- dinheiro em centavos ----------

/** Converte valor (number, string pt do banco, null) para centavos inteiros. */
export function paraCentavos(
  valor: number | string | null | undefined,
): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  const numero = typeof valor === "string" ? Number(valor) : valor;
  if (Number.isNaN(numero)) return 0;
  return Math.round(numero * 100);
}

/** Centavos inteiros de volta para reais. */
export function paraReais(centavos: number): number {
  return centavos / 100;
}

// ---------- datas (só pela data, sem hora nem fuso) ----------

/** Mês "YYYY-MM" de uma data `date` do banco. Null para data ausente. */
export function mesDe(data: string | null | undefined): string | null {
  if (!data) return null;
  return data.slice(0, 7);
}

/** Rótulo "mm/aaaa" a partir de "YYYY-MM". */
export function rotuloMes(anoMes: string): string {
  const [ano, mes] = anoMes.split("-");
  return `${mes}/${ano}`;
}

/** Primeiro dia do mês seguinte a "YYYY-MM", como "YYYY-MM-01". */
export function proximoMes(anoMes: string): string {
  const [ano, mes] = anoMes.split("-").map(Number);
  const proximoAno = mes === 12 ? ano + 1 : ano;
  const proximo = mes === 12 ? 1 : mes + 1;
  return `${proximoAno}-${String(proximo).padStart(2, "0")}-01`;
}

// =====================================================================
// Aging (idade dos vencimentos)
// =====================================================================

export type FaixaAging =
  | "a_vencer"
  | "v_1_7"
  | "v_8_15"
  | "v_16_30"
  | "v_31_60"
  | "v_60_mais";

export const ROTULO_FAIXA_AGING: Record<FaixaAging, string> = {
  a_vencer: "A vencer",
  v_1_7: "Vencido 1 a 7 dias",
  v_8_15: "Vencido 8 a 15 dias",
  v_16_30: "Vencido 16 a 30 dias",
  v_31_60: "Vencido 31 a 60 dias",
  v_60_mais: "Vencido mais de 60 dias",
};

export const ORDEM_FAIXA_AGING: FaixaAging[] = [
  "a_vencer",
  "v_1_7",
  "v_8_15",
  "v_16_30",
  "v_31_60",
  "v_60_mais",
];

export interface AgingFaixa {
  faixa: FaixaAging;
  rotulo: string;
  valor: number;
}

/** Uma faixa já classificada e somada pelo banco (fn_rel_aging.faixa_aging). */
export interface LinhaFaixaAging {
  faixa: string;
  valor: number | string | null | undefined;
}

/**
 * A faixa vem do banco como texto livre. Faixa que esta lista não conhece é
 * contrato quebrado entre fn_rel_aging e o TypeScript, e o único desfecho
 * aceitável é falhar: somar em silêncio na faixa errada, ou descartar a linha,
 * é dinheiro sumindo da tela sem aviso.
 */
function comoFaixaAging(faixa: string): FaixaAging {
  if (!(faixa in ROTULO_FAIXA_AGING)) {
    throw new Error(`Faixa de aging desconhecida vinda do banco: ${faixa}`);
  }
  return faixa as FaixaAging;
}

/**
 * Soma por faixa de aging o que o banco já classificou, sempre devolvendo as
 * seis faixas na ordem fixa (zero quando não há parcela).
 *
 * A classificação em si (quantos dias de atraso caem em qual faixa) mora em
 * fn_rel_aging, não aqui: é o que permite a RPC devolver meia dúzia de linhas
 * em vez de uma por data de vencimento, e assim nunca esbarrar no teto de 1000
 * linhas do PostgREST. Parcela sem vencimento continua contando como "a
 * vencer", e as bordas continuam iguais: a prova
 * supabase/provas/aging_agregado_por_faixa.sql confere isso dia a dia.
 */
export function agregarAging(linhas: LinhaFaixaAging[]): AgingFaixa[] {
  const porFaixa = new Map<FaixaAging, number>();
  for (const linha of linhas) {
    const faixa = comoFaixaAging(linha.faixa);
    porFaixa.set(faixa, (porFaixa.get(faixa) ?? 0) + paraCentavos(linha.valor));
  }
  return ORDEM_FAIXA_AGING.map((faixa) => ({
    faixa,
    rotulo: ROTULO_FAIXA_AGING[faixa],
    valor: paraReais(porFaixa.get(faixa) ?? 0),
  }));
}

/** Total de uma lista de faixas. */
export function totalAging(lista: AgingFaixa[]): number {
  return lista.reduce((soma, f) => soma + f.valor, 0);
}

/** Soma só do que está vencido (tudo fora de "a vencer"). */
export function vencidoAging(lista: AgingFaixa[]): number {
  return lista
    .filter((f) => f.faixa !== "a_vencer")
    .reduce((soma, f) => soma + f.valor, 0);
}

// =====================================================================
// Soma por categoria (base do DRE)
// =====================================================================

export interface DreLinha {
  categoriaId: string | null;
  categoria: string;
  valor: number;
  /**
   * Retenção na fonte da linha, só nas receitas do DRE (as outras somas por
   * categoria não a têm). `valor` é o líquido; a bruta é `valor + retencao`.
   */
  retencao?: number;
}

/** Lançamento mínimo para somar por categoria. */
export interface LancamentoCategoria {
  categoriaId: string | null | undefined;
  categoria: string | null | undefined;
  valor: number | string | null | undefined;
}

const CHAVE_SEM_CATEGORIA = "__sem_categoria__";
const NOME_SEM_CATEGORIA = "Sem categoria";

/**
 * Soma lançamentos por categoria financeira (lançamentos sem categoria caem
 * num grupo "Sem categoria"). Devolve em reais, do maior valor para o menor.
 */
export function somarPorCategoria(
  lancamentos: LancamentoCategoria[],
): DreLinha[] {
  const porCategoria = new Map<string, DreLinha>();
  for (const lancamento of lancamentos) {
    const chave = lancamento.categoriaId ?? CHAVE_SEM_CATEGORIA;
    const nome = lancamento.categoria ?? NOME_SEM_CATEGORIA;
    const centavos = paraCentavos(lancamento.valor);
    const atual = porCategoria.get(chave);
    if (atual) {
      atual.valor += centavos;
    } else {
      porCategoria.set(chave, {
        categoriaId: lancamento.categoriaId ?? null,
        categoria: nome,
        valor: centavos,
      });
    }
  }
  return [...porCategoria.values()]
    .map((linha) => ({ ...linha, valor: paraReais(linha.valor) }))
    .sort((a, b) => b.valor - a.valor);
}

/** Soma dos valores de uma lista de linhas de DRE. */
export function totalCategorias(linhas: DreLinha[]): number {
  return linhas.reduce((soma, l) => soma + l.valor, 0);
}

// =====================================================================
// Os quatro blocos do DRE (por natureza da categoria)
// =====================================================================

/**
 * Um bloco do DRE: entradas, saídas e o que sobra. Os quatro blocos têm a mesma
 * forma porque a diferença entre eles não é estrutura, é significado.
 */
export interface BlocoDre {
  receitas: DreLinha[];
  despesas: DreLinha[];
  /** Receita LÍQUIDA: o que o cliente pagou, já sem a retenção na fonte. */
  totalReceitas: number;
  totalDespesas: number;
  /**
   * Retenção na fonte das receitas do bloco (ISS, INSS, IR, PIS, COFINS, CSLL e
   * outras), proporcional ao rateio como em `fn_rel_dre`. Receita bruta é
   * `totalReceitas + retencaoReceitas`.
   */
  retencaoReceitas: number;
  resultado: number;
}

/** Uma linha agregada de `fn_rel_dre`, do jeito que o PostgREST devolve. */
export interface LinhaDreAgregada {
  tipo: string;
  categoria_id: string | null;
  categoria: string | null;
  natureza: string;
  total: number | string | null;
  /**
   * Retenção na fonte da linha (só faz sentido em a_receber). Opcional porque a
   * coluna nasceu em 04/10/2026: linha sem ela conta como retenção zero.
   */
  retencao?: number | string | null;
}

export interface DrePorNatureza {
  operacional: BlocoDre;
  financeiro: BlocoDre;
  movimentacao: BlocoDre;
  /**
   * CAPEX (Aquisição de Equipamento, Investimentos, Compra de Terreno). Saiu do
   * caixa, mas é patrimônio, não custo do período: fica FORA do resultado.
   */
  investimento: BlocoDre;
  /**
   * Retirada de sócio (James e Tiago): não há pró-labore formal, então todo
   * envio a sócio e despesa pessoal da família é distribuição (D3, 09/10/2026).
   * Abaixo do resultado.
   */
  distribuicao: BlocoDre;
  /**
   * Mútuo com empresa ligada (Amazônia, Juruá FM): o que a EMT paga por elas é
   * empréstimo a receber, e o que volta abate (D4). Fora do resultado.
   */
  mutuo: BlocoDre;
  /**
   * Operacional mais financeiro. Movimentação, investimento, distribuição e
   * mútuo NÃO entram, de propósito.
   */
  resultado: number;
}

const BLOCO_VAZIO: BlocoDre = {
  receitas: [],
  despesas: [],
  totalReceitas: 0,
  totalDespesas: 0,
  retencaoReceitas: 0,
  resultado: 0,
};

/** Agrupa por categoria e fecha os totais de um bloco. */
function montarBloco(
  receitasBrutas: LancamentoCategoria[],
  despesasBrutas: LancamentoCategoria[],
  retencaoPorCategoria: ReadonlyMap<string, number>,
): BlocoDre {
  if (receitasBrutas.length === 0 && despesasBrutas.length === 0) {
    return { ...BLOCO_VAZIO };
  }
  // A retenção fica na linha (para a planilha mostrar a de cada categoria) e no
  // bloco (para a tela fechar bruta, retenções e líquida). As duas somam os
  // mesmos centavos, então não há como discordarem.
  let retencaoCentavos = 0;
  const receitas = somarPorCategoria(receitasBrutas).map((linha) => {
    const centavos =
      retencaoPorCategoria.get(linha.categoriaId ?? CHAVE_SEM_CATEGORIA) ?? 0;
    retencaoCentavos += centavos;
    return { ...linha, retencao: paraReais(centavos) };
  });
  const despesas = somarPorCategoria(despesasBrutas);
  const totalReceitas = totalCategorias(receitas);
  const totalDespesas = totalCategorias(despesas);
  return {
    receitas,
    despesas,
    totalReceitas,
    totalDespesas,
    retencaoReceitas: paraReais(retencaoCentavos),
    resultado: totalReceitas - totalDespesas,
  };
}

/** As seis naturezas, na ordem em que aparecem no relatório. */
export const NATUREZAS = [
  "operacional",
  "financeira",
  "movimentacao",
  "investimento",
  "distribuicao",
  "mutuo",
] as const;

export type Natureza = (typeof NATUREZAS)[number];

/**
 * Natureza desconhecida cai em operacional. É natureza nova no banco com código
 * velho aqui: a linha não pode DESAPARECER por isso — sumir com despesa por
 * causa de cadastro é exatamente o erro que esta separação existe para não
 * cometer, ao contrário.
 */
function naturezaDe(valor: string): Natureza {
  return (NATUREZAS as readonly string[]).includes(valor)
    ? (valor as Natureza)
    : "operacional";
}

/**
 * Separa as linhas agregadas do DRE nos quatro blocos, pela natureza da
 * categoria (a do RATEIO, caindo na do lançamento; ver `fn_rel_dre`).
 *
 * O RESULTADO soma só operacional e financeiro. A movimentação (principal de
 * aplicação, resgate, empréstimo) fica de fora: aplicar R$ 1 milhão do saldo à
 * noite e resgatar na manhã seguinte movimenta R$ 2 milhões na conta e não gera
 * um centavo de resultado. Enquanto entrava na soma, a varredura automática do
 * banco respondia por 31,7% da "receita" de 2026 e 14,3% da "despesa".
 *
 * O investimento (CAPEX) também fica de fora, pela decisão D3 de 03/10/2026:
 * comprar uma escavadeira troca dinheiro por máquina, e somar os R$ 5,2 mi de
 * jan-set/2026 como despesa do período dava às obras um prejuízo que é, na
 * verdade, patrimônio.
 */
export function agruparDrePorNatureza(
  linhas: readonly LinhaDreAgregada[],
): DrePorNatureza {
  const gavetas: Record<
    Natureza,
    {
      receitas: LancamentoCategoria[];
      despesas: LancamentoCategoria[];
      /** Centavos de retenção por categoria (a chave de `somarPorCategoria`). */
      retencao: Map<string, number>;
    }
  > = {
    operacional: { receitas: [], despesas: [], retencao: new Map() },
    financeira: { receitas: [], despesas: [], retencao: new Map() },
    movimentacao: { receitas: [], despesas: [], retencao: new Map() },
    investimento: { receitas: [], despesas: [], retencao: new Map() },
    distribuicao: { receitas: [], despesas: [], retencao: new Map() },
    mutuo: { receitas: [], despesas: [], retencao: new Map() },
  };

  for (const linha of linhas) {
    const gaveta = gavetas[naturezaDe(linha.natureza)];
    const item: LancamentoCategoria = {
      categoriaId: linha.categoria_id,
      categoria: linha.categoria,
      valor: linha.total,
    };
    // Só a_receber entra como receita. Qualquer outro tipo é saída: o `else`
    // é de propósito, para tipo novo de lançamento não sumir da tela.
    if (linha.tipo === "a_receber") {
      gaveta.receitas.push(item);
      const chave = linha.categoria_id ?? CHAVE_SEM_CATEGORIA;
      gaveta.retencao.set(
        chave,
        (gaveta.retencao.get(chave) ?? 0) + paraCentavos(linha.retencao),
      );
    } else {
      gaveta.despesas.push(item);
    }
  }

  const bloco = (natureza: Natureza) =>
    montarBloco(
      gavetas[natureza].receitas,
      gavetas[natureza].despesas,
      gavetas[natureza].retencao,
    );
  const operacional = bloco("operacional");
  const financeiro = bloco("financeira");
  const movimentacao = bloco("movimentacao");
  const investimento = bloco("investimento");
  const distribuicao = bloco("distribuicao");
  const mutuo = bloco("mutuo");

  return {
    operacional,
    financeiro,
    movimentacao,
    investimento,
    distribuicao,
    mutuo,
    resultado: operacional.resultado + financeiro.resultado,
  };
}

/** Os quatro cartões do topo do DRE, e o indicador de investimento ao lado. */
export interface CartoesDre {
  /** Receita LÍQUIDA operacional (a obra). */
  receitaOperacional: number;
  despesaOperacional: number;
  /** Receitas menos despesas financeiras (juros, tarifa, IOF). */
  resultadoFinanceiro: number;
  /** Resultado operacional mais resultado financeiro. */
  resultadoDoPeriodo: number;
  /** Saídas de CAPEX no período, fora do resultado. */
  investimentosNoPeriodo: number;
}

/**
 * Os números dos cartões, tirados do MESMO agrupamento da tabela.
 *
 * Em centavos, para a identidade que o cartão promete fechar ao centavo:
 * receita operacional - despesa operacional + resultado financeiro = resultado
 * do período. Somar reais em ponto flutuante deixaria um resto de 0,01 que se lê
 * como erro de conta.
 */
export function cartoesDoDre(dre: DrePorNatureza): CartoesDre {
  const receita = paraCentavos(dre.operacional.totalReceitas);
  const despesa = paraCentavos(dre.operacional.totalDespesas);
  const financeiro =
    paraCentavos(dre.financeiro.totalReceitas) -
    paraCentavos(dre.financeiro.totalDespesas);
  return {
    receitaOperacional: paraReais(receita),
    despesaOperacional: paraReais(despesa),
    resultadoFinanceiro: paraReais(financeiro),
    resultadoDoPeriodo: paraReais(receita - despesa + financeiro),
    // As SAÍDAS de CAPEX, que é a pergunta do indicador ("quanto foi para
    // máquina e terreno"). Uma eventual venda de bem aparece na tabela, no bloco
    // de investimentos, e não abate este número calada.
    investimentosNoPeriodo: dre.investimento.totalDespesas,
  };
}
