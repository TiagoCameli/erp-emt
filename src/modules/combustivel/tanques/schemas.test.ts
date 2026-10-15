import { describe, expect, it } from "vitest";

import {
  capacidadeDaPlanilha,
  casarDono,
  tanqueDoForm,
  tanqueFormSchema,
  tanqueSchema,
  type FornecedorParaCasar,
  type TanqueFormInput,
} from "@/modules/combustivel/tanques/schemas";

const DONO = "44444444-4444-4444-8444-444444444444";

describe("uso do tanque", () => {
  it("tanque de material não pode ser de terceiro", () => {
    expect(tanqueFormSchema.safeParse(form({ uso: "material", ehExterno: true, proprietarioId: DONO })).success).toBe(false);
    expect(tanqueFormSchema.safeParse(form({ uso: "material" })).success).toBe(true);
  });
  it("o uso vai para a action", () => {
    expect(tanqueDoForm(form({ uso: "material" })).uso).toBe("material");
  });
});

describe("unidade da capacidade do tanque de material", () => {
  it("LINHA DE CONTROLE: 30 t de CAP a 1,03 kg/L vão para a action como 29.126,2136 L", () => {
    const dados = tanqueDoForm(form({ uso: "material", capacidade: "30", capacidadeUnidade: "t", densidade: "1,03" }));
    expect(dados).toMatchObject({ capacidade: 29126.2136, capacidadeUnidade: "t", densidade: 1.03 });
    expect(tanqueSchema.safeParse(dados).success).toBe(true);
  });
  it("m³ vira litro sem densidade de por meio; kg divide pela densidade", () => {
    expect(tanqueDoForm(form({ uso: "material", capacidade: "30", capacidadeUnidade: "m3" })).capacidade).toBe(30000);
    expect(tanqueDoForm(form({ uso: "material", capacidade: "950", capacidadeUnidade: "kg", densidade: "0,95" })).capacidade).toBe(1000);
  });
  it("tanque de material exige densidade; o de combustível não", () => {
    const semDensidade = tanqueFormSchema.safeParse(form({ uso: "material", densidade: "" }));
    expect(semDensidade.success).toBe(false);
    expect(semDensidade.error?.issues[0]?.path).toEqual(["densidade"]);
    expect(tanqueFormSchema.safeParse(form({ uso: "material", densidade: "0" })).success).toBe(false);
    expect(tanqueFormSchema.safeParse(form({ densidade: "" })).success).toBe(true);
  });
  it("tanque de combustível é sempre em litros e sem densidade, sobre qualquer resto do form", () => {
    const dados = tanqueDoForm(form({ capacidade: "15000", capacidadeUnidade: "t", densidade: "2" }));
    expect(dados).toMatchObject({ capacidade: 15000, capacidadeUnidade: "L", densidade: null });
  });
  it("o servidor repete o CHECK do banco: capacidade em massa sem densidade é recusada", () => {
    const base = tanqueDoForm(form({ uso: "material", capacidade: "30", capacidadeUnidade: "t" }));
    expect(tanqueSchema.safeParse({ ...base, densidade: null }).success).toBe(false);
    expect(tanqueSchema.safeParse({ ...base, capacidadeUnidade: "m3", densidade: null }).success).toBe(true);
  });
});

function form(troca: Partial<TanqueFormInput> = {}): TanqueFormInput {
  return {
    nome: "Tanque Comboio 01",
    apelido: "",
    capacidade: "15000",
    capacidadeUnidade: "L",
    densidade: "1",
    uso: "combustivel",
    ehExterno: false,
    proprietarioId: "",
    observacoes: "",
    ativo: true,
    ...troca,
  };
}

describe("tanque", () => {
  it("tanque de terceiro exige o dono; da EMT não", () => {
    expect(tanqueFormSchema.safeParse(form()).success).toBe(true);
    const semDono = tanqueFormSchema.safeParse(form({ ehExterno: true }));
    expect(semDono.success).toBe(false);
    expect(semDono.error?.issues[0]?.path).toEqual(["proprietarioId"]);
    expect(tanqueFormSchema.safeParse(form({ ehExterno: true, proprietarioId: DONO })).success).toBe(true);
  });

  it("o servidor repete a regra do banco: externo = tem dono", () => {
    const base = tanqueDoForm(form());
    expect(tanqueSchema.safeParse(base).success).toBe(true);
    expect(tanqueSchema.safeParse({ ...base, ehExterno: true }).success).toBe(false);
    expect(tanqueSchema.safeParse({ ...base, proprietarioId: DONO }).success).toBe(false);
    expect(tanqueSchema.safeParse({ ...base, ehExterno: true, proprietarioId: DONO }).success).toBe(true);
  });

  it("voltar para tanque da EMT descarta o dono escolhido antes", () => {
    const dados = tanqueDoForm(form({ ehExterno: false, proprietarioId: DONO }));
    expect(dados.proprietarioId).toBeNull();
  });

  it("capacidade aceita zero e 4 casas, recusa 5 e negativo", () => {
    expect(tanqueDoForm(form({ capacidade: "0" })).capacidade).toBe(0);
    expect(tanqueDoForm(form({ capacidade: "15000" })).capacidade).toBe(15000);
    // Com 4 casas, "15.000" é quinze litros (o ponto vira vírgula na digitação).
    expect(tanqueDoForm(form({ capacidade: "15.000" })).capacidade).toBe(15);
    expect(tanqueFormSchema.safeParse(form({ capacidade: "1000,1234" })).success).toBe(true);
    expect(tanqueFormSchema.safeParse(form({ capacidade: "1000,12345" })).success).toBe(false);
    expect(tanqueFormSchema.safeParse(form({ capacidade: "-1" })).success).toBe(false);
    expect(tanqueFormSchema.safeParse(form({ capacidade: "" })).success).toBe(false);
    expect(tanqueSchema.safeParse({ ...tanqueDoForm(form()), capacidade: 1.12345 }).success).toBe(false);
  });

  it("nome vazio é recusado; uma letra basta, como na origem", () => {
    expect(tanqueFormSchema.safeParse(form({ nome: "   " })).success).toBe(false);
    expect(tanqueFormSchema.safeParse(form({ nome: " T " })).success).toBe(true);
  });
});

describe("planilha de tanques", () => {
  it("capacidade vazia é 0, número da célula e texto pt-BR valem", () => {
    expect(capacidadeDaPlanilha(null)).toBe(0);
    expect(capacidadeDaPlanilha(15000)).toBe(15000);
    expect(capacidadeDaPlanilha("15.000,5")).toBe(15000.5);
    expect(() => capacidadeDaPlanilha("muito")).toThrow();
    expect(() => capacidadeDaPlanilha(-3)).toThrow();
  });

  const fornecedores: FornecedorParaCasar[] = [
    { id: "a", razaoSocial: "TRANSTERRA TRANSPORTES LTDA", nomeFantasia: "Transterra", cnpjCpf: "12.345.678/0001-90" },
    { id: "b", razaoSocial: "Posto Progresso Ltda", nomeFantasia: null, cnpjCpf: "98765432000110" },
    { id: "c", razaoSocial: "Areacre Comércio", nomeFantasia: "Posto Irmãos", cnpjCpf: null },
    { id: "d", razaoSocial: "POSTO IRMAOS", nomeFantasia: null, cnpjCpf: null },
  ];

  it("casa pelo CNPJ com ou sem pontuação", () => {
    expect(casarDono("12345678000190", fornecedores)).toEqual({ id: "a" });
    expect(casarDono("98.765.432/0001-10", fornecedores)).toEqual({ id: "b" });
    expect(casarDono("11.111.111/0001-11", fornecedores)).toHaveProperty("erro");
  });

  it("casa pelo nome normalizando acento, caixa e espaço dos dois lados", () => {
    expect(casarDono("  transterra ", fornecedores)).toEqual({ id: "a" });
    expect(casarDono("POSTO  PROGRESSO LTDA", fornecedores)).toEqual({ id: "b" });
  });

  it("nome que casa com dois fornecedores é ambíguo e pede o CNPJ", () => {
    // "Posto Irmãos" é fantasia de um e razão social (sem acento) de outro.
    const casado = casarDono("Posto Irmãos", fornecedores);
    expect(casado).toHaveProperty("erro");
    expect("erro" in casado && casado.erro).toMatch(/CNPJ/);
  });
});
