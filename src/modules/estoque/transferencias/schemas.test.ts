import { describe, expect, it } from "vitest";

import {
  transferenciaDoForm,
  transferenciaFormSchema,
  transferenciaSchema,
} from "@/modules/estoque/transferencias/schemas";

const PILHA_A = "11111111-1111-4111-8111-111111111111";
const DEPOSITO = "22222222-2222-4222-8222-222222222222";
const INSUMO = "79ea56b3-82fe-c79d-c598-09736c347c9f";

const FORM = {
  origem: `pilha:${PILHA_A}`,
  destino: `deposito:${DEPOSITO}`,
  insumoId: INSUMO,
  quantidade: "30",
  dataSaida: "2026-10-17",
  dataChegada: "2026-10-17",
  custoAdicional: "388,50",
  observacoes: " ",
};

describe("transferência", () => {
  it("converte o formulário: um local de cada lado, custo em reais", () => {
    expect(transferenciaDoForm(FORM)).toEqual({
      origem: { depositoId: null, tanqueId: null, pilhaId: PILHA_A },
      destino: { depositoId: DEPOSITO, tanqueId: null, pilhaId: null },
      insumoId: INSUMO,
      quantidade: 30,
      dataSaida: "2026-10-17",
      dataChegada: "2026-10-17",
      custoAdicional: 388.5,
      observacoes: null,
    });
    expect(transferenciaSchema.safeParse(transferenciaDoForm(FORM)).success).toBe(true);
  });

  it("sem custo adicional vale zero", () => {
    expect(transferenciaDoForm({ ...FORM, custoAdicional: "" }).custoAdicional).toBe(0);
  });

  it("origem e destino iguais são recusados", () => {
    const r = transferenciaFormSchema.safeParse({ ...FORM, destino: FORM.origem });
    expect(r.success ? [] : r.error.issues.map((i) => i.path.join("."))).toEqual(["destino"]);
    expect(transferenciaSchema.safeParse(transferenciaDoForm({ ...FORM, destino: FORM.origem })).success).toBe(false);
  });

  it("chegada antes da saída é recusada", () => {
    const r = transferenciaFormSchema.safeParse({ ...FORM, dataChegada: "2026-10-16" });
    expect(r.success ? [] : r.error.issues.map((i) => i.path.join("."))).toEqual(["dataChegada"]);
  });

  it("local que não é local é recusado", () => {
    expect(transferenciaFormSchema.safeParse({ ...FORM, origem: PILHA_A }).success).toBe(false);
  });
});
