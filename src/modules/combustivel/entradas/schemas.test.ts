// @vitest-environment node
import { describe, expect, it } from "vitest";

import { filtrarEntradas } from "@/modules/combustivel/entradas/filtros";
import type { EntradaLinha } from "@/modules/combustivel/entradas/queries";
import {
  entradaDoForm,
  entradaFormSchema,
  entradaSchema,
  litrosDaEntrada,
  precoPorLitro,
  type EntradaFormInput,
} from "@/modules/combustivel/entradas/schemas";

const TANQUE = "11111111-1111-4111-8111-111111111111";
const DIESEL = "22222222-2222-4222-8222-222222222222";
const FORNECEDOR = "33333333-3333-4333-8333-333333333333";

function form(troca: Partial<EntradaFormInput> = {}): EntradaFormInput {
  return {
    tanqueId: TANQUE,
    insumoId: DIESEL,
    quantidade: "1000",
    valorTotal: "6394,7",
    fornecedorId: "",
    notaFiscal: " 12345 ",
    dataHora: "2026-09-20T14:30",
    observacoes: "",
    ...troca,
  };
}

describe("entradaFormSchema", () => {
  it("aceita a entrada completa, com 4 casas na quantidade e no valor", () => {
    expect(entradaFormSchema.safeParse(form({ quantidade: "1000,1234", valorTotal: "6394,7123" })).success).toBe(true);
  });

  it("recusa a quinta casa (quantidade e valor)", () => {
    expect(entradaFormSchema.safeParse(form({ quantidade: "1,12345" })).success).toBe(false);
    expect(entradaFormSchema.safeParse(form({ valorTotal: "10,12345" })).success).toBe(false);
  });

  it("quantidade zero não entra; valor zero entra (doação, sobra)", () => {
    expect(entradaFormSchema.safeParse(form({ quantidade: "0" })).success).toBe(false);
    expect(entradaFormSchema.safeParse(form({ valorTotal: "0" })).success).toBe(true);
  });

  it("tanque, combustível e data são obrigatórios", () => {
    const resultado = entradaFormSchema.safeParse(form({ tanqueId: "", insumoId: "", dataHora: "2026-02-31T10:00" }));
    expect(resultado.success).toBe(false);
    const campos = resultado.error?.issues.map((i) => i.path[0]);
    expect(campos).toEqual(expect.arrayContaining(["tanqueId", "insumoId", "dataHora"]));
  });
});

describe("entradaDoForm", () => {
  it("converte número pt-BR, data em Rio Branco e vazio em null", () => {
    const d = entradaDoForm(form({ quantidade: "1.000,5", fornecedorId: FORNECEDOR }));
    expect(d).toEqual({
      tanqueId: TANQUE,
      insumoId: DIESEL,
      quantidade: 1000.5,
      valorTotal: 6394.7,
      fornecedorId: FORNECEDOR,
      notaFiscal: "12345",
      dataHora: "2026-09-20T14:30:00-05:00",
      observacoes: null,
    });
    expect(entradaSchema.safeParse(d).success).toBe(true);
  });

  it("o servidor recusa o que a tela deixaria passar errado", () => {
    const base = entradaDoForm(form());
    expect(entradaSchema.safeParse({ ...base, quantidade: 1.12345 }).success).toBe(false);
    expect(entradaSchema.safeParse({ ...base, valorTotal: -1 }).success).toBe(false);
    expect(entradaSchema.safeParse({ ...base, dataHora: "2026-09-20T14:30" }).success).toBe(false);
    expect(entradaSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});

describe("prévia", () => {
  it("galão de Arla: 3 galões são 60 litros; sem fator, a quantidade é litro", () => {
    expect(litrosDaEntrada(3, 20)).toBe(60);
    expect(litrosDaEntrada(1000.5, null)).toBe(1000.5);
    expect(litrosDaEntrada(10, 1)).toBe(10);
  });

  it("preço por litro em 4 casas; sem litros, nulo", () => {
    expect(precoPorLitro(6394.7, 1000)).toBe(6.3947);
    expect(precoPorLitro(100, 3)).toBe(33.3333);
    expect(precoPorLitro(100, 0)).toBeNull();
  });
});

describe("filtrarEntradas", () => {
  function entrada(id: string, dataHora: string, troca: Partial<EntradaLinha> = {}): EntradaLinha {
    return {
      id,
      dataHora,
      tanqueId: TANQUE,
      tanqueNome: "Tanque 1",
      insumoId: DIESEL,
      insumoNome: "Diesel S10",
      unidade: "L",
      quantidade: 100,
      litros: 100,
      valorTotal: 600,
      precoLitro: 6,
      fornecedorId: null,
      fornecedorNome: "Posto Progresso",
      notaFiscal: "999",
      observacoes: null,
      origem: "manual",
      ...troca,
    };
  }

  const vazio = { busca: "", de: "", ate: "", tanqueId: "", insumoId: "" };

  it("o período conta o dia de Rio Branco, não o de UTC", () => {
    // 21/09 01:00 UTC = 20/09 20:00 em Rio Branco.
    const lista = [entrada("a", "2026-09-21T01:00:00Z"), entrada("b", "2026-09-21T06:00:00Z")];
    expect(filtrarEntradas(lista, { ...vazio, de: "2026-09-20", ate: "2026-09-20" }).map((e) => e.id)).toEqual(["a"]);
    expect(filtrarEntradas(lista, { ...vazio, de: "2026-09-21" }).map((e) => e.id)).toEqual(["b"]);
  });

  it("tanque, combustível e busca (fornecedor ou NF)", () => {
    const outro = "44444444-4444-4444-8444-444444444444";
    const lista = [entrada("a", "2026-09-20T12:00:00Z"), entrada("b", "2026-09-20T12:00:00Z", { tanqueId: outro, insumoId: outro, notaFiscal: "777", fornecedorNome: "Ipiranga" })];
    expect(filtrarEntradas(lista, { ...vazio, tanqueId: outro }).map((e) => e.id)).toEqual(["b"]);
    expect(filtrarEntradas(lista, { ...vazio, insumoId: DIESEL }).map((e) => e.id)).toEqual(["a"]);
    expect(filtrarEntradas(lista, { ...vazio, busca: "ipir" }).map((e) => e.id)).toEqual(["b"]);
    expect(filtrarEntradas(lista, { ...vazio, busca: "999" }).map((e) => e.id)).toEqual(["a"]);
  });
});
