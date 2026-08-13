import { describe, expect, it } from "vitest";

import { formatarBRL } from "@/lib/formatadores";
import type { LancamentoLista } from "@/modules/financeiro/lancamentos/queries";
import {
  dinheiroDasParcelas,
  resumirLancamentos,
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
    tipo: "a_pagar",
    origem: "manual",
    descricao: "Linha",
    categoriaNome: null,
    fornecedorNome: null,
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
