import { describe, expect, it } from "vitest";

import {
  escreverFornecedoresNaUrl,
  lerFornecedoresDaUrl,
  MAX_FORNECEDORES,
} from "@/modules/financeiro/relatorios/extrato-filtros";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("lerFornecedoresDaUrl", () => {
  it("sem parâmetro, nenhum fornecedor (que é 'todos')", () => {
    expect(lerFornecedoresDaUrl(undefined)).toEqual([]);
    expect(lerFornecedoresDaUrl("")).toEqual([]);
  });

  it("um id", () => {
    expect(lerFornecedoresDaUrl(A)).toEqual([A]);
  });

  it("vários separados por vírgula, na ordem escolhida", () => {
    expect(lerFornecedoresDaUrl(`${A},${B},${C}`)).toEqual([A, B, C]);
  });

  it("aceita chave repetida também", () => {
    // É como um formulário mandaria, e como um link colado pode vir.
    expect(lerFornecedoresDaUrl([A, `${B},${C}`])).toEqual([A, B, C]);
  });

  it("descarta o que não é uuid em vez de mandar lixo pro banco", () => {
    expect(lerFornecedoresDaUrl(`${A},123,,${B},'; drop table x; --`)).toEqual([
      A,
      B,
    ]);
  });

  it("deduplica preservando a primeira posição", () => {
    expect(lerFornecedoresDaUrl(`${A},${B},${A}`)).toEqual([A, B]);
  });

  it("tolera espaço em volta dos ids", () => {
    expect(lerFornecedoresDaUrl(` ${A} , ${B} `)).toEqual([A, B]);
  });

  it("corta no teto, porque uuid demais estoura a URL do PostgREST", () => {
    // 37 caracteres por uuid no filtro `in`: lista grande vira HTTP 400 por
    // tamanho de URL antes de chegar na RLS.
    const muitos = Array.from(
      { length: MAX_FORNECEDORES + 10 },
      (_, i) => `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`,
    );
    expect(lerFornecedoresDaUrl(muitos.join(","))).toHaveLength(
      MAX_FORNECEDORES,
    );
  });
});

describe("escreverFornecedoresNaUrl", () => {
  it("lista vazia remove o parâmetro", () => {
    expect(escreverFornecedoresNaUrl([])).toBeNull();
  });

  it("junta por vírgula", () => {
    expect(escreverFornecedoresNaUrl([A, B])).toBe(`${A},${B}`);
  });

  it("ida e volta pela URL preserva a escolha", () => {
    const escolhidos = [A, B, C];
    const naUrl = escreverFornecedoresNaUrl(escolhidos);
    expect(lerFornecedoresDaUrl(naUrl ?? undefined)).toEqual(escolhidos);
  });
});
