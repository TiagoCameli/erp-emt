import { describe, expect, it } from "vitest";

import {
  entradaDoForm,
  entradaFormSchema,
  entradaSchema,
  saidaDoForm,
  saidaFormSchema,
  saidaSchema,
} from "@/modules/estoque/schemas";

const DEPOSITO = "11111111-1111-4111-8111-111111111111";
const INSUMO = "22222222-2222-4222-8222-222222222222";
// Id real da carga (md5): o schema tem de aceitar.
const OC_ITEM = "38673fc5-c55a-c7be-8687-e9b1d3589ef1";

const FORM_AVULSA = {
  origem: "avulsa" as const,
  ocItemId: "",
  local: `deposito:${DEPOSITO}`,
  insumoId: INSUMO,
  quantidade: "1.234,5",
  valorUnitario: "6,3947",
  data: "2026-10-13",
  notaFiscal: " ",
  observacoes: "",
};

const FORM_SAIDA = {
  local: `tanque:${DEPOSITO}`,
  insumoId: INSUMO,
  quantidade: "2,5",
  data: "2026-10-13",
  centroCustoId: OC_ITEM,
  observacoes: " para a base ",
};

describe("schemas do estoque", () => {
  it("avulsa exige insumo e valor unitário", () => {
    const r = entradaFormSchema.safeParse({ ...FORM_AVULSA, insumoId: "", valorUnitario: "" });
    expect(r.success).toBe(false);
    const caminhos = r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    expect(caminhos).toEqual(expect.arrayContaining(["insumoId", "valorUnitario"]));
  });

  it("de OC exige só o item; insumo e valor ficam com a OC", () => {
    const r = entradaFormSchema.safeParse({ ...FORM_AVULSA, origem: "oc", ocItemId: "", insumoId: "", valorUnitario: "" });
    expect(r.success ? [] : r.error.issues.map((i) => i.path.join("."))).toEqual(["ocItemId"]);
  });

  it("a data é obrigatória (nem a OC preenche)", () => {
    expect(entradaFormSchema.safeParse({ ...FORM_AVULSA, data: "" }).success).toBe(false);
  });

  it("o local é depósito, tanque ou pilha; outra coisa é recusada", () => {
    expect(entradaFormSchema.safeParse({ ...FORM_AVULSA, local: "" }).success).toBe(false);
    expect(entradaFormSchema.safeParse({ ...FORM_AVULSA, local: DEPOSITO }).success).toBe(false);
    expect(entradaFormSchema.safeParse({ ...FORM_AVULSA, local: `tanque:${DEPOSITO}` }).success).toBe(true);
    expect(entradaFormSchema.safeParse({ ...FORM_AVULSA, local: `pilha:${DEPOSITO}` }).success).toBe(true);
  });

  it("entrada numa pilha vai só com a pilha", () => {
    const d = entradaDoForm({ ...FORM_AVULSA, local: `pilha:${DEPOSITO}` });
    expect([d.depositoId, d.tanqueId, d.pilhaId]).toEqual([null, null, DEPOSITO]);
    expect(entradaSchema.safeParse(d).success).toBe(true);
  });

  it("a action recusa dois locais ao mesmo tempo", () => {
    const d = entradaDoForm(FORM_AVULSA);
    expect(entradaSchema.safeParse({ ...d, pilhaId: DEPOSITO }).success).toBe(false);
    expect(saidaSchema.safeParse({ ...saidaDoForm(FORM_SAIDA), pilhaId: DEPOSITO }).success).toBe(false);
  });

  it("converte o formulário avulso para números e nulos", () => {
    expect(entradaDoForm(FORM_AVULSA)).toEqual({
      ocItemId: null,
      depositoId: DEPOSITO,
      tanqueId: null,
      pilhaId: null,
      insumoId: INSUMO,
      quantidade: 1234.5,
      valorUnitario: 6.3947,
      data: "2026-10-13",
      notaFiscal: null,
      observacoes: null,
    });
  });

  it("na OC, o que estiver no insumo e no valor não vai para a action", () => {
    const d = entradaDoForm({ ...FORM_AVULSA, origem: "oc", ocItemId: OC_ITEM });
    expect(d.ocItemId).toBe(OC_ITEM);
    expect(d.insumoId).toBeNull();
    expect(d.valorUnitario).toBeNull();
  });

  it("saída exige centro de custo", () => {
    expect(saidaFormSchema.safeParse({ ...FORM_SAIDA, centroCustoId: "" }).success).toBe(false);
  });

  it("converte a saída de um tanque de material", () => {
    expect(saidaDoForm(FORM_SAIDA)).toEqual({
      depositoId: null,
      tanqueId: DEPOSITO,
      pilhaId: null,
      insumoId: INSUMO,
      quantidade: 2.5,
      data: "2026-10-13",
      centroCustoId: OC_ITEM,
      observacoes: "para a base",
    });
  });
});
