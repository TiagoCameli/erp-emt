import { describe, expect, it } from "vitest";

import { aditivoSchema, contratoSchema, payloadDoContrato } from "./schemas";

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
    expect(contratoSchema.safeParse({ ...valido, diaInicioPeriodo: 29 }).success).toBe(false);
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
