import { describe, expect, it } from "vitest";

import type { ParcelaForm } from "@/modules/compras/ordens/calculo-parcelas";
import {
  ehParcelaEditavel,
  ehParcelaPreservada,
  motivoParaNaoSalvar,
  separarParcelas,
  totalDepoisDaEdicao,
  totalPreservado,
  type ParcelaGravada,
} from "@/modules/financeiro/lancamentos/parcelas-editaveis";

/**
 * O caso real: LAN-2026-1603, ICMS renegociado com a SEFAZ.
 *
 * R$ 69.826,48 em 41 parcelas. As três pagas somam R$ 5.247,76, e o que resta
 * (R$ 64.578,72) são exatamente 38 parcelas de R$ 1.699,44 — a conta do
 * lançamento fecha, e é ela que os testes usam como âncora.
 */
const PAGAS: ParcelaGravada[] = [
  { numeroParcela: 1, dataVencimento: "2026-05-29", valor: 1795.84, status: "pago" },
  { numeroParcela: 2, dataVencimento: "2026-06-29", valor: 1716.44, status: "pago" },
  { numeroParcela: 3, dataVencimento: "2026-07-30", valor: 1735.48, status: "pago" },
];

const TOTAL_PAGO = 5247.76;
const TOTAL_LANCAMENTO = 69826.48;
const ABERTAS_QUANTAS = 38;
const ABERTA_VALOR = 1699.44;

function abertas(quantas = ABERTAS_QUANTAS): ParcelaGravada[] {
  return Array.from({ length: quantas }, (_, indice) => ({
    numeroParcela: 4 + indice,
    dataVencimento: `2026-08-29`,
    valor: ABERTA_VALOR,
    // A primeira em aberto está "em revisão" na tela: também é editável.
    status: indice === 0 ? "em_revisao" : "pendente",
  }));
}

function comoFormulario(parcelas: ParcelaGravada[]): ParcelaForm[] {
  return parcelas.map((parcela) => ({
    dataVencimento: parcela.dataVencimento ?? "",
    valor: parcela.valor.toFixed(2).replace(".", ","),
  }));
}

const LANCAMENTO = [...PAGAS, ...abertas()];

describe("o caso do LAN-2026-1603 fecha", () => {
  it("as três pagas somam R$ 5.247,76", () => {
    expect(totalPreservado(LANCAMENTO)).toBe(TOTAL_PAGO);
  });

  it("38 parcelas de R$ 1.699,44 mais as pagas dão o total do lançamento", () => {
    expect(totalDepoisDaEdicao(LANCAMENTO, comoFormulario(abertas()))).toBe(
      TOTAL_LANCAMENTO,
    );
  });
});

describe("quem pode ser tocada", () => {
  it("paga e aprovada são preservadas", () => {
    expect(ehParcelaPreservada("pago")).toBe(true);
    expect(ehParcelaPreservada("aprovado")).toBe(true);
    expect(ehParcelaEditavel("pago")).toBe(false);
    expect(ehParcelaEditavel("aprovado")).toBe(false);
  });

  it("pendente e em revisão são editáveis", () => {
    // Em revisão é pedido de ajuste, não baixa: continua devendo e dá para mexer.
    expect(ehParcelaEditavel("pendente")).toBe(true);
    expect(ehParcelaEditavel("em_revisao")).toBe(true);
  });

  it("cancelada não é editável nem preservada", () => {
    expect(ehParcelaEditavel("cancelado")).toBe(false);
    expect(ehParcelaPreservada("cancelado")).toBe(false);
  });

  it("separa os três grupos sem perder nem duplicar parcela", () => {
    const comCancelada: ParcelaGravada[] = [
      ...PAGAS,
      { numeroParcela: 4, dataVencimento: "2026-08-29", valor: 500, status: "cancelado" },
      { numeroParcela: 5, dataVencimento: "2026-09-29", valor: 100, status: "aprovado" },
      { numeroParcela: 6, dataVencimento: "2026-10-29", valor: 200, status: "pendente" },
    ];
    const grupos = separarParcelas(comCancelada);

    expect(grupos.preservadas).toHaveLength(4);
    expect(grupos.editaveis).toHaveLength(1);
    expect(grupos.canceladas).toHaveLength(1);
    expect(
      grupos.preservadas.length + grupos.editaveis.length + grupos.canceladas.length,
    ).toBe(comCancelada.length);
  });

  it("parcela cancelada fica fora do total", () => {
    const comCancelada: ParcelaGravada[] = [
      ...PAGAS,
      { numeroParcela: 4, dataVencimento: "2026-08-29", valor: 9999, status: "cancelado" },
    ];
    // Os R$ 9.999 cancelados não podem inflar o lançamento.
    expect(totalPreservado(comCancelada)).toBe(TOTAL_PAGO);
  });
});

describe("o total segue as parcelas", () => {
  it("mudar o valor de UMA parcela muda o total do lançamento", () => {
    const editadas = comoFormulario(abertas());
    editadas[0] = { ...editadas[0], valor: "1750,00" };

    const esperado = TOTAL_LANCAMENTO - ABERTA_VALOR + 1750;
    expect(totalDepoisDaEdicao(LANCAMENTO, editadas)).toBe(esperado);
  });

  it("apagar uma parcela em aberto abaixa o total", () => {
    const editadas = comoFormulario(abertas()).slice(0, -1);
    expect(totalDepoisDaEdicao(LANCAMENTO, editadas)).toBe(
      TOTAL_LANCAMENTO - ABERTA_VALOR,
    );
  });

  it("acrescentar parcela sobe o total", () => {
    const editadas = [
      ...comoFormulario(abertas()),
      { dataVencimento: "2029-11-29", valor: "1000,00" },
    ];
    expect(totalDepoisDaEdicao(LANCAMENTO, editadas)).toBe(
      TOTAL_LANCAMENTO + 1000,
    );
  });

  it("apagar TODAS as em aberto deixa o lançamento valendo só o que foi pago", () => {
    expect(totalDepoisDaEdicao(LANCAMENTO, [])).toBe(TOTAL_PAGO);
  });

  it("o que foi pago é o piso: nunca sai do total", () => {
    const so_uma: ParcelaForm[] = [{ dataVencimento: "2026-08-29", valor: "0,01" }];
    expect(totalDepoisDaEdicao(LANCAMENTO, so_uma)).toBe(TOTAL_PAGO + 0.01);
  });

  it("soma 38 parcelas sem erro de centavo", () => {
    // 38 x 1.699,44 em float dá 64578.719999999... Se a soma passar por float
    // sem centavos inteiros, o total do lançamento sai errado por 1 centavo.
    const editadas = comoFormulario(abertas());
    expect(totalDepoisDaEdicao([], editadas)).toBe(64578.72);
  });
});

describe("o que impede de salvar", () => {
  // `justificativa` preenchida no base porque LANCAMENTO já tem parcelas, e
  // alterar parcela existente passou a exigir o motivo (o banco recusa sem ele).
  // Os testes que provam essa regra passam a justificativa de propósito.
  const base = {
    gravadas: LANCAMENTO,
    origem: "manual",
    valorDoCabecalho: TOTAL_LANCAMENTO,
    justificativa: "Ajuste combinado com o fornecedor",
  };

  it("o caso normal salva", () => {
    expect(
      motivoParaNaoSalvar({ ...base, editadas: comoFormulario(abertas()) }),
    ).toBeNull();
  });

  it("em manual, o total NÃO precisa fechar com o cabeçalho: ele que segue", () => {
    const editadas = comoFormulario(abertas());
    editadas[0] = { ...editadas[0], valor: "9999,00" };
    expect(motivoParaNaoSalvar({ ...base, editadas })).toBeNull();
  });

  it("alterar parcelas de um lançamento que já tinha exige justificativa", () => {
    // O banco recusa sem motivo quando já existe parcela: a tela avisa antes de
    // o usuário digitar tudo e levar erro no fim.
    const motivo = motivoParaNaoSalvar({
      ...base,
      editadas: comoFormulario(abertas()),
      justificativa: "   ",
    });
    expect(motivo).toContain("por que");
  });

  it("com justificativa preenchida, salva", () => {
    expect(
      motivoParaNaoSalvar({
        ...base,
        editadas: comoFormulario(abertas()),
        justificativa: "Renegociação com a SEFAZ",
      }),
    ).toBeNull();
  });

  it("definir parcelas pela primeira vez NÃO exige justificativa", () => {
    // Lançamento que nasceu sem parcela nenhuma: é definição inicial, não
    // alteração de algo combinado. Exigir texto aqui seria burocracia.
    expect(
      motivoParaNaoSalvar({
        gravadas: [],
        origem: "manual",
        valorDoCabecalho: 1000,
        editadas: [{ dataVencimento: "2026-09-29", valor: "1000,00" }],
        justificativa: "",
      }),
    ).toBeNull();
  });

  it("em lançamento de origem, o cabeçalho manda e a soma tem que fechar", () => {
    const editadas = comoFormulario(abertas());
    editadas[0] = { ...editadas[0], valor: "9999,00" };
    const motivo = motivoParaNaoSalvar({ ...base, editadas, origem: "oc" });
    expect(motivo).toContain("vem da origem");
  });

  it("em lançamento de origem, fechando exato, salva", () => {
    expect(
      motivoParaNaoSalvar({
        ...base,
        editadas: comoFormulario(abertas()),
        origem: "oc",
      }),
    ).toBeNull();
  });

  it("apagar tudo num lançamento sem parcela paga não salva", () => {
    const semPagas = abertas(2);
    expect(
      motivoParaNaoSalvar({
        gravadas: semPagas,
        editadas: [],
        origem: "manual",
        valorDoCabecalho: 2 * ABERTA_VALOR,
      }),
    ).toContain("ao menos uma parcela");
  });

  it("apagar tudo COM parcela paga é permitido: sobra o que já foi pago", () => {
    // Não é caso de erro: o lançamento passa a valer os R$ 5.247,76 pagos.
    expect(
      motivoParaNaoSalvar({ ...base, editadas: [] }),
    ).toBeNull();
  });

  it("total zerado não passa", () => {
    expect(
      motivoParaNaoSalvar({
        gravadas: abertas(1),
        editadas: [{ dataVencimento: "2026-08-29", valor: "0" }],
        origem: "manual",
        valorDoCabecalho: ABERTA_VALOR,
      }),
    ).toContain("maior que zero");
  });
});
