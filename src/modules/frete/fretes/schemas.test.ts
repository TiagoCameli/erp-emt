// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  AVISO_TRANSFERENCIA,
  dadosDaRpc,
  freteDoForm,
  freteFormSchema,
  freteSchema,
  precoUnitarioMaterial,
  tkmDoFrete,
  valorMaterialFrete,
  valorTotalFrete,
  valorUnitarioDaEdicao,
  type FreteFormInput,
} from "@/modules/frete/fretes/schemas";

const ID = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;

const FORM: FreteFormInput = {
  tipo: "material",
  data: "2026-09-20",
  dataChegada: "",
  obraId: ID(1),
  origemId: ID(2),
  destinoId: ID(3),
  transportadoraId: ID(4),
  motorista: "João Silva",
  insumoId: ID(5),
  peso: "32,5",
  km: "120",
  valorTkm: "0,37",
  valorUnitarioMaterial: "85,1234",
  notaFiscal: " 123 ",
  notaFiscal2: "",
  placa: "abc-1d23",
  observacoes: "",
};

function mensagens(form: FreteFormInput): string[] {
  const r = freteFormSchema.safeParse(form);
  return r.success ? [] : r.error.issues.map((i) => i.message);
}

describe("contas da origem", () => {
  it("valor total = KM × Peso × R$/TKM, exato (sem arredondar)", () => {
    expect(valorTotalFrete(32.5, 120, 0.37)).toBe(32.5 * 120 * 0.37);
    expect(valorTotalFrete(31.2345, 87.6, 0.3712)).toBe(31.2345 * 87.6 * 0.3712);
    expect(valorTotalFrete(null, 120, 0.37)).toBe(0);
  });

  it("preço do material = unitário × peso; zero na transferência", () => {
    expect(valorMaterialFrete("material", 85.1234, 32.5)).toBe(85.1234 * 32.5);
    expect(valorMaterialFrete("transferencia", 85.1234, 32.5)).toBe(0);
    expect(valorMaterialFrete("material", null, 32.5)).toBe(0);
  });

  it("na edição o unitário é valor do material ÷ peso, quando os dois existem", () => {
    expect(valorUnitarioDaEdicao(2766.5105, 32.5)).toBe(2766.5105 / 32.5);
    expect(valorUnitarioDaEdicao(0, 32.5)).toBeNull();
    expect(valorUnitarioDaEdicao(100, 0)).toBeNull();
  });

  it("preço unitário da lista e TKM", () => {
    expect(precoUnitarioMaterial(100, 0)).toBe(0);
    expect(precoUnitarioMaterial(100, 4)).toBe(25);
    expect(tkmDoFrete(120, 32.5)).toBe(3900);
  });

  it("o aviso da transferência não tem travessão", () => {
    expect(AVISO_TRANSFERENCIA).not.toContain("—");
    expect(AVISO_TRANSFERENCIA).toContain("Não desconta saldo de pedreira");
  });
});

describe("freteFormSchema (mensagens da origem)", () => {
  it("aceita o formulário completo", () => {
    expect(mensagens(FORM)).toEqual([]);
  });

  it("obrigatórios com as mensagens da origem", () => {
    const vazio: FreteFormInput = {
      ...FORM,
      data: "",
      obraId: "",
      origemId: "",
      destinoId: "",
      transportadoraId: "",
      motorista: "J",
      insumoId: "",
      peso: "",
      km: "0",
      valorTkm: "",
    };
    expect(mensagens(vazio)).toEqual(
      expect.arrayContaining([
        "Data de saída obrigatória",
        "Selecione a obra",
        "Origem obrigatória",
        "Destino obrigatório",
        "Selecione a transportadora",
        "Nome do motorista",
        "Selecione o material",
        "Peso obrigatório",
        "KM deve ser > 0",
        "R$/TKM obrigatório",
      ]),
    );
  });

  it("transferência: obra opcional", () => {
    expect(mensagens({ ...FORM, tipo: "transferencia", obraId: "" })).toEqual([]);
  });

  it("placa, unitário negativo e observação longa", () => {
    expect(mensagens({ ...FORM, placa: "AB-12" })).toContain("Placa inválida (ex: ABC-1D34)");
    expect(mensagens({ ...FORM, placa: "ABC1234" })).toEqual([]);
    expect(mensagens({ ...FORM, valorUnitarioMaterial: "-1" })).toContain("Valor unitário deve ser ≥ 0");
    expect(mensagens({ ...FORM, observacoes: "x".repeat(501) })).toContain("Máximo 500 caracteres");
  });

  it("taxa com mais de 4 casas é recusada", () => {
    expect(mensagens({ ...FORM, valorTkm: "0,37123" }).length).toBeGreaterThan(0);
  });
});

describe("freteDoForm e o payload da fn_frete_salvar", () => {
  it("material: números, NF aparada, placa em maiúscula, chegada vazia vira nulo", () => {
    const d = freteDoForm(FORM);
    expect(d).toMatchObject({
      tipo: "material",
      centroCustoId: ID(1),
      pesoToneladas: 32.5,
      kmRodados: 120,
      valorTkm: 0.37,
      valorUnitarioMaterial: 85.1234,
      notaFiscal: "123",
      notaFiscal2: null,
      placaCarreta: "ABC-1D23",
      dataChegada: null,
      observacoes: null,
    });
    expect(freteSchema.safeParse(d).success).toBe(true);
  });

  it("transferência não leva NF nem valor de material", () => {
    const d = freteDoForm({ ...FORM, tipo: "transferencia", obraId: "", notaFiscal: "9", notaFiscal2: "8" });
    expect(d.valorUnitarioMaterial).toBe(0);
    expect(d.notaFiscal).toBeNull();
    expect(d.notaFiscal2).toBeNull();
    expect(d.centroCustoId).toBeNull();
    expect(freteSchema.safeParse(d).success).toBe(true);
  });

  it("edição sem mexer no unitário manda o exato (valor ÷ peso), não o arredondado", () => {
    const exato = 2766.51 / 32.5;
    const d = freteDoForm({ ...FORM, valorUnitarioMaterial: "85,1234" }, { texto: "85,1234", valor: exato });
    expect(d.valorUnitarioMaterial).toBe(exato);
    const reescrito = freteDoForm({ ...FORM, valorUnitarioMaterial: "80,00" }, { texto: "80", valor: 80.00001 });
    expect(reescrito.valorUnitarioMaterial).toBe(80.00001);
    const digitado = freteDoForm({ ...FORM, valorUnitarioMaterial: "90" }, { texto: "85,1234", valor: exato });
    expect(digitado.valorUnitarioMaterial).toBe(90);
  });

  it("servidor: material sem obra é recusado", () => {
    const r = freteSchema.safeParse({ ...freteDoForm(FORM), centroCustoId: null });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Selecione a obra");
  });

  it("dadosDaRpc tem exatamente as chaves que a fn_frete_salvar lê", () => {
    expect(Object.keys(dadosDaRpc(freteDoForm(FORM))).sort()).toEqual(
      [
        "tipo",
        "data",
        "data_chegada",
        "centro_custo_id",
        "origem_localidade_id",
        "destino_localidade_id",
        "transportadora_id",
        "motorista",
        "placa_carreta",
        "insumo_id",
        "peso_toneladas",
        "km_rodados",
        "valor_tkm",
        "valor_unitario_material",
        "nota_fiscal",
        "nota_fiscal2",
        "observacoes",
      ].sort(),
    );
  });
});
