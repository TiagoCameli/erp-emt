import { describe, expect, it } from "vitest";

import { lerColagem, MAX_LINHAS_COLAGEM, type LinhaColada } from "./colar";
import type { ServicoParaLancar } from "./tipos";

/**
 * `lerColagem` é puro (sem rede): interpreta o texto colado do Excel contra os serviços das
 * medições ABERTAS do contrato (o mesmo formato que `servicosParaLancar` devolve) e resolve cada
 * linha, ou aponta o erro dela. D7: quantidade e km saem como TEXTO com ponto decimal, nunca por
 * `Number` (o "0,5" pt-BR tem de sair "0.5" exato, sem passar por double).
 */

function servico(over: Partial<ServicoParaLancar> = {}): ServicoParaLancar {
  return {
    medicaoId: "m11",
    medicaoNumero: 11,
    periodoInicio: "2026-09-01",
    periodoFim: "2026-09-30",
    itemId: "item-02.02",
    codigo: "02.02",
    descricao: "Escavação",
    unidade: "m3",
    quantidadePrevista: "1000",
    ...over,
  };
}

function semErros(linhas: LinhaColada[]) {
  return linhas.map((l) => ({
    data: l.data,
    itemId: l.itemId,
    quantidade: l.quantidade,
    kmInicial: l.kmInicial,
    kmFinal: l.kmFinal,
    estaca: l.estaca,
    observacao: l.observacao,
  }));
}

describe("lerColagem", () => {
  it("bloco com cabeçalho: a 1ª linha (\"Data\" na 1ª célula) é ignorada, não conta como linha nem erro", () => {
    const texto = "Data\tItem\tQuantidade\tKm inicial\tKm final\tEstaca\tObservação\n10/09/2026\t02.02\t10\t\t\t\t";
    const resultado = lerColagem(texto, [servico()], "texto");
    expect(resultado.erros).toEqual([]);
    expect(resultado.linhas).toHaveLength(1);
    expect(resultado.linhas[0].data).toBe("2026-09-10");
  });

  it("data dd/mm/aaaa e aaaa-mm-dd são equivalentes", () => {
    const texto = "10/09/2026\t02.02\t10\n2026-09-10\t02.02\t12";
    const resultado = lerColagem(texto, [servico()], "texto");
    expect(resultado.erros).toEqual([]);
    expect(resultado.linhas.map((l) => l.data)).toEqual(["2026-09-10", "2026-09-10"]);
  });

  it("data inválida (calendário que não existe) vira erro da linha", () => {
    const texto = "31/02/2026\t02.02\t10";
    const resultado = lerColagem(texto, [servico()], "texto");
    expect(resultado.linhas).toEqual([]);
    expect(resultado.erros).toEqual([{ linha: 1, erro: expect.stringContaining("Data inválida") }]);
  });

  it('quantidade "1.234,5" (pt-BR, com milhar) normaliza para "1234.5", nunca por Number', () => {
    const texto = "10/09/2026\t02.02\t1.234,5";
    const resultado = lerColagem(texto, [servico()], "texto");
    expect(resultado.erros).toEqual([]);
    expect(resultado.linhas[0].quantidade).toBe("1234.5");
  });

  it('quantidade "0,5" normaliza para "0.5"', () => {
    const texto = "10/09/2026\t02.02\t0,5";
    const resultado = lerColagem(texto, [servico()], "texto");
    expect(resultado.erros).toEqual([]);
    expect(resultado.linhas[0].quantidade).toBe("0.5");
  });

  it('quantidade com ponto decimal "1234.5" também normaliza para "1234.5"', () => {
    const texto = "10/09/2026\t02.02\t1234.5";
    const resultado = lerColagem(texto, [servico()], "texto");
    expect(resultado.erros).toEqual([]);
    expect(resultado.linhas[0].quantidade).toBe("1234.5");
  });

  it("quantidade que não dá para interpretar vira erro da linha, sem chegar a Number", () => {
    const texto = "10/09/2026\t02.02\tabc";
    const resultado = lerColagem(texto, [servico()], "texto");
    expect(resultado.linhas).toEqual([]);
    expect(resultado.erros).toEqual([{ linha: 1, erro: expect.stringContaining("Quantidade") }]);
  });

  it("contrato de rodovia: célula de km vazia vira erro da linha", () => {
    const texto = "10/09/2026\t02.02\t10\t\t120,500\t\t";
    const resultado = lerColagem(texto, [servico()], "rodovia");
    expect(resultado.linhas).toEqual([]);
    expect(resultado.erros).toEqual([{ linha: 1, erro: expect.stringContaining("km") }]);
  });

  it("contrato de rodovia com os dois km preenchidos: linha válida, km com ponto decimal", () => {
    const texto = "10/09/2026\t02.02\t10\t100,250\t120,500\tE-10\tObs";
    const resultado = lerColagem(texto, [servico()], "rodovia");
    expect(resultado.erros).toEqual([]);
    expect(semErros(resultado.linhas)).toEqual([
      {
        data: "2026-09-10",
        itemId: "item-02.02",
        quantidade: "10",
        kmInicial: "100.250",
        kmFinal: "120.500",
        estaca: "E-10",
        observacao: "Obs",
      },
    ]);
  });

  it("código de item inexistente entre os serviços da medição vira erro da linha", () => {
    const texto = "10/09/2026\t99.99\t10";
    const resultado = lerColagem(texto, [servico()], "texto");
    expect(resultado.linhas).toEqual([]);
    expect(resultado.erros).toEqual([{ linha: 1, erro: expect.stringContaining("99.99") }]);
  });

  it("código repetido entre serviços da mesma medição: não escolhe sozinho, pede o formulário", () => {
    const servicos = [
      servico({ itemId: "item-a", codigo: "02.02", descricao: "Serviço A" }),
      servico({ itemId: "item-b", codigo: "02.02", descricao: "Serviço B" }),
    ];
    const texto = "10/09/2026\t02.02\t10";
    const resultado = lerColagem(texto, servicos, "texto");
    expect(resultado.linhas).toEqual([]);
    expect(resultado.erros).toEqual([
      { linha: 1, erro: "Código repetido na planilha: lance esta linha pelo formulário" },
    ]);
  });

  it("data sem nenhuma medição aberta que a contenha vira erro da linha", () => {
    const texto = "01/01/2026\t02.02\t10";
    const resultado = lerColagem(texto, [servico()], "texto");
    expect(resultado.linhas).toEqual([]);
    expect(resultado.erros).toEqual([{ linha: 1, erro: expect.stringContaining("medição") }]);
  });

  it("linha em branco no meio do bloco é ignorada (não conta como linha nem como erro)", () => {
    const texto = "10/09/2026\t02.02\t10\n\n12/09/2026\t02.02\t12";
    const resultado = lerColagem(texto, [servico()], "texto");
    expect(resultado.erros).toEqual([]);
    expect(resultado.linhas).toHaveLength(2);
    // A numeração da 2ª linha válida pula a linha 2 (em branco): é a 3ª linha do bloco colado.
    expect(resultado.linhas[1].linha).toBe(3);
  });

  it("tabulação sobrando no fim da linha não atrapalha a leitura", () => {
    const texto = "10/09/2026\t02.02\t10\t\t\t\t\t\t\t";
    const resultado = lerColagem(texto, [servico()], "texto");
    expect(resultado.erros).toEqual([]);
    expect(resultado.linhas).toHaveLength(1);
  });

  it("mais de 500 linhas: um erro geral, nada é lido linha a linha", () => {
    const linha = "10/09/2026\t02.02\t10";
    const texto = Array.from({ length: MAX_LINHAS_COLAGEM + 1 }, () => linha).join("\n");
    const resultado = lerColagem(texto, [servico()], "texto");
    expect(resultado.linhas).toEqual([]);
    expect(resultado.erros).toHaveLength(1);
    expect(resultado.erros[0].erro).toContain("500");
  });

  it("bloco vazio: nenhuma linha, nenhum erro", () => {
    const resultado = lerColagem("", [servico()], "texto");
    expect(resultado).toEqual({ linhas: [], erros: [] });
  });

  it("numera as linhas na posição real do texto colado (para casar com o erro que a RPC devolver)", () => {
    const texto = "10/09/2026\t02.02\t10\n10/09/2026\t99.99\t5\n10/09/2026\t02.02\t7";
    const resultado = lerColagem(texto, [servico()], "texto");
    expect(resultado.erros).toEqual([{ linha: 2, erro: expect.stringContaining("99.99") }]);
    expect(resultado.linhas.map((l) => l.linha)).toEqual([1, 3]);
  });
});
