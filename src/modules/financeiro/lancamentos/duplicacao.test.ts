import { describe, expect, it } from "vitest";

import {
  avisosDaDuplicacao,
  dadosDuplicados,
  motivoParaNaoDuplicar,
} from "@/modules/financeiro/lancamentos/duplicacao";
import type { LancamentoDetalhe } from "@/modules/financeiro/lancamentos/queries";
import { lancamentoSchema } from "@/modules/financeiro/lancamentos/schemas";

const FORNECEDOR = "11111111-1111-4111-8111-111111111111";
const CLIENTE = "22222222-2222-4222-8222-222222222222";
const CATEGORIA = "33333333-3333-4333-8333-333333333333";
const FORMA_BOLETO = "44444444-4444-4444-8444-444444444444";
const FORMA_CARTAO = "55555555-5555-4555-8555-555555555555";
const CARTAO = "66666666-6666-4666-8666-666666666666";
const CONDICAO = "77777777-7777-4777-8777-777777777777";
const CENTRO = "88888888-8888-4888-8888-888888888888";
const CONTA = "99999999-9999-4999-8999-999999999999";

/**
 * Um lançamento a pagar REVISADO E APROVADO, com duas parcelas (uma já paga),
 * conta bancária escolhida, anexo e origem de OC — o caso que o Tiago descreveu:
 * "mesmo que o que foi utilizado para duplicação esteja revisado e aprovado".
 */
function lancamentoAprovado(
  troca: Partial<LancamentoDetalhe> = {},
): LancamentoDetalhe {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    numero: "LAN-2026-0471",
    tipo: "a_pagar",
    origem: "manual",
    origemId: null,
    fornecedorId: FORNECEDOR,
    fornecedorNome: "ATAIDE LOPES",
    colaboradorId: null,
    colaboradorNome: null,
    clienteId: null,
    clienteNome: null,
    contaBancariaId: null,
    contaBancariaNome: null,
    categoriaId: CATEGORIA,
    categoriaNome: "Outras despesas",
    descricao: "Conserto do motor da patrol",
    valor: 6000,
    valorBruto: null,
    retencaoIss: 0,
    retencaoPis: 0,
    retencaoCofins: 0,
    retencaoCsll: 0,
    retencaoIr: 0,
    retencaoInss: 0,
    retencaoOutras: 0,
    status: "aprovado",
    mesCompetencia: "2026-08-01",
    dataCompra: "2026-08-17",
    criadoEm: "2026-08-18T12:00:00Z",
    dataVencimento: "2026-08-28",
    numeroDocumento: "NF 12345",
    observacoes: "Combinado com o Jaime",
    eDivida: false,
    parcelas: [
      {
        id: "p1",
        numeroParcela: 1,
        valor: 3000,
        // Desconto e juros são fatos do pagamento do ORIGINAL.
        desconto: 100,
        juros: 0,
        outrasDespesas: 0,
        valorLiquido: 2900,
        dataVencimento: "2026-08-28",
        status: "pago",
        dataProgramada: "2026-08-28",
        dataProgramadaOrigem: null,
        contaBancariaId: CONTA,
        contaBancariaNome: "BB 102.124-9",
        dataPagamento: "2026-08-28",
        lancamentoFormaId: "bloco-boleto",
      },
      {
        id: "p2",
        numeroParcela: 2,
        valor: 3000,
        desconto: 0,
        juros: 0,
        outrasDespesas: 0,
        valorLiquido: 3000,
        dataVencimento: "2026-09-28",
        status: "aprovado",
        dataProgramada: null,
        dataProgramadaOrigem: null,
        contaBancariaId: CONTA,
        contaBancariaNome: "BB 102.124-9",
        dataPagamento: null,
        lancamentoFormaId: "bloco-boleto",
      },
    ],
    rateios: [
      {
        id: "r1",
        centroCustoId: CENTRO,
        centroCustoNome: "Motoniveladora 12H - 01",
        centroCustoCodigo: null,
        valor: 6000,
      },
    ],
    formas: [
      {
        id: "bloco-boleto",
        formaPagamentoId: FORMA_BOLETO,
        formaPagamentoNome: "Boleto",
        formaPagamentoTipo: "bancario",
        cartaoId: null,
        cartaoRotulo: null,
        valor: 6000,
      },
    ],
    condicaoPagamentoId: CONDICAO,
    condicaoPagamentoDescricao: "30/60",
    formaPagamentoId: FORMA_BOLETO,
    formaPagamentoNome: "Boleto",
    formaPagamentoTipo: "bancario",
    origemNumero: null,
    notaRegistrada: true,
    ...troca,
  } as LancamentoDetalhe;
}

describe("dadosDuplicados", () => {
  it("o payload passa pelo schema do servidor", () => {
    // O juiz de verdade: se isto falhar, a action recusaria o duplicado antes
    // mesmo de chegar ao banco.
    const r = lancamentoSchema.safeParse(dadosDuplicados(lancamentoAprovado()));
    if (!r.success) {
      throw new Error(
        `schema recusou: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ")}`,
      );
    }
    expect(r.success).toBe(true);
  });

  it("copia o que identifica a despesa", () => {
    const d = dadosDuplicados(lancamentoAprovado());
    expect(d.tipo).toBe("a_pagar");
    expect(d.fornecedorId).toBe(FORNECEDOR);
    expect(d.categoriaId).toBe(CATEGORIA);
    expect(d.descricao).toBe("Conserto do motor da patrol");
    expect(d.valor).toBe(6000);
    expect(d.dataCompra).toBe("2026-08-17");
    expect(d.mesCompetencia).toBe("2026-08-01");
    expect(d.observacoes).toBe("Combinado com o Jaime");
    expect(d.condicaoPagamentoId).toBe(CONDICAO);
    expect(d.formaPagamentoId).toBe(FORMA_BOLETO);
    expect(d.rateios).toEqual([{ centroCustoId: CENTRO, valor: 6000 }]);
  });

  describe("o duplicado começa do zero", () => {
    it("as parcelas nascem sem data de vencimento", () => {
      const d = dadosDuplicados(lancamentoAprovado());
      expect(d.parcelas).toHaveLength(2);
      expect(d.parcelas.every((p) => p.dataVencimento === undefined)).toBe(
        true,
      );
      expect(d.dataVencimento).toBeUndefined();
    });

    it("as parcelas levam o valor NOMINAL, não o líquido do original", () => {
      // A parcela 1 foi paga com R$ 100,00 de desconto. A dívida nova é de
      // R$ 3.000,00, não de R$ 2.900,00: desconto é fato do pagamento antigo.
      const d = dadosDuplicados(lancamentoAprovado());
      expect(d.parcelas.map((p) => p.valor)).toEqual([3000, 3000]);
      expect(d.valor).toBe(6000);
    });

    it("nada de conta bancária, pagamento ou status vem junto", () => {
      const d = dadosDuplicados(lancamentoAprovado());
      const chaves = d.parcelas.flatMap((p) => Object.keys(p));
      expect(chaves).not.toContain("contaBancariaId");
      expect(chaves).not.toContain("dataPagamento");
      expect(chaves).not.toContain("status");
      expect(chaves).not.toContain("desconto");
      // No a pagar, a conta do cabeçalho não existe: é a conta de cada parcela
      // que marca "revisado", e é justamente ela que não desce.
      expect(d.contaBancariaId).toBeUndefined();
    });

    it("a parcela continua sabendo de qual FORMA é", () => {
      // Sem isto, o duplicado de um lançamento dividido entre formas cairia na
      // validação "as parcelas desta forma não fecham com o valor dela".
      const d = dadosDuplicados(lancamentoAprovado());
      expect(d.parcelas.every((p) => p.formaPagamentoId === FORMA_BOLETO)).toBe(
        true,
      );
    });
  });

  describe("motivoParaNaoDuplicar", () => {
    it("deixa passar o lançamento comum", () => {
      expect(motivoParaNaoDuplicar(lancamentoAprovado())).toBeNull();
    });

    it("recusa quando há parcela cancelada", () => {
      // Deixar a cancelada de fora encolheria a soma das parcelas e obrigaria a
      // encolher rateio e formas junto: redistribuir isso é adivinhar em cima de
      // dinheiro. Recusar com mensagem é a resposta honesta.
      const original = lancamentoAprovado();
      original.parcelas[1]!.status = "cancelado";
      expect(motivoParaNaoDuplicar(original)).toMatch(/parcela cancelada/i);
    });

    it("CONTROLE: parcela paga ou aprovada não impede nada", () => {
      // O fixture tem uma paga e uma aprovada. Se este caso passasse a recusar,
      // o botão sumiria justamente nos lançamentos que mais se repetem.
      const original = lancamentoAprovado();
      expect(original.parcelas.map((p) => p.status)).toEqual([
        "pago",
        "aprovado",
      ]);
      expect(motivoParaNaoDuplicar(original)).toBeNull();
    });
  });

  it("leva o cartão de crédito de cada forma", () => {
    const original = lancamentoAprovado({
      formas: [
        {
          id: "bloco-cartao",
          formaPagamentoId: FORMA_CARTAO,
          formaPagamentoNome: "Cartão de Crédito",
          formaPagamentoTipo: "cartao_credito",
          cartaoId: CARTAO,
          cartaoRotulo: "Cartão obra (7712)",
          valor: 6000,
        },
      ],
    });
    const d = dadosDuplicados(original);
    expect(d.formas).toEqual([
      { formaPagamentoId: FORMA_CARTAO, cartaoId: CARTAO, valor: 6000 },
    ]);
  });

  it("leva as retenções, e zero vira ausente", () => {
    const original = lancamentoAprovado({
      valorBruto: 6500,
      retencaoIss: 300,
      retencaoInss: 200,
    });
    const d = dadosDuplicados(original);
    expect(d.valorBruto).toBe(6500);
    expect(d.retencaoIss).toBe(300);
    expect(d.retencaoInss).toBe(200);
    expect(d.retencaoPis).toBeUndefined();
  });

  describe("a receber", () => {
    it("leva a conta de destino e o número do documento, que a RPC exige", () => {
      const d = dadosDuplicados(
        lancamentoAprovado({
          tipo: "a_receber",
          fornecedorId: null,
          clienteId: CLIENTE,
          contaBancariaId: CONTA,
          numeroDocumento: "MED-2026-04",
        }),
      );
      // Recebimento não tem forma de pagamento, e a parcela dele também não
      // aponta para nenhuma: o schema recusa os dois.
      expect(d.formas).toEqual([]);
      expect(d.formaPagamentoId).toBeUndefined();
      expect(d.parcelas.every((p) => p.formaPagamentoId === undefined)).toBe(
        true,
      );
      expect(d.tipo).toBe("a_receber");
      expect(d.clienteId).toBe(CLIENTE);
      expect(d.contaBancariaId).toBe(CONTA);
      expect(d.numeroDocumento).toBe("MED-2026-04");
      const r = lancamentoSchema.safeParse(d);
      if (!r.success) {
        throw new Error(
          r.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(" | "),
        );
      }
      expect(r.success).toBe(true);
    });
  });

  it("texto em branco vira ausente, não string vazia", () => {
    const d = dadosDuplicados(
      lancamentoAprovado({ observacoes: "   ", numeroDocumento: "" }),
    );
    expect(d.observacoes).toBeUndefined();
    expect(d.numeroDocumento).toBeUndefined();
  });

  /**
   * A trava contra esquecimento: campo novo no `lancamentoSchema` quebra este
   * teste até alguém decidir se ele é duplicado ou não.
   *
   * Sem isto, acrescentar uma coluna ao lançamento sairia com o duplicado
   * perdendo o campo em silêncio — e num documento de dinheiro isso é uma
   * despesa com valor errado, não um detalhe de tela.
   */
  it("recebível com bloco de forma gravado por engano não derruba a cópia", () => {
    // Defesa contra dado sujo: `formasDuplicadas` zera no a receber em vez de
    // deixar o schema recusar com uma mensagem que não diz nada a quem clicou.
    const d = dadosDuplicados(
      lancamentoAprovado({
        tipo: "a_receber",
        clienteId: CLIENTE,
        contaBancariaId: CONTA,
      }),
    );
    expect(d.formas).toEqual([]);
    expect(lancamentoSchema.safeParse(d).success).toBe(true);
  });

  it("CONTROLE: todo campo do schema do lançamento foi decidido", () => {
    const doSchema = Object.keys(lancamentoSchema._def.shape ?? {}).sort();
    const doDuplicado = Object.keys(
      dadosDuplicados(lancamentoAprovado()),
    ).sort();
    expect(doSchema.length).toBeGreaterThan(0);
    expect(doDuplicado).toEqual(doSchema);
  });
});

describe("avisosDaDuplicacao", () => {
  it("não avisa nada no caso comum sem documento", () => {
    expect(
      avisosDaDuplicacao(lancamentoAprovado({ numeroDocumento: null })),
    ).toEqual([]);
  });

  it("avisa que o número do documento foi junto", () => {
    const avisos = avisosDaDuplicacao(lancamentoAprovado());
    expect(avisos.map((a) => a.chave)).toContain("numeroDocumento");
    expect(avisos.find((a) => a.chave === "numeroDocumento")?.texto).toContain(
      "NF 12345",
    );
  });

  it("avisa quando o original não era manual", () => {
    const avisos = avisosDaDuplicacao(
      lancamentoAprovado({
        origem: "oc",
        origemId: "oc-1",
        numeroDocumento: null,
      }),
    );
    expect(avisos.map((a) => a.chave)).toEqual(["origem"]);
  });

  it("avisa quando o colaborador fica para trás", () => {
    const avisos = avisosDaDuplicacao(
      lancamentoAprovado({
        origem: "diaria",
        colaboradorId: "col-1",
        numeroDocumento: null,
      }),
    );
    expect(avisos.map((a) => a.chave)).toEqual(["origem", "colaborador"]);
  });
});
