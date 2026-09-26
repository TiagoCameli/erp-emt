import { describe, expect, it } from "vitest";

import { aditivoSchema, contratoDoForm, contratoFormSchema, contratoSchema, payloadDoContrato } from "./schemas";

const valido = {
  codigo: "l09-br364", nomeObra: "BR-364 Lote 09", local: "Cruzeiro do Sul/AC", objeto: "Manutenção rodoviária",
  numeroContrato: "00615/2025", contratanteNome: "DNIT", contratanteTipo: "federal", contratanteDocumento: "",
  valorInicial: 243927498.02, dataAssinatura: "2025-10-01", dataOrdemServico: "", prazoMeses: 39, inicioPrazo: "assinatura",
  diaInicioPeriodo: 26, tipoLocalizacao: "rodovia", regraArredondamento: null, alertaPrazoDias: 90, alertaValorPct: 90,
  status: "ativo", observacoes: "",
} as const;

describe("contratoSchema", () => {
  it("aceita o Lote 09 e manda o código em maiúsculas, sem regra definida", () => {
    const r = contratoSchema.parse(valido);
    expect(payloadDoContrato(r)).toMatchObject({ codigo: "L09-BR364", valor_inicial: "243927498.02", regra_arredondamento: null,
      data_ordem_servico: null, dia_inicio_periodo: 26 });
  });

  it("valor inicial com 3 casas é recusado", () => {
    expect(contratoSchema.safeParse({ ...valido, valorInicial: 1.005 }).success).toBe(false);
  });

  it("prazo contado da OS exige a data da OS", () => {
    const r = contratoSchema.safeParse({ ...valido, inicioPrazo: "ordem_servico", dataOrdemServico: "" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Informe a data da ordem de serviço");
  });

  it("dia de início do período vai de 1 a 28", () => {
    const r = contratoSchema.safeParse({ ...valido, diaInicioPeriodo: 29 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("O período começa entre o dia 1 e o dia 28");
  });

  it("campo numérico vazio (NaN, do valueAsNumber do navegador) pede em português, não 'Expected number'", () => {
    expect(contratoSchema.safeParse({ ...valido, prazoMeses: NaN }).error?.issues[0]?.message).toBe(
      "Informe o prazo em meses",
    );
    expect(contratoSchema.safeParse({ ...valido, diaInicioPeriodo: NaN }).error?.issues[0]?.message).toBe(
      "Informe o dia de início do período",
    );
    expect(contratoSchema.safeParse({ ...valido, alertaPrazoDias: NaN }).error?.issues[0]?.message).toBe(
      "Informe os dias do alerta de prazo",
    );
    expect(contratoSchema.safeParse({ ...valido, alertaValorPct: NaN }).error?.issues[0]?.message).toBe(
      "Informe o percentual do alerta de valor",
    );
  });

  it("alerta de prazo não aceita dias negativos, e alerta de valor fica entre 0 e 100", () => {
    expect(contratoSchema.safeParse({ ...valido, alertaPrazoDias: -1 }).error?.issues[0]?.message).toBe(
      "Os dias do alerta de prazo não podem ser negativos",
    );
    expect(contratoSchema.safeParse({ ...valido, alertaValorPct: 101 }).error?.issues[0]?.message).toBe(
      "O percentual do alerta de valor vai de 0 a 100",
    );
  });
});

describe("contratoFormSchema / contratoDoForm", () => {
  const validoForm = { ...valido, valorInicial: "243.927.498,02" };

  it("aceita o valor digitado com milhar e converte para o número exato no envio", () => {
    const r = contratoFormSchema.parse(validoForm);
    expect(contratoDoForm(r).valorInicial).toBe(243927498.02);
  });

  it("aceita '12,50' e converte para 12.5, sem perder o centavo", () => {
    const r = contratoFormSchema.parse({ ...validoForm, valorInicial: "12,50" });
    expect(contratoDoForm(r).valorInicial).toBe(12.5);
  });

  it("valor vazio pede o valor, e não vira 0 em silêncio", () => {
    const r = contratoFormSchema.safeParse({ ...validoForm, valorInicial: "" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Informe o valor");
  });
});

describe("aditivoSchema", () => {
  it("aditivo de prazo exige os meses acrescidos, e só ele", () => {
    const base = { dataAssinatura: "2026-05-01", dataVigencia: "2026-05-01", motivo: "Chuvas", prazoAcrescidoMeses: null };
    expect(aditivoSchema.safeParse({ ...base, tipos: ["prazo"] }).success).toBe(false);
    expect(aditivoSchema.safeParse({ ...base, tipos: ["prazo"], prazoAcrescidoMeses: 6 }).success).toBe(true);
    expect(aditivoSchema.safeParse({ ...base, tipos: ["valor"], prazoAcrescidoMeses: 6 }).success).toBe(false);
  });
});
