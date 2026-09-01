import { describe, expect, it } from "vitest";

import { formatarBRL } from "@/lib/formatadores";
import type { LancamentoLista } from "@/modules/financeiro/lancamentos/queries";
import {
  dinheiroDasParcelas,
  escolherValorRecorte,
  resumirLancamentos,
  situacaoDeAtraso,
  valorDasParcelasNoRecorte,
  type ParcelaParaResumo,
} from "@/modules/financeiro/lancamentos/resumo";

const HOJE = "2026-08-13";

/** Parcela com os campos que o cálculo usa, o resto no padrão. */
function parcela(p: Partial<ParcelaParaResumo>): ParcelaParaResumo {
  return {
    status: "pendente",
    valor: 100,
    valorLiquido: null,
    desconto: null,
    dataVencimento: "2026-09-10",
    ...p,
  };
}

/** Linha da listagem com o dinheiro já repartido. */
function linha(l: Partial<LancamentoLista>): LancamentoLista {
  return {
    id: "id-1",
    numero: "LAN-2026-0001",
    numeroDocumento: null,
    anexos: 0,
    tipo: "a_pagar",
    origem: "manual",
    descricao: "Linha",
    categoriaNome: null,
    centroCustoRotulo: "BR-364 Lote 9",
    fornecedorNome: null,
    colaboradorNome: null,
    valor: 100,
    dataVencimento: "2026-09-10",
    status: "a_pagar",
    qtdParcelas: 1,
    dataCompra: "2026-08-01",
    mesCompetencia: "2026-08-01",
    criadoEm: "2026-08-01T12:00:00.000Z",
    revisao: "revisado",
    valorPago: 0,
    valorAberto: 100,
    valorVencido: 0,
    descontoObtido: 0,
    valorRecorte: null,
    ...l,
  };
}

describe("dinheiroDasParcelas", () => {
  it("separa pago de aberto no lançamento parcialmente pago", () => {
    // O caso que motivou tudo: 107 lançamentos da base estão assim. Pelo status do
    // documento ele contaria inteiro como a pagar.
    const dinheiro = dinheiroDasParcelas(
      [
        parcela({ status: "pago", valor: 300, valorLiquido: 300 }),
        parcela({ status: "pendente", valor: 700 }),
      ],
      HOJE,
    );

    expect(dinheiro.valorPago).toBe(300);
    expect(dinheiro.valorAberto).toBe(700);
  });

  it("pago é o LÍQUIDO, e o desconto obtido aparece à parte", () => {
    // Saiu do banco 90, não 100. Usar o bruto infla o pago e faz o desconto
    // desaparecer da conta.
    const dinheiro = dinheiroDasParcelas(
      [parcela({ status: "pago", valor: 100, valorLiquido: 90, desconto: 10 })],
      HOJE,
    );

    expect(dinheiro.valorPago).toBe(90);
    expect(dinheiro.descontoObtido).toBe(10);
  });

  it("parcela antiga sem valor_liquido cai no valor cheio", () => {
    const dinheiro = dinheiroDasParcelas(
      [parcela({ status: "pago", valor: 100, valorLiquido: null })],
      HOJE,
    );

    expect(dinheiro.valorPago).toBe(100);
  });

  it("cancelada não é dívida: fica fora do aberto", () => {
    const dinheiro = dinheiroDasParcelas(
      [
        parcela({ status: "cancelado", valor: 500 }),
        parcela({ status: "pendente", valor: 200 }),
      ],
      HOJE,
    );

    expect(dinheiro.valorAberto).toBe(200);
    expect(dinheiro.valorPago).toBe(0);
  });

  it("em revisão continua em aberto: é pedido de ajuste, não baixa", () => {
    const dinheiro = dinheiroDasParcelas(
      [parcela({ status: "em_revisao", valor: 400 })],
      HOJE,
    );

    expect(dinheiro.valorAberto).toBe(400);
  });

  it("vencido é o aberto com vencimento antes de hoje", () => {
    const dinheiro = dinheiroDasParcelas(
      [
        parcela({ status: "pendente", valor: 100, dataVencimento: "2026-08-12" }),
        // Hoje NÃO está vencido: o prazo é hoje, ainda dá para pagar.
        parcela({ status: "pendente", valor: 200, dataVencimento: HOJE }),
        parcela({ status: "pendente", valor: 400, dataVencimento: "2026-08-14" }),
      ],
      HOJE,
    );

    expect(dinheiro.valorAberto).toBe(700);
    expect(dinheiro.valorVencido).toBe(100);
  });

  it("parcela paga em atraso não conta como vencida", () => {
    // Vencido é dívida atrasada. Parcela paga fora do prazo não é pendência.
    const dinheiro = dinheiroDasParcelas(
      [
        parcela({
          status: "pago",
          valor: 900,
          valorLiquido: 900,
          dataVencimento: "2026-01-01",
        }),
      ],
      HOJE,
    );

    expect(dinheiro.valorVencido).toBe(0);
    expect(dinheiro.valorPago).toBe(900);
  });

  it("parcela sem vencimento não está atrasada", () => {
    const dinheiro = dinheiroDasParcelas(
      [parcela({ status: "pendente", valor: 100, dataVencimento: null })],
      HOJE,
    );

    expect(dinheiro.valorVencido).toBe(0);
    expect(dinheiro.valorAberto).toBe(100);
  });

  it("lançamento sem parcela nenhuma não vira dinheiro nenhum", () => {
    expect(dinheiroDasParcelas([], HOJE)).toEqual({
      valorPago: 0,
      valorAberto: 0,
      valorVencido: 0,
      descontoObtido: 0,
    });
  });

  it("soma centavos sem resto binário", () => {
    // 0.1 + 0.2 em float dá 0.30000000000000004. Em centavos, dá 30.
    const dinheiro = dinheiroDasParcelas(
      [
        parcela({ status: "pendente", valor: 0.1 }),
        parcela({ status: "pendente", valor: 0.2 }),
      ],
      HOJE,
    );

    expect(dinheiro.valorAberto).toBe(0.3);
  });
});

/**
 * O que o filtro "Atraso" escolhe. Tem que casar com o cartão "Vencido" do
 * cabeçalho: se divergir, o cartão diz 3 e o filtro traz 5, e ninguém sabe qual
 * acreditar. As duas coisas passam por aqui.
 */
describe("situacaoDeAtraso", () => {
  it("uma parcela atrasada já deixa o lançamento vencido", () => {
    // Mesmo com as outras em dia: é o caso do lançamento de três parcelas em que
    // só a primeira estourou.
    expect(
      situacaoDeAtraso(
        [
          parcela({ status: "pendente", dataVencimento: "2026-08-01" }),
          parcela({ status: "pendente", dataVencimento: "2026-12-01" }),
        ],
        HOJE,
      ),
    ).toBe("vencido");
  });

  it("tudo em aberto e no prazo é a vencer", () => {
    expect(
      situacaoDeAtraso(
        [parcela({ status: "pendente", dataVencimento: "2026-09-10" })],
        HOJE,
      ),
    ).toBe("a_vencer");
  });

  it("vencendo hoje ainda é a vencer: dá para pagar hoje", () => {
    expect(
      situacaoDeAtraso([parcela({ status: "pendente", dataVencimento: HOJE })], HOJE),
    ).toBe("a_vencer");
  });

  it("quitado não é vencido nem a vencer, fica fora dos dois lados", () => {
    expect(
      situacaoDeAtraso(
        [parcela({ status: "pago", dataVencimento: "2026-01-01" })],
        HOJE,
      ),
    ).toBe("sem-aberto");
  });

  it("cancelada não segura o lançamento em aberto", () => {
    expect(
      situacaoDeAtraso(
        [parcela({ status: "cancelado", dataVencimento: "2026-01-01" })],
        HOJE,
      ),
    ).toBe("sem-aberto");
  });

  it("em revisão atrasada conta como vencida", () => {
    // `em_revisao` é pedido de ajuste, não baixa: o dinheiro continua devido e o
    // prazo continua correndo.
    expect(
      situacaoDeAtraso(
        [parcela({ status: "em_revisao", dataVencimento: "2026-07-01" })],
        HOJE,
      ),
    ).toBe("vencido");
  });

  it("parcela em aberto sem vencimento é a vencer, não vencida", () => {
    expect(
      situacaoDeAtraso(
        [parcela({ status: "pendente", dataVencimento: null })],
        HOJE,
      ),
    ).toBe("a_vencer");
  });

  it("sem parcela nenhuma não entra no filtro", () => {
    expect(situacaoDeAtraso([], HOJE)).toBe("sem-aberto");
  });

  it("classifica igual ao cartão: vencido só quando há valor vencido", () => {
    // A trava contra divergência entre o filtro e o KPI: as duas funções olhando
    // as mesmas parcelas têm que concordar.
    const parcelas = [
      parcela({ status: "pago", valor: 300, valorLiquido: 300 }),
      parcela({ status: "pendente", valor: 700, dataVencimento: "2026-08-10" }),
    ];

    expect(situacaoDeAtraso(parcelas, HOJE)).toBe("vencido");
    expect(dinheiroDasParcelas(parcelas, HOJE).valorVencido).toBe(700);

    const emDia = [
      parcela({ status: "pendente", valor: 700, dataVencimento: "2026-09-10" }),
    ];
    expect(situacaoDeAtraso(emDia, HOJE)).toBe("a_vencer");
    expect(dinheiroDasParcelas(emDia, HOJE).valorVencido).toBe(0);
  });
});

describe("resumirLancamentos", () => {
  it("filtro vazio zera tudo em vez de devolver undefined", () => {
    const r = resumirLancamentos([]);

    expect(r.quantidade).toBe(0);
    expect(r.valorTotal).toBe(0);
    expect(r.valorAberto).toBe(0);
    expect(r.quantidadeComSaldo).toBe(0);
  });

  it("soma valores e conta quitado, com saldo, vencido e parcial", () => {
    const r = resumirLancamentos([
      // Quitado.
      linha({ id: "a", valor: 1000, valorPago: 1000, valorAberto: 0 }),
      // Em aberto puro.
      linha({ id: "b", valor: 500, valorPago: 0, valorAberto: 500 }),
      // Parcial e vencido.
      linha({
        id: "c",
        valor: 900,
        valorPago: 300,
        valorAberto: 600,
        valorVencido: 600,
      }),
    ]);

    expect(r.quantidade).toBe(3);
    expect(r.valorTotal).toBe(2400);
    expect(r.valorPago).toBe(1300);
    expect(r.valorAberto).toBe(1100);
    expect(r.valorVencido).toBe(600);
    expect(r.quantidadeQuitados).toBe(1);
    expect(r.quantidadeComSaldo).toBe(2);
    expect(r.quantidadeVencidos).toBe(1);
    // Parcial = tem saldo E já pagou parte. O "b" não conta, o "c" conta.
    expect(r.quantidadeParciais).toBe(1);
  });

  it("a revisar conta só sem-conta e parcial, com o dinheiro em aberto deles", () => {
    const r = resumirLancamentos([
      linha({ id: "a", revisao: "sem-conta", valorAberto: 100 }),
      linha({ id: "b", revisao: "parcial", valorAberto: 250 }),
      linha({ id: "c", revisao: "revisado", valorAberto: 900 }),
      // A receber, ou sem parcela: a pergunta não se aplica.
      linha({ id: "d", revisao: "nao-se-aplica", valorAberto: 700 }),
    ]);

    expect(r.quantidadeARevisar).toBe(2);
    expect(r.valorARevisar).toBe(350);
  });

  it("soma o desconto obtido de todas as linhas", () => {
    const r = resumirLancamentos([
      linha({ id: "a", valorPago: 90, valorAberto: 0, descontoObtido: 10 }),
      linha({ id: "b", valorPago: 45, valorAberto: 0, descontoObtido: 5 }),
    ]);

    expect(r.descontoObtido).toBe(15);
  });

  it("mantém o centavo exato somando muitas linhas quebradas", () => {
    // 3.000 linhas de R$ 10,01. Em float o acumulado erra; em centavos fecha.
    const itens = Array.from({ length: 3000 }, (_, i) =>
      linha({ id: `id-${i}`, valor: 10.01, valorAberto: 10.01 }),
    );
    const r = resumirLancamentos(itens);

    expect(r.valorTotal).toBe(30_030);
    expect(r.valorAberto).toBe(30_030);
    // Pelo formatador, que é como o número chega na tela (espaço não separável
    // no "R$" faz literal cru nunca bater).
    expect(formatarBRL(r.valorTotal)).toBe(formatarBRL(30_030));
  });
});

describe("valorDasParcelasNoRecorte", () => {
  it("soma pelo valor quando a medida é valor", () => {
    const total = valorDasParcelasNoRecorte(
      [
        parcela({ status: "pendente", valor: 100 }),
        parcela({ status: "pago", valor: 200, valorLiquido: 180, desconto: 20 }),
      ],
      "valor",
    );
    expect(total).toBe(300);
  });

  it("soma pelo líquido quando a medida é líquido", () => {
    const total = valorDasParcelasNoRecorte(
      [parcela({ status: "pago", valor: 200, valorLiquido: 180, desconto: 20 })],
      "liquido",
    );
    expect(total).toBe(180);
  });

  it("cai no valor cheio quando o líquido é nulo", () => {
    // valor_liquido aceita nulo no banco (parcela antiga). É a mesma defesa que
    // dinheiroDasParcelas já faz, e não um cuidado novo.
    const total = valorDasParcelasNoRecorte(
      [parcela({ status: "pago", valor: 200, valorLiquido: null })],
      "liquido",
    );
    expect(total).toBe(200);
  });

  it("soma em centavos: três parcelas de 0,10 dão 0,30 exato", () => {
    const total = valorDasParcelasNoRecorte(
      [0.1, 0.1, 0.1].map((valor) => parcela({ valor })),
      "valor",
    );
    expect(total).toBe(0.3);
  });

  it("sem parcela, o recorte é zero", () => {
    expect(valorDasParcelasNoRecorte([], "valor")).toBe(0);
  });
});

/**
 * O recorte é o que faz o total da lista fechar com a célula do relatório que foi
 * clicada. O caso que motivou tudo: 121 lançamentos da base são rateados entre
 * duas ou mais obras, e o relatório de centro de custo contou só a parte daquele
 * centro. Sem recorte, clicar numa célula de R$ 3,23 mi abriria uma lista somando
 * R$ 3,29 mi, e quem confere concluiria que um dos dois está errado.
 */
describe("resumirLancamentos com recorte", () => {
  it("sem recorte, o total continua sendo o valor do documento", () => {
    const resumo = resumirLancamentos([
      linha({ valor: 100 }),
      linha({ id: "id-2", valor: 50 }),
    ]);
    expect(resumo.valorTotal).toBe(150);
    expect(resumo.temRecorte).toBe(false);
    expect(resumo.valorNoRecorte).toBe(150);
  });

  it("com recorte, soma a fatia e não o valor cheio", () => {
    const resumo = resumirLancamentos([
      linha({ valor: 100_000, valorRecorte: 40_000 }),
      linha({ id: "id-2", valor: 6_576, valorRecorte: 6_576 }),
    ]);
    // O valor do documento continua disponível: a coluna Valor não muda.
    expect(resumo.valorTotal).toBe(106_576);
    expect(resumo.temRecorte).toBe(true);
    expect(resumo.valorNoRecorte).toBe(46_576);
  });

  it("linha sem recorte no meio de linhas recortadas cai no valor cheio", () => {
    // Caso PARCIAL, não o extremo. Se o código somasse `valorRecorte ?? 0` este
    // teste pegaria; se somasse sempre `valor`, também pegaria. Um caso "todas
    // recortadas" não pega nenhum dos dois.
    const resumo = resumirLancamentos([
      linha({ valor: 100, valorRecorte: 40 }),
      linha({ id: "id-2", valor: 70, valorRecorte: null }),
      linha({ id: "id-3", valor: 30, valorRecorte: 30 }),
    ]);
    expect(resumo.temRecorte).toBe(true);
    expect(resumo.valorNoRecorte).toBe(140);
  });

  it("recorte zerado é fatia de zero, não ausência de fatia", () => {
    const resumo = resumirLancamentos([linha({ valor: 100, valorRecorte: 0 })]);
    expect(resumo.temRecorte).toBe(true);
    expect(resumo.valorNoRecorte).toBe(0);
  });

  it("soma o recorte em centavos, sem resto binário em muitas linhas", () => {
    const resumo = resumirLancamentos(
      Array.from({ length: 3 }, (_, indice) =>
        linha({ id: `id-${indice}`, valor: 1, valorRecorte: 0.1 }),
      ),
    );
    expect(resumo.valorNoRecorte).toBe(0.3);
  });
});

describe("escolherValorRecorte", () => {
  it("sem nada, não há recorte", () => {
    expect(escolherValorRecorte(null, null)).toBeNull();
  });

  it("só centro: o recorte é o rateio", () => {
    expect(escolherValorRecorte(40_000, null, 100_000)).toBe(40_000);
  });

  it("só parcela: o recorte é a fatia da parcela", () => {
    expect(escolherValorRecorte(null, 180, 100_000)).toBe(180);
  });

  it("os dois juntos: é a parte do centro DENTRO das parcelas da fatia", () => {
    // Documento de R$ 100.000 com R$ 40.000 rateados para o centro escolhido, e
    // R$ 10.000 de parcela caindo no mês clicado: 40% de 10.000.
    //
    // Até 01/09/2026 o centro ganhava sozinho e devolvia 40.000 aqui. O Fluxo de
    // caixa por centro de custo quebrou nisso: a barra de um mês soma
    // `liquido × fatia`, e a lista somava o rateio do documento INTEIRO — um
    // financiamento de 57 prestações aparecia todo no clique de um mês só.
    expect(escolherValorRecorte(40_000, 10_000, 100_000)).toBe(4_000);
  });

  it("o centro inteiro é fatia de 100%: a parcela passa igual", () => {
    // Linha de controle. Rateio de um centro só significa que a proporção é 1, e
    // então o recorte de parcela tem de voltar intacto — se a conta estivesse
    // invertida (dividir pela parcela, por exemplo), este caso mudaria.
    expect(escolherValorRecorte(100_000, 10_000, 100_000)).toBe(10_000);
  });

  it("as fatias de dois centros somam a parcela do mês", () => {
    // O mesmo documento visto por cada metade do rateio: 60% + 40% = a parcela.
    // É o que faz a soma da lista fechar com a barra do gráfico.
    const parcelaDoMes = 10_000;
    expect(escolherValorRecorte(60_000, parcelaDoMes, 100_000)!).toBe(6_000);
    expect(escolherValorRecorte(40_000, parcelaDoMes, 100_000)!).toBe(4_000);
    expect(
      escolherValorRecorte(60_000, parcelaDoMes, 100_000)! +
        escolherValorRecorte(40_000, parcelaDoMes, 100_000)!,
    ).toBe(parcelaDoMes);
  });

  it("arredonda uma vez, em centavos, no fim", () => {
    // Um terço de R$ 0,10 é R$ 0,03 — não 0,033333. A conta é feita em centavos
    // e arredondada uma vez só, senão o resto vaza para a soma da tela.
    expect(escolherValorRecorte(1_000, 0.1, 3_000)).toBe(0.03);
  });

  it("sem o valor do documento, sobra a fatia do centro", () => {
    // Quem chama sem o terceiro argumento é o caminho antigo (só centro, sem
    // recorte de parcela): o comportamento dele não pode mudar.
    expect(escolherValorRecorte(40_000, 180)).toBe(40_000);
  });

  it("documento de valor zero não tem proporção: sobra a fatia do centro", () => {
    expect(escolherValorRecorte(0, 180, 0)).toBe(0);
  });

  it("centro com zero ganha de parcela com valor", () => {
    // Zero é fatia de zero: a comparação é com null, não com falsidade. Zero de
    // rateio no centro escolhido quer dizer que o documento não encosta nele.
    expect(escolherValorRecorte(0, 180, 100_000)).toBe(0);
  });
});
