import { describe, expect, it } from "vitest";

import {
  aplicacaoDaPlanilha,
  COLUNAS_MODELO,
  formParaTipoOleo,
  INTERVALO_MESES_MAXIMO,
  intervaloMesesParaNumero,
  tipoOleoFormSchema,
  tipoOleoSchema,
} from "@/modules/manutencao/tipos-oleo/schemas";

const FORM_VALIDO = { nome: "Lubrax 15W40", aplicacao: "motor" as const, intervaloMeses: "6", ativo: true };

describe("intervalo em meses do tipo de óleo", () => {
  it("vazio é sem intervalo (null), não zero", () => {
    expect(intervaloMesesParaNumero("")).toBeNull();
    expect(intervaloMesesParaNumero("   ")).toBeNull();
  });

  it("lê inteiro positivo até o teto", () => {
    expect(intervaloMesesParaNumero("6")).toBe(6);
    expect(intervaloMesesParaNumero(" 12 ")).toBe(12);
    expect(intervaloMesesParaNumero(String(INTERVALO_MESES_MAXIMO))).toBe(INTERVALO_MESES_MAXIMO);
  });

  it("recusa zero, negativo, decimal, milhar e texto", () => {
    for (const texto of ["0", "-3", "1,5", "1.5", "1,500", "1.000", "seis", String(INTERVALO_MESES_MAXIMO + 1)]) {
      expect(intervaloMesesParaNumero(texto), texto).toBeUndefined();
    }
  });
});

describe("formulário de tipo de óleo", () => {
  it("aceita o válido e converte para o que a action grava", () => {
    const r = tipoOleoFormSchema.safeParse(FORM_VALIDO);
    expect(r.success).toBe(true);
    const dados = formParaTipoOleo({ ...FORM_VALIDO, nome: "  Lubrax 15W40  " });
    expect(dados).toEqual({ nome: "Lubrax 15W40", aplicacao: "motor", intervaloMeses: 6, ativo: true });
    expect(tipoOleoSchema.safeParse(dados).success).toBe(true);
  });

  it("intervalo vazio chega na action como null", () => {
    const dados = formParaTipoOleo({ ...FORM_VALIDO, intervaloMeses: "" });
    expect(dados.intervaloMeses).toBeNull();
    expect(tipoOleoSchema.safeParse(dados).success).toBe(true);
  });

  it("nome é obrigatório e aplicação tem que ser do domínio do banco", () => {
    expect(tipoOleoFormSchema.safeParse({ ...FORM_VALIDO, nome: " " }).success).toBe(false);
    expect(tipoOleoFormSchema.safeParse({ ...FORM_VALIDO, aplicacao: "freio" }).success).toBe(false);
    expect(tipoOleoFormSchema.safeParse({ ...FORM_VALIDO, intervaloMeses: "1,5" }).success).toBe(false);
  });

  it("o servidor recusa intervalo zero ou quebrado mesmo sem passar pelo form", () => {
    const base = { nome: "Graxa azul", aplicacao: "graxa" as const, ativo: true };
    expect(tipoOleoSchema.safeParse({ ...base, intervaloMeses: 0 }).success).toBe(false);
    expect(tipoOleoSchema.safeParse({ ...base, intervaloMeses: 2.5 }).success).toBe(false);
    expect(tipoOleoSchema.safeParse({ ...base, intervaloMeses: null }).success).toBe(true);
  });
});

describe("aplicação lida da planilha", () => {
  it("casa pelo rótulo ou pela chave, sem acento e sem caixa", () => {
    expect(aplicacaoDaPlanilha("Hidráulico")).toBe("hidraulico");
    expect(aplicacaoDaPlanilha("hidraulico")).toBe("hidraulico");
    expect(aplicacaoDaPlanilha(" TRANSMISSÃO ")).toBe("transmissao");
    expect(aplicacaoDaPlanilha("Motor")).toBe("motor");
  });

  it("vazio é o padrão da coluna (outro); desconhecido é recusado", () => {
    expect(aplicacaoDaPlanilha("")).toBe("outro");
    expect(aplicacaoDaPlanilha("freio")).toBeNull();
  });

  it("o modelo de planilha traz as três colunas na ordem da leitura", () => {
    expect(COLUNAS_MODELO.map((c) => c.rotulo)).toEqual(["Nome", "Aplicação", "Intervalo em meses"]);
    expect(aplicacaoDaPlanilha(COLUNAS_MODELO[1].exemplo)).not.toBeNull();
    expect(intervaloMesesParaNumero(COLUNAS_MODELO[2].exemplo)).toBe(6);
  });
});
