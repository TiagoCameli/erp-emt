import { emLotes, LOTE_IDS_POSTGREST } from "@/lib/lotes-de-ids";
import { createClient } from "@/lib/supabase/server";
import {
  ehParcelaAberta,
  type StatusLancamento,
  type StatusParcela,
  type TipoLancamento,
} from "@/modules/financeiro/_shared/formato";

/** Uma parcela no papel. */
export interface EspelhoParcela {
  id: string;
  numeroParcela: number;
  dataVencimento: string | null;
  valor: number;
  desconto: number;
  juros: number;
  valorLiquido: number;
  status: StatusParcela;
  dataPagamento: string | null;
  contaNome: string | null;
}

/** Uma linha de rateio no papel. */
export interface EspelhoRateio {
  centroNome: string;
  centroCodigo: string | null;
  valor: number;
}

/** Um grupo do resumo de parcelas: quantas e quanto. */
export interface EspelhoGrupoParcelas {
  quantidade: number;
  valor: number;
}

/**
 * O resumo que o papel imprime no lugar da tabela parcela a parcela.
 *
 * A tabela antiga tinha nove colunas e uma linha por parcela: num
 * parcelamento longo (o DARF PERT da Receita tem 150 parcelas) ela sozinha
 * enchia várias folhas, e nenhuma das nove colunas respondia a pergunta que
 * quem confere realmente faz, que é "quanto já saiu e quanto falta".
 *
 * As duas bases de valor NÃO são a mesma de propósito, e são as mesmas que os
 * KPIs da tela de Lançamentos já usam:
 *
 * - `pagas` soma o LÍQUIDO, que é o dinheiro que de fato saiu da conta. Hoje
 *   23 das 6.858 parcelas pagas têm líquido diferente do valor (20 com
 *   desconto, 3 com juros), somando R$ 30.810,30 de diferença. Somar o valor
 *   aqui mentiria sobre o caixa.
 * - `aPagar` soma o VALOR, que é a dívida. Nas 914 parcelas em aberto do banco
 *   desconto e juros são zero em todas, então hoje líquido e valor coincidem —
 *   mas a dívida é o valor, e essa é a leitura que continua certa se algum dia
 *   alguém preencher juros antes de pagar.
 *
 * `canceladas` existe porque parcela cancelada não é paga nem devida: sem esse
 * grupo, o total impresso não fecharia com as linhas impressas assim que a
 * primeira for cancelada (não há nenhuma hoje).
 */
export interface EspelhoResumoParcelas {
  pagas: EspelhoGrupoParcelas;
  aPagar: EspelhoGrupoParcelas;
  canceladas: EspelhoGrupoParcelas;
  total: EspelhoGrupoParcelas;
  /**
   * A data de vencimento mais antiga entre as parcelas EM ABERTO, ou nulo se
   * não há nenhuma. Deliberadamente não depende de "hoje": o papel tem que
   * dizer a mesma coisa amanhã. Se estiver no passado, é a parcela atrasada, e
   * continua sendo a próxima a pagar.
   */
  proximoVencimento: string | null;
  /** A data de pagamento mais recente entre as parcelas pagas. */
  ultimoPagamento: string | null;
}

export interface EspelhoLancamento {
  id: string;
  numero: string | null;
  descricao: string | null;
  valor: number;
  status: StatusLancamento;
  /**
   * Necessário para o rótulo do status: `rotuloStatusLancamento(status, tipo)`
   * inverte "a_pagar" para "A receber" quando o lançamento é a receber. Sem o
   * tipo, um recebível em aberto imprimiria o código cru e, pior, de trás para
   * frente (parece uma dívida a pagar quando é dinheiro a receber).
   */
  tipo: TipoLancamento;
  dataCompra: string | null;
  dataVencimento: string | null;
  mesCompetencia: string | null;
  observacoes: string | null;
  fornecedorNome: string | null;
  categoriaNome: string | null;
  formaPagamentoNome: string | null;
  parcelas: EspelhoParcela[];
  /** Derivado de `parcelas`, nunca do cabeçalho do lançamento. */
  resumoParcelas: EspelhoResumoParcelas;
  rateios: EspelhoRateio[];
}

/** A linha crua do PostgREST. `numeric` chega como string. */
export interface LinhaEspelhoLancamento {
  id: string;
  numero: string | null;
  descricao: string | null;
  valor: string | number;
  status: string;
  /** Cru do banco (texto); vira `TipoLancamento` na montagem. */
  tipo: string;
  data_compra: string | null;
  data_vencimento: string | null;
  mes_competencia: string | null;
  observacoes: string | null;
  fornecedores: { razao_social: string } | null;
  categorias_financeiras: { nome: string } | null;
  formas_pagamento: { nome: string } | null;
  lancamento_parcelas: {
    id: string;
    numero_parcela: number;
    data_vencimento: string | null;
    valor: string | number;
    desconto: string | number | null;
    juros: string | number | null;
    valor_liquido: string | number;
    status: string;
    data_pagamento: string | null;
    contas_bancarias: { nome: string } | null;
  }[];
  lancamento_rateios: {
    valor: string | number;
    centros_custo: { nome: string; codigo: string | null } | null;
  }[];
}

/** Conversão única de dinheiro: sobre o texto exato que o banco mandou. */
function dinheiro(valor: string | number | null | undefined): number {
  return Number(valor ?? 0);
}

/**
 * Monta o espelho a partir da linha crua. Pura, e por isso testável sem banco.
 *
 * Ordena as parcelas por número para o papel sair na ordem do carnê: o
 * PostgREST não garante ordem de linha embutida.
 */
/**
 * O resumo de parcelas, derivado das próprias parcelas.
 *
 * Fica fora de `montarEspelhoLancamento` para ser testável sozinho: é conta de
 * dinheiro, e conta de dinheiro deste projeto se prova sem DOM.
 */
export function resumirParcelas(
  parcelas: EspelhoParcela[],
): EspelhoResumoParcelas {
  const pagas = parcelas.filter((parcela) => parcela.status === "pago");
  // `ehParcelaAberta` (não `!== "pago"`): a regra verdadeira é "não pago e não
  // cancelado", e ela já mora no _shared, usada pelo filtro de atraso e pelo
  // resumo do cabeçalho. Repetir a condição aqui faria o papel discordar da
  // tela no dia em que aparecer um status novo.
  const aPagar = parcelas.filter((parcela) => ehParcelaAberta(parcela.status));
  const canceladas = parcelas.filter(
    (parcela) => parcela.status === "cancelado",
  );

  // Líquido nas pagas (o que saiu da conta), valor nas em aberto (a dívida).
  // Ver o JSDoc de EspelhoResumoParcelas para o porquê de serem bases
  // diferentes, e para os números que sustentam isso.
  const somaLiquido = (linhas: EspelhoParcela[]) =>
    linhas.reduce((soma, parcela) => soma + parcela.valorLiquido, 0);
  const somaValor = (linhas: EspelhoParcela[]) =>
    linhas.reduce((soma, parcela) => soma + parcela.valor, 0);

  // Datas do banco são 'YYYY-MM-DD', então comparar como texto ordena igual a
  // comparar como data, sem construir Date nem passar por fuso.
  const menor = (datas: (string | null)[]) =>
    datas.filter((data): data is string => data !== null).sort()[0] ?? null;
  const maior = (datas: (string | null)[]) =>
    datas.filter((data): data is string => data !== null).sort().at(-1) ?? null;

  const grupos = {
    pagas: { quantidade: pagas.length, valor: somaLiquido(pagas) },
    aPagar: { quantidade: aPagar.length, valor: somaValor(aPagar) },
    canceladas: { quantidade: canceladas.length, valor: somaValor(canceladas) },
  };

  return {
    ...grupos,
    // O total soma os TRÊS grupos impressos, nunca `parcelas.length` nem o
    // valor do lançamento: assim a linha de total sempre fecha com as linhas
    // que estão logo acima dela no papel.
    total: {
      quantidade:
        grupos.pagas.quantidade +
        grupos.aPagar.quantidade +
        grupos.canceladas.quantidade,
      valor: grupos.pagas.valor + grupos.aPagar.valor + grupos.canceladas.valor,
    },
    proximoVencimento: menor(aPagar.map((parcela) => parcela.dataVencimento)),
    ultimoPagamento: maior(pagas.map((parcela) => parcela.dataPagamento)),
  };
}

export function montarEspelhoLancamento(
  linha: LinhaEspelhoLancamento,
): EspelhoLancamento {
  const parcelas: EspelhoParcela[] = (linha.lancamento_parcelas ?? [])
    .map((parcela) => ({
      id: parcela.id,
      numeroParcela: parcela.numero_parcela,
      dataVencimento: parcela.data_vencimento,
      valor: dinheiro(parcela.valor),
      desconto: dinheiro(parcela.desconto),
      juros: dinheiro(parcela.juros),
      valorLiquido: dinheiro(parcela.valor_liquido),
      status: parcela.status as StatusParcela,
      dataPagamento: parcela.data_pagamento,
      contaNome: parcela.contas_bancarias?.nome ?? null,
    }))
    .sort((a, b) => a.numeroParcela - b.numeroParcela);

  return {
    id: linha.id,
    numero: linha.numero,
    descricao: linha.descricao,
    valor: dinheiro(linha.valor),
    status: linha.status as StatusLancamento,
    tipo: linha.tipo as TipoLancamento,
    dataCompra: linha.data_compra,
    dataVencimento: linha.data_vencimento,
    mesCompetencia: linha.mes_competencia,
    observacoes: linha.observacoes,
    fornecedorNome: linha.fornecedores?.razao_social ?? null,
    categoriaNome: linha.categorias_financeiras?.nome ?? null,
    formaPagamentoNome: linha.formas_pagamento?.nome ?? null,
    parcelas,
    resumoParcelas: resumirParcelas(parcelas),
    // "Sem centro de custo", igual ao fallback de detalharLancamentosParaPlanilha
    // no mesmo módulo: os dois textos descrevem a mesma ausência e não podem
    // divergir entre a planilha e o papel.
    rateios: (linha.lancamento_rateios ?? []).map((rateio) => ({
      centroNome: rateio.centros_custo?.nome ?? "Sem centro de custo",
      centroCodigo: rateio.centros_custo?.codigo ?? null,
      valor: dinheiro(rateio.valor),
    })),
  };
}

/**
 * Busca os lançamentos para o espelho, na ordem em que os ids vieram.
 *
 * Em lotes de LOTE_IDS_POSTGREST porque `in` vai na query string de um GET.
 * Id que a RLS não deixa ver simplesmente não volta, e quem chama conta a
 * diferença: o espelho nunca imprime linha que o usuário não pode ver, e
 * nunca derruba a impressão inteira por causa dela.
 */
export async function buscarLancamentosParaEspelho(
  ids: string[],
): Promise<EspelhoLancamento[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();

  const linhas: LinhaEspelhoLancamento[] = [];
  for (const lote of emLotes(ids, LOTE_IDS_POSTGREST)) {
    const { data, error } = await supabase
      .from("lancamentos")
      .select(
        `id, numero, tipo, descricao, valor, status, data_compra, data_vencimento,
         mes_competencia, observacoes,
         fornecedores(razao_social),
         categorias_financeiras(nome),
         formas_pagamento(nome),
         lancamento_parcelas(id, numero_parcela, data_vencimento, valor,
           desconto, juros, valor_liquido, status, data_pagamento,
           contas_bancarias(nome)),
         lancamento_rateios(valor, centros_custo(nome, codigo))`,
      )
      .in("id", lote);

    if (error) {
      // A mensagem do banco vai junto: sem ela a falha chega como "não foi
      // possível" e descobrir o motivo vira adivinhação.
      throw new Error(
        `Não foi possível carregar o espelho do lançamento: ${error.message}`,
      );
    }
    linhas.push(...((data ?? []) as unknown as LinhaEspelhoLancamento[]));
  }

  const porId = new Map(
    linhas.map((linha) => [linha.id, montarEspelhoLancamento(linha)]),
  );
  // Ordem pedida, não ordem do banco: o usuário marcou numa ordem e espera o
  // maço de papel naquela ordem.
  return ids
    .map((id) => porId.get(id))
    .filter((espelho): espelho is EspelhoLancamento => espelho !== undefined);
}
