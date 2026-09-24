// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  pagamentoDoForm,
  pagamentoFormSchema,
  pagamentoSchema,
  type PagamentoFormInput,
} from "@/modules/frete/pagamentos/schemas";

const FORM: PagamentoFormInput = {
  data: "2026-09-10",
  transportadoraId: "11111111-1111-4111-8111-111111111111",
  mesReferencia: "",
  valor: "1.500,25",
  metodo: "pix",
  quantidadeCombustivel: "",
  responsavel: "Tiago",
  notaFiscal: "",
  pagoPor: "EMT Construtora",
  observacoes: "",
  dividir: false,
};

function mensagens(form: Partial<PagamentoFormInput>): string[] {
  const r = pagamentoFormSchema.safeParse({ ...FORM, ...form });
  return r.success ? [] : r.error.issues.map((i) => i.message);
}

describe("formulário do pagamento (mensagens da origem)", () => {
  it("o formulário completo passa; mês referência é opcional", () => {
    expect(mensagens({})).toEqual([]);
  });

  it("data, transportadora, responsável e pago por obrigatórios", () => {
    expect(mensagens({ data: "" })).toContain("Data do pagamento obrigatória");
    expect(mensagens({ transportadoraId: "" })).toContain("Selecione a transportadora");
    expect(mensagens({ responsavel: " " })).toContain("Responsável obrigatório");
    expect(mensagens({ pagoPor: "" })).toContain("Selecione quem pagou");
  });

  it("valor obrigatório e > 0 fora do dividir; no dividir o valor vem das parcelas", () => {
    expect(mensagens({ valor: "" })[0]).toMatch(/^Valor deve ser > 0/);
    expect(mensagens({ valor: "0" })[0]).toMatch(/^Valor deve ser > 0/);
    expect(mensagens({ valor: "1,23456" })[0]).toMatch(/^Valor deve ser > 0/);
    expect(mensagens({ valor: "", dividir: true })).toEqual([]);
  });

  it("combustível exige litros > 0", () => {
    expect(mensagens({ metodo: "combustivel" })).toContain("Quantidade obrigatória para pagamento em combustível");
    expect(mensagens({ metodo: "combustivel", quantidadeCombustivel: "120,5" })).toEqual([]);
  });

  it("observações até 500", () => {
    expect(mensagens({ observacoes: "x".repeat(501) })).toContain("Máximo 500 caracteres");
  });

  it("do formulário para a action: número pt-BR, litros zerados fora do combustível, vazio vira nulo", () => {
    expect(pagamentoDoForm({ ...FORM, quantidadeCombustivel: "30", notaFiscal: " NF 9 " })).toEqual({
      data: "2026-09-10",
      transportadoraId: FORM.transportadoraId,
      mesReferencia: "",
      valor: 1500.25,
      metodo: "pix",
      quantidadeCombustivel: 0,
      responsavel: "Tiago",
      notaFiscal: "NF 9",
      pagoPor: "EMT Construtora",
      observacoes: null,
    });
    expect(pagamentoDoForm({ ...FORM, metodo: "combustivel", quantidadeCombustivel: "30,1234" }).quantidadeCombustivel).toBe(
      30.1234,
    );
  });
});

describe("schema da action", () => {
  const dados = pagamentoDoForm(FORM);

  it("aceita o que o formulário produz e recusa chave a mais", () => {
    expect(pagamentoSchema.safeParse(dados).success).toBe(true);
    expect(pagamentoSchema.safeParse({ ...dados, extra: 1 }).success).toBe(false);
  });

  it("valor com mais de 4 casas, zero ou negativo é recusado", () => {
    expect(pagamentoSchema.safeParse({ ...dados, valor: 1.23456 }).success).toBe(false);
    expect(pagamentoSchema.safeParse({ ...dados, valor: 0 }).success).toBe(false);
    expect(pagamentoSchema.safeParse({ ...dados, valor: 6.3947 }).success).toBe(true);
  });

  it("combustível sem litros é recusado com a mensagem da origem", () => {
    const r = pagamentoSchema.safeParse({ ...dados, metodo: "combustivel", quantidadeCombustivel: 0 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Quantidade obrigatória para pagamento em combustível");
  });

  it("transportadora precisa ser id", () => {
    expect(pagamentoSchema.safeParse({ ...dados, transportadoraId: "Transportes ABC" }).success).toBe(false);
  });
});
