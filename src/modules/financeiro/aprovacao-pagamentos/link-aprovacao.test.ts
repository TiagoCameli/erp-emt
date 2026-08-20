import { describe, expect, it } from "vitest";

import { formatarBRL } from "@/lib/formatadores";
import {
  PARAM_LINK_APROVACAO,
  lerParcelasDoLink,
  mensagemAprovacao,
  urlAprovacao,
  urlTelaInteira,
} from "@/modules/financeiro/aprovacao-pagamentos/link-aprovacao";
import type { ParcelaPendente } from "@/modules/financeiro/aprovacao-pagamentos/queries";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

function parcela(troca: Partial<ParcelaPendente> = {}): ParcelaPendente {
  return {
    id: ID_A,
    numeroParcela: 2,
    totalParcelas: 3,
    valor: 12450,
    dataVencimento: "2026-08-20",
    lancamentoId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    lancamentoNumero: "LAN-2026-0142",
    lancamentoDescricao: "Locação de escavadeira",
    observacoes: null,
    fornecedorNome: "Transterra Ltda",
    origem: "manual",
    origemId: null,
    origemNumero: null,
    categoriaNome: "Locação de equipamento",
    formaPagamentoNome: "PIX",
    contaBancariaId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    contaBancariaNome: "Bradesco 1234",
    dataCompra: null,
    mesCompetencia: "2026-08-01",
    dataProgramada: null,
    rateios: [],
    anexos: 0,
    semNota: false,
    ...troca,
  };
}

describe("urlAprovacao", () => {
  it("uma parcela abre a tela inteira dela, não a fila", () => {
    // Quem recebe o link no WhatsApp quer o pagamento na tela, não uma lista de
    // um item para descobrir onde clicar.
    expect(urlAprovacao("https://erp.emt.com", [ID_A])).toBe(
      `https://erp.emt.com/financeiro/aprovacao-pagamentos/${ID_A}`,
    );
  });

  it("várias parcelas caem na fila recortada, porque tela inteira é de uma só", () => {
    expect(urlAprovacao("https://erp.emt.com", [ID_A, ID_B])).toBe(
      `https://erp.emt.com/financeiro/aprovacao-pagamentos?${PARAM_LINK_APROVACAO}=${ID_A},${ID_B}`,
    );
  });

  it("não duplica a barra quando a origem termina com uma", () => {
    expect(urlAprovacao("https://erp.emt.com/", [ID_A])).toBe(
      `https://erp.emt.com/financeiro/aprovacao-pagamentos/${ID_A}`,
    );
  });

  it("sem parcela nenhuma aponta para a fila, sem rota quebrada", () => {
    expect(urlAprovacao("https://erp.emt.com", [])).toBe(
      "https://erp.emt.com/financeiro/aprovacao-pagamentos",
    );
  });
});

describe("urlTelaInteira", () => {
  it("monta a rota da tela de aprovação de uma parcela", () => {
    expect(urlTelaInteira(ID_A)).toBe(
      `/financeiro/aprovacao-pagamentos/${ID_A}`,
    );
  });
});

describe("lerParcelasDoLink", () => {
  it("devolve os ids do parâmetro na ordem em que vieram", () => {
    expect(lerParcelasDoLink(`${ID_A},${ID_B}`)).toEqual([ID_A, ID_B]);
  });

  it("descarta id que não é uuid em vez de filtrar a fila por lixo", () => {
    expect(lerParcelasDoLink(`${ID_A},nao-e-uuid`)).toEqual([ID_A]);
  });

  it("descarta id repetido", () => {
    expect(lerParcelasDoLink(`${ID_A},${ID_A}`)).toEqual([ID_A]);
  });

  it("devolve lista vazia sem parâmetro", () => {
    expect(lerParcelasDoLink(undefined)).toEqual([]);
    expect(lerParcelasDoLink("")).toEqual([]);
  });

  it("aceita o parâmetro repetido na URL, não só separado por vírgula", () => {
    expect(lerParcelasDoLink([ID_A, ID_B])).toEqual([ID_A, ID_B]);
  });
});

describe("mensagemAprovacao de uma parcela", () => {
  const texto = mensagemAprovacao([parcela()], "https://erp.emt.com");

  it("traz fornecedor, valor e vencimento, que é o que decide a aprovação", () => {
    expect(texto).toContain("Transterra Ltda");
    // Pelo formatador, não por literal: o BRL do projeto usa espaço não
    // separável entre "R$" e o número, e "R$ 12.450,00" digitado à mão nunca bate.
    expect(texto).toContain(formatarBRL(12450));
    expect(texto).toContain("20/08/2026");
  });

  it("identifica o lançamento com o rótulo da parcela", () => {
    expect(texto).toContain("LAN-2026-0142 · parcela 2 de 3");
  });

  it("traz a descrição do que está sendo pago", () => {
    expect(texto).toContain("Locação de escavadeira");
  });

  it("termina com o link, para o WhatsApp virar preview do fim da mensagem", () => {
    expect(texto.trimEnd().endsWith(urlAprovacao("https://erp.emt.com", [ID_A]))).toBe(
      true,
    );
  });

  it("avisa quando a compra de origem está sem nota fiscal", () => {
    const semNota = mensagemAprovacao(
      [parcela({ semNota: true })],
      "https://erp.emt.com",
    );
    expect(semNota).toContain("sem nota fiscal");
  });

  it("não inventa vencimento quando a parcela não tem", () => {
    const texto = mensagemAprovacao(
      [parcela({ dataVencimento: null })],
      "https://erp.emt.com",
    );
    expect(texto).not.toContain("Vencimento:");
  });
});

describe("mensagemAprovacao de várias parcelas", () => {
  const texto = mensagemAprovacao(
    [parcela(), parcela({ id: ID_B, valor: 3550, fornecedorNome: "Posto Ipê" })],
    "https://erp.emt.com",
  );

  it("abre com a contagem e o total, não com a primeira parcela", () => {
    expect(texto).toContain("2 pagamentos para aprovar");
    expect(texto).toContain(formatarBRL(16000));
  });

  it("lista os fornecedores de cada pagamento", () => {
    expect(texto).toContain("Transterra Ltda");
    expect(texto).toContain("Posto Ipê");
  });

  it("manda um link só, com as duas parcelas", () => {
    expect(texto).toContain(urlAprovacao("https://erp.emt.com", [ID_A, ID_B]));
  });
});

describe("mensagemAprovacao sem parcela", () => {
  it("devolve string vazia em vez de uma mensagem com link para nada", () => {
    expect(mensagemAprovacao([], "https://erp.emt.com")).toBe("");
  });
});
