// @vitest-environment node
import { describe, expect, it } from "vitest";

import { filtrarEntradas, lerFiltrosEntradas } from "@/modules/combustivel/entradas/filtros";
import type { EntradaLinha } from "@/modules/combustivel/entradas/queries";
import {
  conflitoCombustivel,
  entradaDoForm,
  entradaFormSchema,
  entradaSchema,
  espacoDisponivel,
  excedeCapacidade,
  litrosDaEntrada,
  precoPorLitro,
  precoUnitarioDaEntrada,
  valorTotalEntrada,
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
    valorUnitario: "6,3947",
    fornecedorId: FORNECEDOR,
    notaFiscal: " 12345 ",
    dataHora: "2026-09-20T14:30",
    observacoes: "",
    ...troca,
  };
}

describe("entradaFormSchema (EntradaForm da origem)", () => {
  it("aceita a entrada completa, com 4 casas na quantidade e no valor unitário", () => {
    expect(entradaFormSchema.safeParse(form({ quantidade: "1000,1234", valorUnitario: "6,3947" })).success).toBe(true);
  });

  it("recusa a quinta casa (quantidade e valor unitário)", () => {
    expect(entradaFormSchema.safeParse(form({ quantidade: "1,12345" })).success).toBe(false);
    expect(entradaFormSchema.safeParse(form({ valorUnitario: "6,39471" })).success).toBe(false);
  });

  it("quantidade e valor unitário precisam ser > 0, como na origem", () => {
    expect(entradaFormSchema.safeParse(form({ quantidade: "0" })).success).toBe(false);
    expect(entradaFormSchema.safeParse(form({ valorUnitario: "0" })).success).toBe(false);
  });

  it("tanque, combustível, fornecedor e data são obrigatórios", () => {
    const resultado = entradaFormSchema.safeParse(
      form({ tanqueId: "", insumoId: "", fornecedorId: "", dataHora: "2026-02-31T10:00" }),
    );
    expect(resultado.success).toBe(false);
    const campos = resultado.error?.issues.map((i) => i.path[0]);
    expect(campos).toEqual(expect.arrayContaining(["tanqueId", "insumoId", "fornecedorId", "dataHora"]));
  });
});

describe("entradaDoForm", () => {
  it("converte número pt-BR, data em Rio Branco e vazio em null", () => {
    const d = entradaDoForm(form({ quantidade: "1.000,5" }));
    expect(d).toEqual({
      tanqueId: TANQUE,
      insumoId: DIESEL,
      quantidade: 1000.5,
      valorUnitario: 6.3947,
      fornecedorId: FORNECEDOR,
      notaFiscal: "12345",
      dataHora: "2026-09-20T14:30:00-05:00",
      observacoes: null,
    });
    expect(entradaSchema.safeParse(d).success).toBe(true);
  });

  it("na edição sem mexer no preço, vai o exato (valor ÷ quantidade); mexeu, vai o digitado", () => {
    // 12.345,67 / 1.234,5 = 10,000542730... A tela mostra 10,0005.
    const exato = precoUnitarioDaEntrada(12345.67, 1234.5);
    const edicao = { valor: exato, texto: "10,0005" };
    const semMexer = entradaDoForm(form({ quantidade: "1234,5", valorUnitario: "10,0005" }), edicao);
    expect(semMexer.valorUnitario).toBe(exato);
    expect(semMexer.quantidade * semMexer.valorUnitario).toBeCloseTo(12345.67, 8);
    expect(entradaSchema.safeParse(semMexer).success).toBe(true);

    const mexeu = entradaDoForm(form({ quantidade: "1234,5", valorUnitario: "10,01" }), edicao);
    expect(mexeu.valorUnitario).toBe(10.01);
  });

  it("o servidor recusa o que a tela deixaria passar errado", () => {
    const base = entradaDoForm(form());
    expect(entradaSchema.safeParse({ ...base, quantidade: 1.12345 }).success).toBe(false);
    expect(entradaSchema.safeParse({ ...base, valorUnitario: 0 }).success).toBe(false);
    expect(entradaSchema.safeParse({ ...base, valorUnitario: -1 }).success).toBe(false);
    expect(entradaSchema.safeParse({ ...base, fornecedorId: null }).success).toBe(false);
    expect(entradaSchema.safeParse({ ...base, dataHora: "2026-09-20T14:30" }).success).toBe(false);
    expect(entradaSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});

describe("total e unitário (origem: valorTotalCalc e o preenchimento da edição)", () => {
  it("total = quantidade × valor unitário, sem arredondar", () => {
    expect(valorTotalEntrada(1000, 6.3947)).toBeCloseTo(6394.7, 10);
    expect(valorTotalEntrada(3, 1.23456789)).toBeCloseTo(3.70370367, 10);
    expect(valorTotalEntrada(null, 6)).toBe(0);
    expect(valorTotalEntrada(10, null)).toBe(0);
  });

  it("unitário da edição = valor ÷ quantidade; sem quantidade, zero", () => {
    expect(precoUnitarioDaEntrada(6394.7, 1000)).toBeCloseTo(6.3947, 12);
    expect(precoUnitarioDaEntrada(100, 0)).toBe(0);
  });
});

describe("capacidade e mistura (origem: espacoDisponivel e conflitoCombustivel)", () => {
  const tanque = { id: TANQUE, ehExterno: false, capacidadeLitros: 15000, nivelAtualLitros: 12000, combustivelAtualId: DIESEL };

  it("espaço = capacidade - nível; na edição do mesmo tanque devolve os litros da própria entrada", () => {
    expect(espacoDisponivel(tanque, null)).toBe(3000);
    expect(espacoDisponivel(tanque, { tanqueId: TANQUE, litros: 1000 })).toBe(4000);
    expect(espacoDisponivel(tanque, { tanqueId: "outro", litros: 1000 })).toBe(3000);
  });

  it("passar do espaço trava; capacidade zero (sem cadastro) não trava", () => {
    expect(excedeCapacidade(tanque, 3000, null)).toBe(false);
    expect(excedeCapacidade(tanque, 3000.5, null)).toBe(true);
    expect(excedeCapacidade(tanque, 3500, { tanqueId: TANQUE, litros: 1000 })).toBe(false);
    expect(excedeCapacidade({ ...tanque, capacidadeLitros: 0 }, 99999, null)).toBe(false);
  });

  it("outro combustível no tanque com nível bloqueia; vazio, externo ou o mesmo passa", () => {
    const gasolina = "55555555-5555-4555-8555-555555555555";
    expect(conflitoCombustivel(tanque, gasolina)).toBe(DIESEL);
    expect(conflitoCombustivel(tanque, DIESEL)).toBeNull();
    expect(conflitoCombustivel({ ...tanque, nivelAtualLitros: 0 }, gasolina)).toBeNull();
    expect(conflitoCombustivel({ ...tanque, ehExterno: true }, gasolina)).toBeNull();
    expect(conflitoCombustivel({ ...tanque, combustivelAtualId: null }, gasolina)).toBeNull();
    expect(conflitoCombustivel(null, gasolina)).toBeNull();
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
      excluidoEm: null,
      motivoExclusao: null,
      anexos: 0,
      ...troca,
    };
  }

  const vazio = { busca: "", de: "", ate: "", tanqueIds: [], insumoIds: [], fornecedorIds: [] };

  it("o período conta o dia de Rio Branco, não o de UTC", () => {
    // 21/09 01:00 UTC = 20/09 20:00 em Rio Branco.
    const lista = [entrada("a", "2026-09-21T01:00:00Z"), entrada("b", "2026-09-21T06:00:00Z")];
    expect(filtrarEntradas(lista, { ...vazio, de: "2026-09-20", ate: "2026-09-20" }).map((e) => e.id)).toEqual(["a"]);
    expect(filtrarEntradas(lista, { ...vazio, de: "2026-09-21" }).map((e) => e.id)).toEqual(["b"]);
  });

  it("tanque, combustível e busca (fornecedor ou NF)", () => {
    const outro = "44444444-4444-4444-8444-444444444444";
    const lista = [entrada("a", "2026-09-20T12:00:00Z"), entrada("b", "2026-09-20T12:00:00Z", { tanqueId: outro, insumoId: outro, notaFiscal: "777", fornecedorNome: "Ipiranga" })];
    expect(filtrarEntradas(lista, { ...vazio, tanqueIds: [outro] }).map((e) => e.id)).toEqual(["b"]);
    expect(filtrarEntradas(lista, { ...vazio, insumoIds: [DIESEL] }).map((e) => e.id)).toEqual(["a"]);
    expect(filtrarEntradas(lista, { ...vazio, busca: "ipir" }).map((e) => e.id)).toEqual(["b"]);
    expect(filtrarEntradas(lista, { ...vazio, busca: "999" }).map((e) => e.id)).toEqual(["a"]);
  });

  it("lista do recorte: qualquer um dos marcados; fornecedor sem cadastro não casa", () => {
    const outro = "44444444-4444-4444-8444-444444444444";
    const lista = [
      entrada("a", "2026-09-20T12:00:00Z", { fornecedorId: FORNECEDOR }),
      entrada("b", "2026-09-20T12:00:00Z", { tanqueId: outro }),
    ];
    expect(filtrarEntradas(lista, { ...vazio, tanqueIds: [TANQUE, outro] }).map((e) => e.id)).toEqual(["a", "b"]);
    expect(filtrarEntradas(lista, { ...vazio, fornecedorIds: [FORNECEDOR] }).map((e) => e.id)).toEqual(["a"]);
  });
});

describe("lerFiltrosEntradas", () => {
  const padrao = { de: "2026-08-25", ate: "2026-09-23" };

  it("sem período na URL, o padrão; com uma ponta, a outra fica aberta", () => {
    expect(lerFiltrosEntradas({}, padrao)).toMatchObject(padrao);
    expect(lerFiltrosEntradas({ de: "2026-09-01" }, padrao)).toMatchObject({ de: "2026-09-01", ate: "" });
    expect(lerFiltrosEntradas({})).toMatchObject({ de: "", ate: "" });
  });

  it("listas do recorte por vírgula, só uuid; período invertido troca", () => {
    const f = lerFiltrosEntradas({
      tanque: `${TANQUE},lixo`,
      combustivel: DIESEL,
      fornecedor: [FORNECEDOR],
      de: "2026-09-30",
      ate: "2026-09-01",
    });
    expect(f).toEqual({
      de: "2026-09-01",
      ate: "2026-09-30",
      tanqueIds: [TANQUE],
      insumoIds: [DIESEL],
      fornecedorIds: [FORNECEDOR],
    });
  });
});
