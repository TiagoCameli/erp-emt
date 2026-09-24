// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  casarPorNome,
  COLUNAS_PAGAMENTOS,
  dataDaCelula,
  lerLinhaPagamento,
  mesDaCelula,
  numeroDaCelula,
  type LinhaCruaPagamento,
} from "@/modules/frete/pagamentos/importacao";

const TRANSPORTADORAS = [
  { id: "t-etam", nomes: ["ETAM", "ETAM TRANSPORTES LTDA"] },
  { id: "t-emt", nomes: ["EMT Transportes", "EMT TRANSPORTES E SERVICOS LTDA"] },
];

const LINHA: LinhaCruaPagamento = {
  data: "2026-01-15",
  transportadora: "etam",
  mesReferencia: "2026-01",
  valor: 5000,
  metodo: "pix",
  responsavel: "Carlos Silva",
  nf: "NF-001",
  pagoPor: "EMT Construtora",
  observacoes: "",
};

describe("modelo da origem", () => {
  it("tem as colunas do template_pagamentos_frete.xlsx, na ordem", () => {
    expect(COLUNAS_PAGAMENTOS.map((c) => c.rotulo)).toEqual([
      "Data",
      "Transportadora",
      "Mês Referência",
      "Valor",
      "Método",
      "Responsavel",
      "NF",
      "Pago Por",
      "Observações",
    ]);
  });
});

describe("células", () => {
  it("data: Date do Excel, número de série, AAAA-M-D e D/M/AAAA; texto que não é data volta nulo", () => {
    expect(dataDaCelula(new Date(Date.UTC(2026, 0, 15)))).toBe("2026-01-15");
    expect(dataDaCelula(46037)).toBe("2026-01-15");
    expect(dataDaCelula("2026-1-5")).toBe("2026-01-05");
    expect(dataDaCelula("5/1/2026")).toBe("2026-01-05");
    expect(dataDaCelula("31/02/2026")).toBeNull();
    expect(dataDaCelula("ontem")).toBeNull();
  });

  it("mês: AAAA-MM, MM/AAAA ou data", () => {
    expect(mesDaCelula("2026-1")).toBe("2026-01");
    expect(mesDaCelula("03/2026")).toBe("2026-03");
    expect(mesDaCelula(new Date(Date.UTC(2026, 2, 1)))).toBe("2026-03");
    expect(mesDaCelula("2026-13")).toBeNull();
    expect(mesDaCelula("março")).toBeNull();
  });

  it("número: célula numérica ou texto pt-BR (a origem lia '1.234,56' como 1,234)", () => {
    expect(numeroDaCelula(5000, 4)).toEqual({ numero: 5000 });
    expect(numeroDaCelula("1.234,56", 4)).toEqual({ numero: 1234.56 });
    expect(numeroDaCelula("R$ 6,3947", 4)).toEqual({ numero: 6.3947 });
    expect(numeroDaCelula("", 4)).toEqual({ erro: "vazio" });
    expect(numeroDaCelula(1.23456, 4)).toEqual({ erro: "invalido" });
    expect(numeroDaCelula("abc", 4)).toEqual({ erro: "invalido" });
  });

  it("casa nome sem acento e sem caixa, na fantasia ou na razão social; dois cadastros é ambíguo", () => {
    expect(casarPorNome("  Etam  Transportes ltda", TRANSPORTADORAS)).toEqual({ id: "t-etam" });
    expect(casarPorNome("EMT TRANSPORTES E SERVIÇOS LTDA", TRANSPORTADORAS)).toEqual({ id: "t-emt" });
    expect(casarPorNome("Areacre", TRANSPORTADORAS)).toEqual({ erro: "nao_encontrado" });
    expect(casarPorNome("X", [{ id: "a", nomes: ["X"] }, { id: "b", nomes: ["x"] }])).toEqual({ erro: "ambiguo" });
  });
});

describe("linha da planilha", () => {
  it("linha boa vira o pagamento, sem litros e pix por padrão", () => {
    const lida = lerLinhaPagamento({ ...LINHA, metodo: null }, TRANSPORTADORAS);
    expect(lida.erros).toEqual([]);
    expect(lida.dados).toEqual({
      data: "2026-01-15",
      transportadoraId: "t-etam",
      mesReferencia: "2026-01",
      valor: 5000,
      metodo: "pix",
      quantidadeCombustivel: 0,
      responsavel: "Carlos Silva",
      notaFiscal: "NF-001",
      pagoPor: "EMT Construtora",
      observacoes: null,
    });
  });

  it("linha vazia de campos obrigatórios traz os erros da origem", () => {
    const lida = lerLinhaPagamento({ observacoes: "só isso" }, TRANSPORTADORAS);
    expect(lida.dados).toBeNull();
    expect(lida.erros).toEqual([
      "Falta data",
      "Falta transportadora",
      "Falta mês referência",
      "Falta valor",
      "Falta responsável",
      "Falta pago por",
    ]);
  });

  it("transportadora que não é do cadastro, método inválido e mês inválido", () => {
    const lida = lerLinhaPagamento(
      { ...LINHA, transportadora: "Areacre", metodo: "PIX2", mesReferencia: "jan" },
      TRANSPORTADORAS,
    );
    expect(lida.erros).toEqual([
      'Transportadora "Areacre" não encontrada',
      'Mês referência "jan" inválido (use AAAA-MM)',
      'Método "pix2" inválido',
    ]);
  });

  it("método aceita acento ('Transferência'); combustível é recusado (o modelo não tem litros)", () => {
    expect(lerLinhaPagamento({ ...LINHA, metodo: "Transferência" }, TRANSPORTADORAS).dados?.metodo).toBe("transferencia");
    const combustivel = lerLinhaPagamento({ ...LINHA, metodo: "combustivel" }, TRANSPORTADORAS);
    expect(combustivel.dados).toBeNull();
    expect(combustivel.erros[0]).toMatch(/^Quantidade obrigatória para pagamento em combustível/);
  });

  it("valor zero ou com mais de 4 casas é recusado", () => {
    expect(lerLinhaPagamento({ ...LINHA, valor: 0 }, TRANSPORTADORAS).erros).toEqual(["Valor deve ser > 0"]);
    expect(lerLinhaPagamento({ ...LINHA, valor: "10,12345" }, TRANSPORTADORAS).erros[0]).toMatch(/^Valor inválido/);
  });
});
