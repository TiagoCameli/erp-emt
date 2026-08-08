import { describe, expect, it } from "vitest";

import {
  faixaInssSchema,
  faixaIrrfSchema,
  parametrosSchema,
} from "@/modules/rh/parametros-folha/schemas";

describe("faixaInssSchema — limiteAte", () => {
  const base = { limiteAte: "1500", aliquota: "7,5" };

  it("rejeita limite vazio (obrigatório)", () => {
    const r = faixaInssSchema.safeParse({ ...base, limiteAte: "" });
    expect(r.success).toBe(false);
  });

  it("rejeita limite igual a zero (precisa ser maior que zero)", () => {
    const r = faixaInssSchema.safeParse({ ...base, limiteAte: "0" });
    expect(r.success).toBe(false);
  });

  it("rejeita limite negativo", () => {
    const r = faixaInssSchema.safeParse({ ...base, limiteAte: "-100" });
    expect(r.success).toBe(false);
  });

  it("rejeita mais de 2 casas decimais", () => {
    const r = faixaInssSchema.safeParse({ ...base, limiteAte: "1500,999" });
    expect(r.success).toBe(false);
  });

  it("aceita limite positivo com 2 casas decimais", () => {
    const r = faixaInssSchema.safeParse({ ...base, limiteAte: "1518,45" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limiteAte).toBe(1518.45);
  });

  it("converte milhar com ponto e decimal com vírgula (pt-BR)", () => {
    const r = faixaInssSchema.safeParse({ ...base, limiteAte: "12.500,32" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limiteAte).toBe(12500.32);
  });
});

describe("faixaInssSchema — aliquota", () => {
  const base = { limiteAte: "1500", aliquota: "7,5" };

  it("rejeita aliquota vazia (obrigatória)", () => {
    const r = faixaInssSchema.safeParse({ ...base, aliquota: "" });
    expect(r.success).toBe(false);
  });

  it("rejeita aliquota negativa", () => {
    const r = faixaInssSchema.safeParse({ ...base, aliquota: "-1" });
    expect(r.success).toBe(false);
  });

  it("rejeita aliquota acima de 100", () => {
    const r = faixaInssSchema.safeParse({ ...base, aliquota: "101" });
    expect(r.success).toBe(false);
  });

  it("rejeita mais de 3 casas decimais", () => {
    const r = faixaInssSchema.safeParse({ ...base, aliquota: "7,5833" });
    expect(r.success).toBe(false);
  });

  it("aceita aliquota com 3 casas decimais", () => {
    const r = faixaInssSchema.safeParse({ ...base, aliquota: "7,583" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.aliquota).toBe(7.583);
  });

  it("aceita 100 exatamente (limite superior)", () => {
    const r = faixaInssSchema.safeParse({ ...base, aliquota: "100" });
    expect(r.success).toBe(true);
  });

  it("aceita 0 exatamente (limite inferior da aliquota)", () => {
    const r = faixaInssSchema.safeParse({ ...base, aliquota: "0" });
    expect(r.success).toBe(true);
  });
});

describe("faixaInssSchema — reparse (idempotência)", () => {
  it("reparse do resultado já convertido continua válido", () => {
    const primeiro = faixaInssSchema.safeParse({
      limiteAte: "1.500,00",
      aliquota: "7,5",
    });
    expect(primeiro.success).toBe(true);
    if (!primeiro.success) return;

    const segundo = faixaInssSchema.safeParse(primeiro.data);
    expect(segundo.success).toBe(true);
    if (segundo.success) {
      expect(segundo.data.limiteAte).toBe(1500);
      expect(segundo.data.aliquota).toBe(7.5);
    }
  });
});

describe("faixaIrrfSchema — parcelaDeduzir", () => {
  const base = { limiteAte: "2500", aliquota: "15", parcelaDeduzir: "300" };

  it("rejeita parcela vazia (obrigatória)", () => {
    const r = faixaIrrfSchema.safeParse({ ...base, parcelaDeduzir: "" });
    expect(r.success).toBe(false);
  });

  it("rejeita parcela negativa", () => {
    const r = faixaIrrfSchema.safeParse({ ...base, parcelaDeduzir: "-1" });
    expect(r.success).toBe(false);
  });

  it("aceita parcela igual a zero (faixa isenta)", () => {
    const r = faixaIrrfSchema.safeParse({ ...base, parcelaDeduzir: "0" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.parcelaDeduzir).toBe(0);
  });

  it("rejeita mais de 2 casas decimais", () => {
    const r = faixaIrrfSchema.safeParse({ ...base, parcelaDeduzir: "300,999" });
    expect(r.success).toBe(false);
  });

  it("aceita parcela positiva com 2 casas decimais", () => {
    const r = faixaIrrfSchema.safeParse({ ...base, parcelaDeduzir: "300,52" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.parcelaDeduzir).toBe(300.52);
  });
});

describe("faixaIrrfSchema — herda as mesmas regras de limiteAte/aliquota da faixa de INSS", () => {
  it("rejeita limite igual a zero", () => {
    const r = faixaIrrfSchema.safeParse({
      limiteAte: "0",
      aliquota: "15",
      parcelaDeduzir: "0",
    });
    expect(r.success).toBe(false);
  });

  it("rejeita aliquota acima de 100", () => {
    const r = faixaIrrfSchema.safeParse({
      limiteAte: "2500",
      aliquota: "150",
      parcelaDeduzir: "0",
    });
    expect(r.success).toBe(false);
  });
});

describe("parametrosSchema", () => {
  const base = {
    irrfDeducaoPorDependente: "189,59",
    irrfDescontoSimplificado: "607,20",
    fgtsPercentual: "8",
  };

  it("aceita valores válidos", () => {
    const r = parametrosSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.irrfDeducaoPorDependente).toBe(189.59);
      expect(r.data.irrfDescontoSimplificado).toBe(607.2);
      expect(r.data.fgtsPercentual).toBe(8);
    }
  });

  it("rejeita dedução por dependente vazia (obrigatória)", () => {
    const r = parametrosSchema.safeParse({
      ...base,
      irrfDeducaoPorDependente: "",
    });
    expect(r.success).toBe(false);
  });

  it("rejeita dedução por dependente negativa", () => {
    const r = parametrosSchema.safeParse({
      ...base,
      irrfDeducaoPorDependente: "-1",
    });
    expect(r.success).toBe(false);
  });

  it("aceita dedução por dependente igual a zero", () => {
    const r = parametrosSchema.safeParse({
      ...base,
      irrfDeducaoPorDependente: "0",
    });
    expect(r.success).toBe(true);
  });

  it("rejeita desconto simplificado negativo", () => {
    const r = parametrosSchema.safeParse({
      ...base,
      irrfDescontoSimplificado: "-1",
    });
    expect(r.success).toBe(false);
  });

  it("aceita desconto simplificado igual a zero", () => {
    const r = parametrosSchema.safeParse({
      ...base,
      irrfDescontoSimplificado: "0",
    });
    expect(r.success).toBe(true);
  });

  it("rejeita FGTS negativo", () => {
    const r = parametrosSchema.safeParse({ ...base, fgtsPercentual: "-1" });
    expect(r.success).toBe(false);
  });

  it("rejeita FGTS acima de 100", () => {
    const r = parametrosSchema.safeParse({ ...base, fgtsPercentual: "101" });
    expect(r.success).toBe(false);
  });

  it("rejeita FGTS vazio (obrigatório)", () => {
    const r = parametrosSchema.safeParse({ ...base, fgtsPercentual: "" });
    expect(r.success).toBe(false);
  });

  it("rejeita FGTS com mais de 3 casas decimais", () => {
    const r = parametrosSchema.safeParse({ ...base, fgtsPercentual: "8,1234" });
    expect(r.success).toBe(false);
  });
});

describe("parametrosSchema — pagamento e recolhimento", () => {
  it("aceita dia de pagamento e dia das guias entre 1 e 31", () => {
    const r = parametrosSchema.safeParse({
      irrfDeducaoPorDependente: 0,
      irrfDescontoSimplificado: 0,
      fgtsPercentual: 8,
      diaPagamentoSalario: 5,
      diaVencimentoGuias: 20,
      grupoRecolhimentoInss: "INSS",
      grupoRecolhimentoIrrf: "IRRF",
    });
    expect(r.success).toBe(true);
  });

  it("recusa dia 0 e dia 32", () => {
    for (const dia of [0, 32]) {
      const r = parametrosSchema.safeParse({
        irrfDeducaoPorDependente: 0,
        irrfDescontoSimplificado: 0,
        fgtsPercentual: 8,
        diaPagamentoSalario: dia,
        diaVencimentoGuias: 20,
      });
      expect(r.success).toBe(false);
    }
  });

  it("aceita config vazia: sem dia e sem grupo (deploy seguro)", () => {
    const r = parametrosSchema.safeParse({
      irrfDeducaoPorDependente: 0,
      irrfDescontoSimplificado: 0,
      fgtsPercentual: 0,
    });
    expect(r.success).toBe(true);
  });
});

describe("parametrosSchema — reparse (idempotência)", () => {
  it("reparse do resultado já convertido continua válido", () => {
    const primeiro = parametrosSchema.safeParse({
      irrfDeducaoPorDependente: "189,59",
      irrfDescontoSimplificado: "607,20",
      fgtsPercentual: "8",
    });
    expect(primeiro.success).toBe(true);
    if (!primeiro.success) return;

    const segundo = parametrosSchema.safeParse(primeiro.data);
    expect(segundo.success).toBe(true);
    if (segundo.success) {
      expect(segundo.data.irrfDeducaoPorDependente).toBe(189.59);
    }
  });
});
