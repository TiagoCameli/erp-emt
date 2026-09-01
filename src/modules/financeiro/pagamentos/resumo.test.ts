import { describe, expect, it } from "vitest";

import type { ParcelaAprovada } from "@/modules/financeiro/pagamentos/queries";
import {
  contagem,
  podePagarParcela,
  somarPagas,
  somarParaResumo,
  RESUMO_PAGAS_VAZIO,
  type LinhaPaga,
} from "@/modules/financeiro/pagamentos/resumo";

const HOJE = "2026-08-19";

function parcela(sobrescreve: Partial<ParcelaAprovada> = {}): ParcelaAprovada {
  return {
    id: crypto.randomUUID(),
    lancamentoId: crypto.randomUUID(),
    lancamentoNumero: "LAN-2026-0001",
    numeroParcela: 1,
    descricao: "Diesel S10",
    categoriaNome: "Combustível",
    fornecedorNome: "Areacre",
    dataVencimento: "2026-08-25",
    dataProgramada: "2026-08-25",
    dataProgramadaOrigem: null,
    valor: 1000,
    aprovadoEm: null,
    status: "aprovado",
    ...sobrescreve,
  };
}

describe("podePagarParcela", () => {
  it("só aprovada pode ser paga", () => {
    expect(podePagarParcela(parcela({ status: "aprovado" }))).toBe(true);
    expect(podePagarParcela(parcela({ status: "pendente" }))).toBe(false);
    expect(podePagarParcela(parcela({ status: "em_revisao" }))).toBe(false);
  });

  it("parcela sem status vinda de Programados continua pagável", () => {
    // A fila de Programados já é só de aprovadas e não carrega o campo: tratar
    // a ausência como "não pode" tiraria o botão de pagar daquela tela.
    expect(podePagarParcela(parcela({ status: undefined }))).toBe(true);
  });
});

describe("somarParaResumo", () => {
  it("separa o que pode ser pago do que ainda espera aprovação", () => {
    const resumo = somarParaResumo(
      [
        parcela({ status: "aprovado", valor: 1000 }),
        parcela({ status: "aprovado", valor: 500 }),
        parcela({ status: "pendente", valor: 300 }),
        parcela({ status: "em_revisao", valor: 200 }),
      ],
      HOJE,
    );

    expect(resumo.total).toBe(2000);
    expect(resumo.parcelas).toBe(4);
    expect(resumo.aprovado).toBe(1500);
    expect(resumo.aprovadas).toBe(2);
    expect(resumo.aguardando).toBe(500);
    expect(resumo.aguardandoParcelas).toBe(2);
  });

  it("vencido é o que passou de hoje, aprovado ou não", () => {
    const resumo = somarParaResumo(
      [
        parcela({ dataVencimento: "2026-08-18", valor: 100 }),
        parcela({
          status: "pendente",
          dataVencimento: "2026-08-01",
          valor: 400,
        }),
        parcela({ dataVencimento: HOJE, valor: 900 }),
        parcela({ dataVencimento: "2026-09-01", valor: 700 }),
      ],
      HOJE,
    );

    // Vence HOJE ainda não está vencida: quem paga no dia paga em dia.
    expect(resumo.vencido).toBe(500);
    expect(resumo.vencidas).toBe(2);
  });

  it("parcela sem vencimento não conta como vencida", () => {
    const resumo = somarParaResumo(
      [parcela({ dataVencimento: null, valor: 100 })],
      HOJE,
    );
    expect(resumo.vencido).toBe(0);
    expect(resumo.total).toBe(100);
  });

  it("conjunto vazio soma zero em tudo", () => {
    const resumo = somarParaResumo([], HOJE);
    expect(resumo.total).toBe(0);
    expect(resumo.parcelas).toBe(0);
    expect(resumo.aprovado).toBe(0);
    expect(resumo.vencido).toBe(0);
  });

  it("o total é a soma das parcelas, e não a soma dos cards", () => {
    // Linha de controle: uma parcela vencida E aprovada entra nos dois cards.
    // Somar os quatro números daria mais que o total, e é assim mesmo — os
    // cards respondem perguntas diferentes. Se algum dia alguém "consertar"
    // isso subtraindo, este teste quebra.
    const vencidaEAprovada = parcela({
      status: "aprovado",
      dataVencimento: "2026-08-01",
      valor: 1000,
    });
    const resumo = somarParaResumo([vencidaEAprovada], HOJE);

    expect(resumo.total).toBe(1000);
    expect(resumo.aprovado).toBe(1000);
    expect(resumo.vencido).toBe(1000);
    expect(resumo.aprovado + resumo.vencido).not.toBe(resumo.total);
  });
});

describe("contagem", () => {
  it("concorda em número", () => {
    expect(contagem(0)).toBe("0 parcelas");
    expect(contagem(1)).toBe("1 parcela");
    expect(contagem(2)).toBe("2 parcelas");
  });
});

/**
 * A soma do histórico filtrado, que alimenta o card "Pago no filtro" e o rodapé
 * da tabela de pagas.
 *
 * O que está sendo defendido é a EXATIDÃO do acumulador. Um total de dinheiro
 * errado por frações de centavo não quebra nada e não avisa nada: ele só deixa
 * de bater com a soma em SQL do Painel e com a conferência que alguém faz contra
 * o extrato, e aí a discussão vira "de quem é o número certo".
 */
describe("somarPagas", () => {
  function linha(parcial: Partial<LinhaPaga>): LinhaPaga {
    return {
      valor: 0,
      desconto: null,
      juros: null,
      outras_despesas: null,
      valor_liquido: 0,
      ...parcial,
    };
  }

  it("soma os cinco campos e conta as parcelas", () => {
    const resumo = somarPagas([
      linha({ valor: 1000, desconto: 50, valor_liquido: 950 }),
      linha({ valor: 200, juros: 10, outras_despesas: 5, valor_liquido: 215 }),
    ]);

    expect(resumo).toEqual({
      parcelas: 2,
      valor: 1200,
      desconto: 50,
      juros: 10,
      outrasDespesas: 5,
      valorLiquido: 1165,
      // Quem sabe se houve recorte por centro é quem filtrou, não a soma.
      recortado: false,
    });
  });

  it("LINHA DE CONTROLE: cem parcelas de 0,07 somam 7,00 exatos", () => {
    /*
     * É a prova de que o acumulador é inteiro. Somando em reais, o resultado sai
     * 7.000000000000001 e o `toBe(7)` falha — que é exatamente o rastro que
     * apareceria no total de um recorte de milhares de linhas.
     */
    const centavo = Array.from({ length: 100 }, () =>
      linha({ valor: 0.07, valor_liquido: 0.07 }),
    );
    const resumo = somarPagas(centavo);

    expect(resumo.valor).toBe(7);
    expect(resumo.valorLiquido).toBe(7);
  });

  it("a soma obedece à mesma identidade de uma linha", () => {
    // valor − desconto + juros + despesas = líquido. Se o total não obedecer, o
    // rodapé mostra uma conta que não fecha na cara de quem confere.
    const resumo = somarPagas([
      linha({ valor: 1500.55, desconto: 0.55, valor_liquido: 1500 }),
      linha({ valor: 99.99, juros: 0.01, valor_liquido: 100 }),
      linha({ valor: 10, outras_despesas: 2.5, valor_liquido: 12.5 }),
    ]);

    expect(
      resumo.valor - resumo.desconto + resumo.juros + resumo.outrasDespesas,
    ).toBe(resumo.valorLiquido);
  });

  it("nulo é zero: parcela sem ajuste nenhum", () => {
    // O banco grava null onde não houve desconto/juros/despesa. Virar NaN aqui
    // apagaria o total inteiro, não só a linha.
    const resumo = somarPagas([linha({ valor: 300, valor_liquido: 300 })]);
    expect(resumo).toEqual({
      parcelas: 1,
      valor: 300,
      desconto: 0,
      juros: 0,
      outrasDespesas: 0,
      valorLiquido: 300,
      recortado: false,
    });
  });

  it("numérico que chega como TEXTO soma igual", () => {
    // NUMERIC do Postgres pode chegar como string no JSON do PostgREST. Somar
    // string com `+` concatenaria ("1000" + "200" = "1000200").
    const resumo = somarPagas([
      linha({ valor: "1000.50", valor_liquido: "1000.50" }),
      linha({ valor: "200.25", valor_liquido: "200.25" }),
    ]);
    expect(resumo.valor).toBe(1200.75);
  });

  it("recorte vazio devolve tudo zero, não NaN", () => {
    expect(somarPagas([])).toEqual(RESUMO_PAGAS_VAZIO);
  });
});
