import { describe, expect, it } from "vitest";

import {
  cadastroFaltando,
  contarPorUrgencia,
  corKpi,
  urgenciaDocumento,
  urgenciaFerias,
  type Urgencia,
} from "@/modules/rh/alertas/calculo";

describe("urgenciaDocumento", () => {
  it("vencido é crítico", () => {
    expect(urgenciaDocumento("vencido")).toBe("critico");
  });

  it("a_vencer é aviso", () => {
    expect(urgenciaDocumento("a_vencer")).toBe("aviso");
  });

  it("ok não gera urgência", () => {
    expect(urgenciaDocumento("ok")).toBeNull();
  });

  it("sem_vencimento não gera urgência", () => {
    expect(urgenciaDocumento("sem_vencimento")).toBeNull();
  });
});

describe("urgenciaFerias", () => {
  it("vencida é crítico", () => {
    expect(urgenciaFerias("vencida")).toBe("critico");
  });

  it("a_vencer é aviso", () => {
    expect(urgenciaFerias("a_vencer")).toBe("aviso");
  });

  it("ok não gera urgência", () => {
    expect(urgenciaFerias("ok")).toBeNull();
  });

  it("gozada não gera urgência", () => {
    expect(urgenciaFerias("gozada")).toBeNull();
  });
});

describe("cadastroFaltando", () => {
  it("ativo CLT sem salário e sem dados bancários acusa os dois", () => {
    expect(
      cadastroFaltando({
        ativo: true,
        vinculo: "clt",
        salario: null,
        banco: null,
        chavePix: null,
        pagoPorDiaria: false,
      }),
    ).toEqual({ semSalario: true, semBanco: true });
  });

  it("ativo CLT com salário zero também acusa semSalario", () => {
    expect(
      cadastroFaltando({
        ativo: true,
        vinculo: "clt",
        salario: 0,
        banco: "Banco X",
        chavePix: null,
        pagoPorDiaria: false,
      }),
    ).toEqual({ semSalario: true, semBanco: false });
  });

  it("diarista sem salário não acusa (pago por diária, não por salário)", () => {
    expect(
      cadastroFaltando({
        ativo: true,
        vinculo: "diarista",
        salario: null,
        banco: "x",
        chavePix: null,
        pagoPorDiaria: true,
      }),
    ).toEqual({ semSalario: false, semBanco: false });
  });

  it("inativo nunca acusa, mesmo sem salário nem dados bancários", () => {
    expect(
      cadastroFaltando({
        ativo: false,
        vinculo: "clt",
        salario: null,
        banco: null,
        chavePix: null,
        pagoPorDiaria: false,
      }),
    ).toEqual({ semSalario: false, semBanco: false });
  });

  it("sem banco e sem pix acusa semBanco", () => {
    expect(
      cadastroFaltando({
        ativo: true,
        vinculo: "clt",
        salario: 3000,
        banco: null,
        chavePix: null,
        pagoPorDiaria: false,
      }),
    ).toEqual({ semSalario: false, semBanco: true });
  });

  it("com chave pix (mesmo sem banco) não acusa semBanco", () => {
    expect(
      cadastroFaltando({
        ativo: true,
        vinculo: "clt",
        salario: 3000,
        banco: null,
        chavePix: "11122233344",
        pagoPorDiaria: false,
      }),
    ).toEqual({ semSalario: false, semBanco: false });
  });

  it("com banco (mesmo sem pix) não acusa semBanco", () => {
    expect(
      cadastroFaltando({
        ativo: true,
        vinculo: "clt",
        salario: 3000,
        banco: "Banco X",
        chavePix: null,
        pagoPorDiaria: false,
      }),
    ).toEqual({ semSalario: false, semBanco: false });
  });

  it("cadastro completo não acusa nada", () => {
    expect(
      cadastroFaltando({
        ativo: true,
        vinculo: "clt",
        salario: 3000,
        banco: "Banco X",
        chavePix: "x",
        pagoPorDiaria: false,
      }),
    ).toEqual({ semSalario: false, semBanco: false });
  });
});

describe("contarPorUrgencia", () => {
  it("conta críticos, avisos e total, ignorando nulos", () => {
    const urgencias: (Urgencia | null)[] = [
      "critico",
      "critico",
      "aviso",
      null,
      "aviso",
      "critico",
    ];
    expect(contarPorUrgencia(urgencias)).toEqual({
      critico: 3,
      aviso: 2,
      total: 5,
    });
  });

  it("lista vazia devolve zeros", () => {
    expect(contarPorUrgencia([])).toEqual({ critico: 0, aviso: 0, total: 0 });
  });

  it("só nulos devolve zeros", () => {
    expect(contarPorUrgencia([null, null])).toEqual({
      critico: 0,
      aviso: 0,
      total: 0,
    });
  });
});

describe("corKpi", () => {
  it("com crítico devolve critico, mesmo havendo aviso também", () => {
    expect(corKpi({ critico: 1, aviso: 5 })).toBe("critico");
  });

  it("sem crítico mas com aviso devolve aviso", () => {
    expect(corKpi({ critico: 0, aviso: 2 })).toBe("aviso");
  });

  it("sem crítico e sem aviso devolve neutro", () => {
    expect(corKpi({ critico: 0, aviso: 0 })).toBe("neutro");
  });
});
