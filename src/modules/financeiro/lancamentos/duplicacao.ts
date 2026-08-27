import type { LancamentoDetalhe } from "@/modules/financeiro/lancamentos/queries";
import type { LancamentoInput } from "@/modules/financeiro/lancamentos/schemas";

/**
 * O que a duplicação NÃO copia, e por quê.
 *
 * Cada linha aqui é uma decisão, não um esquecimento. O teste
 * `duplicacao.test.ts` percorre os campos do `lancamentoSchema` e cobra que
 * todos tenham passado por esta função — campo novo no lançamento quebra o
 * teste até alguém decidir se ele é copiado ou não.
 *
 * - **numero**: é do banco, gerado por sequência anual. O duplicado ganha o
 *   próximo.
 * - **origem / origemId**: o duplicado nasce SEMPRE `manual`. Copiar `oc`
 *   quebraria no insert (`uq_lancamentos_oc_origem_id` é único por ordem) e,
 *   pior, faria duas dívidas apontarem para a mesma compra. Duplicar um
 *   lançamento de OC dá uma despesa nova, solta, editável por inteiro — que é o
 *   que o Tiago pediu ("pode ser todo editado", e lançamento de OC não pode).
 * - **status do lançamento e das parcelas**: o duplicado começa do zero e
 *   percorre o caminho normal de um lançamento novo. Não herda "aprovado".
 * - **conta bancária das parcelas**: é ela que marca o lançamento a pagar como
 *   REVISADO. Sem ela, o duplicado nasce não revisado, que é o pedido. (No a
 *   receber, a conta de DESTINO é outra coisa e é obrigatória — essa vai.)
 * - **data de pagamento, desconto, juros, outras despesas, data programada**:
 *   são fatos do pagamento que ainda não aconteceu.
 * - **vencimento das parcelas**: fica em branco, por escolha do Tiago em
 *   27/08/2026. Duplicar quase sempre serve para repetir uma despesa em outra
 *   data, e vencimento herdado é o tipo de campo que passa despercebido.
 * - **anexos**: a nota do documento antigo não é a do novo. `anexo_vinculos` não
 *   é tocado, então o duplicado nasce sem nenhum.
 * - **colaboradorId**: existe no detalhe mas não no `lancamentoSchema`, porque
 *   lançamento de colaborador vem de diária ou folha e nasce por lá. Como o
 *   duplicado é manual, o vínculo não desce.
 *
 * O QUE COPIA e costuma surpreender:
 * - **numeroDocumento**: vai. É "as mesmas informações", e no a receber a RPC
 *   exige. Vale conferir antes de aprovar: duas dívidas com a mesma nota é
 *   coisa que a conciliação não perdoa.
 */
export interface AvisoDuplicacao {
  /** Chave curta, para o teste e para a mensagem não divergirem. */
  chave: "origem" | "numeroDocumento" | "colaborador";
  texto: string;
}

/**
 * Por que um lançamento não pode ser duplicado. `null` quando pode.
 *
 * Só existe um motivo, e é o da parcela cancelada. Copiá-la ressuscitaria uma
 * linha que alguém desligou de propósito; deixá-la de fora faria a soma das
 * parcelas ficar menor que o valor, e aí RATEIO e FORMAS também teriam que
 * encolher — redistribuir isso é adivinhar em cima de dinheiro. Em 27/08/2026
 * não havia UMA parcela cancelada em 6.342 lançamentos, então recusar com uma
 * mensagem clara custa nada e não inventa regra para um caso que ninguém viu.
 */
export function motivoParaNaoDuplicar(
  original: LancamentoDetalhe,
): string | null {
  if (original.parcelas.some((parcela) => parcela.status === "cancelado")) {
    return "Este lançamento tem parcela cancelada. Duplicar teria que decidir sozinho o que fazer com o rateio e com as formas, então prefira criar o lançamento novo à mão.";
  }
  return null;
}

/** As parcelas que descem para o duplicado: sem data, sem conta, sem pagamento. */
function parcelasDuplicadas(
  original: LancamentoDetalhe,
): LancamentoInput["parcelas"] {
  return original.parcelas.map((parcela) => ({
    // O valor NOMINAL da parcela, nunca o líquido: desconto e juros são
    // fatos do pagamento do original e não seguem para uma dívida nova.
    valor: parcela.valor,
    // Em branco de propósito. Ver o cabeçalho deste arquivo.
    dataVencimento: undefined,
    formaPagamentoId:
      original.tipo === "a_receber"
        ? undefined
        : formaDaParcela(original, parcela.lancamentoFormaId),
  }));
}

/** O id da FORMA a partir do id do BLOCO, que é o que a parcela guarda. */
function formaDaParcela(
  original: LancamentoDetalhe,
  lancamentoFormaId: string | null,
): string | undefined {
  if (!lancamentoFormaId) return undefined;
  return original.formas.find((forma) => forma.id === lancamentoFormaId)
    ?.formaPagamentoId;
}

/** Rateio por centro de custo: desce igual. O custo é da mesma obra. */
function rateiosDuplicados(
  original: LancamentoDetalhe,
): LancamentoInput["rateios"] {
  return original.rateios.map((rateio) => ({
    centroCustoId: rateio.centroCustoId,
    valor: rateio.valor,
  }));
}

/**
 * Formas de pagamento e o cartão de cada uma: descem iguais no a pagar.
 *
 * No a RECEBER vai vazio, sempre. Recebimento não tem forma de pagamento (o
 * schema recusa com "Recebimento não tem forma de pagamento"), e um recebível
 * antigo com bloco de forma gravado por engano derrubaria a duplicação inteira
 * numa mensagem que não diz nada a quem clicou.
 */
function formasDuplicadas(
  original: LancamentoDetalhe,
): LancamentoInput["formas"] {
  if (original.tipo === "a_receber") return [];
  return original.formas.map((forma) => ({
    formaPagamentoId: forma.formaPagamentoId,
    cartaoId: forma.cartaoId ?? undefined,
    valor: forma.valor,
  }));
}

/** Texto vazio ou nulo vira `undefined`: é o que o schema espera de opcional. */
function opcional(valor: string | null): string | undefined {
  const limpo = (valor ?? "").trim();
  return limpo === "" ? undefined : limpo;
}

/** Zero em retenção significa "não teve", e o schema prefere ausente. */
function retencao(valor: number): number | undefined {
  return valor > 0 ? valor : undefined;
}

/**
 * O payload de um lançamento NOVO com os dados de um existente.
 *
 * Função pura: recebe o detalhe do original e devolve o que a action manda para
 * `salvarLancamento(null, ...)`. Reusar a action de criar (em vez de escrever um
 * insert próprio) é o que garante que o duplicado passe pela mesma validação,
 * pela mesma checagem de permissão por tipo e pela mesma regra de roteamento do
 * pagamento que um lançamento digitado à mão.
 */
export function dadosDuplicados(original: LancamentoDetalhe): LancamentoInput {
  const parcelas = parcelasDuplicadas(original);

  return {
    tipo: original.tipo,
    fornecedorId: original.fornecedorId ?? undefined,
    clienteId: original.clienteId ?? undefined,
    // No a receber a conta de DESTINO é obrigatória na RPC; no a pagar o banco
    // ignora este campo (lá quem revisa é a conta de cada parcela).
    contaBancariaId: original.contaBancariaId ?? undefined,
    categoriaId: original.categoriaId ?? undefined,
    // Mesma razão de `formasDuplicadas`: no a receber a forma não existe.
    formaPagamentoId:
      original.tipo === "a_receber"
        ? undefined
        : (original.formaPagamentoId ?? undefined),
    condicaoPagamentoId: original.condicaoPagamentoId ?? undefined,
    descricao: original.descricao,
    valor: original.valor,
    dataCompra: original.dataCompra,
    mesCompetencia: original.mesCompetencia,
    // O vencimento do CABEÇALHO acompanha o das parcelas: em branco.
    dataVencimento: undefined,
    numeroDocumento: opcional(original.numeroDocumento),
    observacoes: opcional(original.observacoes),
    eDivida: original.eDivida,
    valorBruto: original.valorBruto ?? undefined,
    retencaoIss: retencao(original.retencaoIss),
    retencaoPis: retencao(original.retencaoPis),
    retencaoCofins: retencao(original.retencaoCofins),
    retencaoCsll: retencao(original.retencaoCsll),
    retencaoIr: retencao(original.retencaoIr),
    retencaoInss: retencao(original.retencaoInss),
    retencaoOutras: retencao(original.retencaoOutras),
    parcelas,
    rateios: rateiosDuplicados(original),
    formas: formasDuplicadas(original),
  };
}

/**
 * O que a pessoa precisa saber sobre ESTE duplicado, para conferir antes de
 * aprovar. Vazio na maioria dos casos.
 */
export function avisosDaDuplicacao(
  original: LancamentoDetalhe,
): AvisoDuplicacao[] {
  const avisos: AvisoDuplicacao[] = [];

  if (original.origem !== "manual") {
    avisos.push({
      chave: "origem",
      texto: `O original veio de ${original.origem}; a cópia nasce como lançamento manual, solto da origem`,
    });
  }
  if (original.colaboradorId) {
    avisos.push({
      chave: "colaborador",
      texto: "A cópia não fica ligada ao colaborador do original",
    });
  }
  if (opcional(original.numeroDocumento)) {
    avisos.push({
      chave: "numeroDocumento",
      texto: `O número do documento (${original.numeroDocumento}) foi copiado: troque se a nota for outra`,
    });
  }

  return avisos;
}
