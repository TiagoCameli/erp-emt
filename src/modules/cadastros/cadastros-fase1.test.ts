import { describe, expect, it } from "vitest";

import {
  equipamentoFormSchema,
  equipamentoSchema,
  medicaoParaNumero,
} from "@/modules/cadastros/equipamentos/schemas";
import {
  fornecedorSchema,
  taxaLitroParaNumero,
} from "@/modules/cadastros/fornecedores/schemas";
import { localidadeSchema } from "@/modules/cadastros/localidades/schemas";

/**
 * Regras dos campos que a Fase 1 da migração do Gestão Obras pôs nos cadastros
 * (22/09/2026). Taxa por litro e medição inicial são TAXA: 4 casas, e o texto
 * digitado em pt-BR ("1.234,5") tem que virar o número certo, não 1,2345.
 */

const FORNECEDOR_VALIDO = {
  tipo: "pj" as const,
  razaoSocial: "Josias O da Silva Ltda",
  nomeFantasia: "Areacre",
  cnpjCpf: "",
  inscricaoEstadual: "",
  email: "",
  telefone: "",
  cidade: "",
  uf: "",
  endereco: "",
  observacoes: "",
  ehTransportadora: true,
  ehDonaDeTanque: true,
  taxaLitroPadrao: "0,30",
  ativo: true,
};

describe("taxa por litro do fornecedor", () => {
  it("lê vírgula decimal e milhar pt-BR", () => {
    expect(taxaLitroParaNumero("0,30")).toBe(0.3);
    expect(taxaLitroParaNumero("0,3947")).toBe(0.3947);
    expect(taxaLitroParaNumero("1.234,5")).toBe(1234.5);
  });

  it("vazio vira null, e não zero", () => {
    expect(taxaLitroParaNumero("")).toBeNull();
  });

  it("recusa mais de 4 casas e texto que não é número", () => {
    expect(fornecedorSchema.safeParse({ ...FORNECEDOR_VALIDO, taxaLitroPadrao: "0,30001" }).success).toBe(false);
    expect(fornecedorSchema.safeParse({ ...FORNECEDOR_VALIDO, taxaLitroPadrao: "trinta" }).success).toBe(false);
    expect(fornecedorSchema.safeParse({ ...FORNECEDOR_VALIDO, taxaLitroPadrao: "-0,30" }).success).toBe(false);
  });

  it("aceita a taxa vazia e as flags de transportadora e dono de tanque", () => {
    const r = fornecedorSchema.safeParse({ ...FORNECEDOR_VALIDO, taxaLitroPadrao: "" });
    expect(r.success).toBe(true);
    expect(r.success && r.data.ehTransportadora && r.data.ehDonaDeTanque).toBe(true);
  });
});

const EQUIP_FORM = {
  codigo: "",
  descricao: "Caminhão Caçamba Colorado - 05",
  tipo: "",
  marca: "",
  modelo: "",
  ano: "",
  placa: "",
  controlePor: "km" as const,
  propriedade: "colorado" as const,
  status: "ativa" as const,
  medicaoInicial: "125.430,5",
  numeroSerie: "",
  dataAquisicao: "2026-03-19",
  dataVenda: "",
  ativo: true,
};

describe("equipamento: propriedade, situação, medição e datas", () => {
  it("medição inicial lê pt-BR com até 4 casas", () => {
    expect(medicaoParaNumero("125.430,5")).toBe(125430.5);
    expect(medicaoParaNumero("0,1234")).toBe(0.1234);
    expect(medicaoParaNumero("")).toBeUndefined();
    expect(equipamentoFormSchema.safeParse({ ...EQUIP_FORM, medicaoInicial: "1,23456" }).success).toBe(false);
  });

  it("só aceita as três propriedades do plano", () => {
    for (const propriedade of ["propria", "colorado", "alugada"]) {
      expect(equipamentoFormSchema.safeParse({ ...EQUIP_FORM, propriedade }).success).toBe(true);
    }
    expect(equipamentoFormSchema.safeParse({ ...EQUIP_FORM, propriedade: "consorcio" }).success).toBe(false);
  });

  it("venda antes da aquisição é recusada nos dois schemas", () => {
    const form = equipamentoFormSchema.safeParse({ ...EQUIP_FORM, dataVenda: "2026-01-01" });
    expect(form.success).toBe(false);
    expect(!form.success && form.error.issues[0]?.path).toEqual(["dataVenda"]);

    const servidor = equipamentoSchema.safeParse({
      descricao: "X de teste",
      controlePor: "km",
      propriedade: "propria",
      status: "ativa",
      dataAquisicao: "2026-03-19",
      dataVenda: "2026-01-01",
      ativo: true,
    });
    expect(servidor.success).toBe(false);
  });

  it("venda no mesmo dia ou depois passa", () => {
    expect(equipamentoFormSchema.safeParse({ ...EQUIP_FORM, dataVenda: "2026-03-19" }).success).toBe(true);
    expect(equipamentoFormSchema.safeParse({ ...EQUIP_FORM, dataVenda: "2027-01-01" }).success).toBe(true);
  });
});

describe("localidade", () => {
  it("exige nome e aceita endereço vazio", () => {
    expect(localidadeSchema.safeParse({ nome: "Pedreira Vale do Abunã", endereco: "", ativo: true }).success).toBe(true);
    expect(localidadeSchema.safeParse({ nome: " ", endereco: "", ativo: true }).success).toBe(false);
  });
});
