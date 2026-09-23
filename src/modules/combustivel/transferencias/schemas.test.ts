import { describe, expect, it } from "vitest";

import {
  litrosNumero,
  litrosParaTexto,
  paraLitros,
  transferenciaDoForm,
  transferenciaFormSchema,
  transferenciaSchema,
  type TransferenciaFormInput,
} from "@/modules/combustivel/transferencias/schemas";

const ORIGEM = "11111111-1111-4111-8111-111111111111";
const DESTINO = "22222222-2222-4222-8222-222222222222";

function form(troca: Partial<TransferenciaFormInput> = {}): TransferenciaFormInput {
  return {
    origemId: ORIGEM,
    destinoId: DESTINO,
    litros: "1.500,1234",
    dataHora: "2026-09-23T14:30",
    observacoes: "",
    ...troca,
  };
}

describe("litros digitados", () => {
  it("aceita 4 casas e lê milhar pt-BR", () => {
    expect(paraLitros("1.500,1234")).toBe(1500.1234);
    expect(paraLitros("155,6")).toBe(155.6);
  });

  it("recusa a quinta casa em vez de arredondar calado", () => {
    expect(transferenciaFormSchema.safeParse(form({ litros: "10,12345" })).success).toBe(false);
    expect(litrosNumero.safeParse(10.12345).success).toBe(false);
    expect(litrosNumero.safeParse(10.1234).success).toBe(true);
  });

  it("recusa zero, negativo e texto", () => {
    for (const litros of ["0", "-5", "abc", ""]) {
      expect(transferenciaFormSchema.safeParse(form({ litros })).success).toBe(false);
    }
  });

  it("volta do banco para o campo sem perder casa nem inventar zero", () => {
    expect(litrosParaTexto(1500.1234)).toBe("1500,1234");
    expect(litrosParaTexto(200)).toBe("200");
    expect(litrosParaTexto(null)).toBe("");
  });
});

describe("transferência", () => {
  it("origem e destino iguais é recusado no formulário e no servidor", () => {
    const igual = transferenciaFormSchema.safeParse(form({ destinoId: ORIGEM }));
    expect(igual.success).toBe(false);
    expect(igual.error?.issues[0]?.path).toEqual(["destinoId"]);

    const servidor = transferenciaSchema.safeParse({
      origemId: ORIGEM,
      destinoId: ORIGEM,
      litros: 10,
      dataHora: "2026-09-23T14:30:00-05:00",
      observacoes: "",
    });
    expect(servidor.success).toBe(false);
  });

  it("data vazia ou impossível não passa", () => {
    expect(transferenciaFormSchema.safeParse(form({ dataHora: "" })).success).toBe(false);
    expect(transferenciaFormSchema.safeParse(form({ dataHora: "2026-02-31T10:00" })).success).toBe(false);
  });

  it("converte o formulário com a hora de Rio Branco (-05:00) e litros em número", () => {
    const dados = transferenciaDoForm(form());
    expect(dados).toEqual({
      origemId: ORIGEM,
      destinoId: DESTINO,
      litros: 1500.1234,
      dataHora: "2026-09-23T14:30:00-05:00",
      observacoes: "",
    });
    expect(transferenciaSchema.safeParse(dados).success).toBe(true);
  });

  it("o servidor recusa data que não é ISO", () => {
    const dados = { ...transferenciaDoForm(form()), dataHora: "23/09/2026 14:30" };
    expect(transferenciaSchema.safeParse(dados).success).toBe(false);
  });
});
