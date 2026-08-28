import { describe, expect, it } from "vitest";

import {
  centroEEtapaDoRateio,
  type CentroNaArvore,
} from "@/modules/financeiro/lancamentos/hierarquia-centro";

/**
 * A árvore real do ERP em 28/08/2026: 17 raízes e 67 etapas, dois níveis. Os
 * nomes abaixo são os do cadastro, incluindo o par que o Tiago usou para
 * apontar o defeito da planilha.
 */
const ARVORE = new Map<string, CentroNaArvore>([
  ["carretas", { nome: "001 - Carretas EMT", paiId: null }],
  ["gama", { nome: "003 - Recuperação do Ramal do Gama", paiId: null }],
  ["squ9c94", {
    nome: "Caminhão Cavalo XF 530 FTT SQU9C94 - 03",
    paiId: "carretas",
  }],
  ["manutencao", {
    nome: "Manutenção/Documentação de Equipamentos",
    paiId: null,
  }],
  ["pc200", { nome: "Escavadeira PC200 - 05", paiId: "manutencao" }],
]);

describe("centroEEtapaDoRateio", () => {
  it("rateio na RAIZ não tem etapa", () => {
    expect(centroEEtapaDoRateio("gama", "ignorado", ARVORE)).toEqual({
      raizNome: "003 - Recuperação do Ramal do Gama",
      etapaNome: null,
    });
  });

  it("rateio em ETAPA devolve o centro de custo e a etapa", () => {
    // O caso que motivou a correção: a etapa estava saindo na coluna do centro.
    expect(centroEEtapaDoRateio("squ9c94", "ignorado", ARVORE)).toEqual({
      raizNome: "001 - Carretas EMT",
      etapaNome: "Caminhão Cavalo XF 530 FTT SQU9C94 - 03",
    });
  });

  it("etapa de outro centro sobe para a raiz dela, não para qualquer uma", () => {
    expect(centroEEtapaDoRateio("pc200", "ignorado", ARVORE)).toEqual({
      raizNome: "Manutenção/Documentação de Equipamentos",
      etapaNome: "Escavadeira PC200 - 05",
    });
  });

  it("centro fora da árvore cai no nome que veio com o rateio", () => {
    // Cadastro apagado no meio da exportação: melhor o nome que temos do que
    // uma célula vazia sem explicação.
    expect(centroEEtapaDoRateio("sumiu", "Escritório Central", ARVORE)).toEqual({
      raizNome: "Escritório Central",
      etapaNome: null,
    });
  });

  it("pai que sumiu do cadastro para no último nível conhecido", () => {
    const orfa = new Map<string, CentroNaArvore>([
      ["etapa", { nome: "Etapa órfã", paiId: "pai-que-nao-existe" }],
    ]);

    expect(centroEEtapaDoRateio("etapa", "ignorado", orfa)).toEqual({
      raizNome: "Etapa órfã",
      etapaNome: "Etapa órfã",
    });
  });

  it("ciclo no cadastro devolve um nome, e NÃO trava a exportação", () => {
    // `pai_id` é auto-referência sem garantia de aciclia. Sem o teto, isto seria
    // um laço infinito: a exportação inteira pendurada, sem erro nenhum no log.
    const ciclo = new Map<string, CentroNaArvore>([
      ["a", { nome: "A", paiId: "b" }],
      ["b", { nome: "B", paiId: "a" }],
    ]);

    const resultado = centroEEtapaDoRateio("a", "ignorado", ciclo);

    expect(resultado.etapaNome).toBe("A");
    expect(["A", "B"]).toContain(resultado.raizNome);
  });
});
