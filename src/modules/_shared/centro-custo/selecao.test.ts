import { describe, expect, it } from "vitest";

import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import {
  etapasDaRaiz,
  raizes,
  resolverSelecao,
  rotuloCentro,
  rotuloDaEtapa,
  subarvoreDeCentro,
  valorAoEscolherEtapa,
  valorAoEscolherRaiz,
} from "@/modules/_shared/centro-custo/selecao";

/** Um recorte do cadastro real: duas obras sem etapa e a manutenção com duas. */
const CENTROS: CentroCustoOpcao[] = [
  { id: "obra-9", nome: "009 - Manutenção da Rodovia BR-364/AC", codigo: null, paiId: null, tipo: "obra" },
  { id: "obra-11", nome: "011 - CONSTRUÇÃO", codigo: null, paiId: null, tipo: "obra" },
  { id: "escritorio", nome: "Escritório Central", codigo: null, paiId: null, tipo: "escritorio" },
  { id: "manut", nome: "Manutenção/Documentação de Equipamentos", codigo: null, paiId: null, tipo: "manutencao" },
  { id: "bobcat", nome: "Bobcat MC110C - 01", codigo: null, paiId: "manut", tipo: null },
  { id: "cacamba", nome: "Caminhão Caçamba 2", codigo: null, paiId: "manut", tipo: null },
  { id: "emprestimos", nome: "Empréstimos", codigo: null, paiId: null, tipo: "financeiro" },
  { id: "bb-giro", nome: "BB - Capital de giro", codigo: null, paiId: "emprestimos", tipo: null },
];

describe("resolverSelecao", () => {
  it("id vazio deixa os dois campos vazios", () => {
    expect(resolverSelecao(CENTROS, "")).toEqual({ raizId: "", etapaId: "" });
  });

  it("id de raiz vai para o primeiro campo, sem etapa", () => {
    expect(resolverSelecao(CENTROS, "manut")).toEqual({
      raizId: "manut",
      etapaId: "",
    });
  });

  it("id de etapa preenche os DOIS campos, com a raiz vinda do pai", () => {
    expect(resolverSelecao(CENTROS, "bobcat")).toEqual({
      raizId: "manut",
      etapaId: "bobcat",
    });
  });

  it("id fora da lista continua no primeiro campo, em vez de sumir", () => {
    // Centro inativado depois do documento existir. Blanquear aqui trocaria o
    // centro do documento em silêncio no primeiro salvamento.
    expect(resolverSelecao(CENTROS, "centro-inativo")).toEqual({
      raizId: "centro-inativo",
      etapaId: "",
    });
  });
});

describe("raizes e etapas", () => {
  it("raizes traz só quem não tem pai, na ordem recebida", () => {
    expect(raizes(CENTROS).map((c) => c.id)).toEqual([
      "obra-9",
      "obra-11",
      "escritorio",
      "manut",
      "emprestimos",
    ]);
  });

  it("etapas da manutenção são os equipamentos dela", () => {
    expect(etapasDaRaiz(CENTROS, "manut").map((c) => c.id)).toEqual([
      "bobcat",
      "cacamba",
    ]);
  });

  it("obra sem etapa devolve lista vazia, e é o que esconde o segundo campo", () => {
    expect(etapasDaRaiz(CENTROS, "obra-9")).toEqual([]);
  });

  it("raiz vazia devolve lista vazia sem varrer o cadastro", () => {
    expect(etapasDaRaiz(CENTROS, "")).toEqual([]);
  });
});

describe("rotuloDaEtapa", () => {
  it("manutenção chama de Equipamento", () => {
    expect(rotuloDaEtapa(CENTROS, "manut")).toBe("Equipamento");
  });

  it("obra chama de Etapa", () => {
    expect(rotuloDaEtapa(CENTROS, "obra-9")).toBe("Etapa");
  });

  /**
   * O centro de Empréstimos tem o mesmo desenho do de manutenção: a raiz é o
   * grupo e cada CONTRATO é uma linha de nível 2. Quem vai lançar a parcela
   * procura "Empréstimo" na tela, não "Etapa".
   */
  it("financeiro chama de Empréstimo", () => {
    expect(rotuloDaEtapa(CENTROS, "emprestimos")).toBe("Empréstimo");
  });

  it("escritório continua chamando de Etapa", () => {
    expect(rotuloDaEtapa(CENTROS, "escritorio")).toBe("Etapa");
  });

  it("raiz desconhecida também chama de Etapa, sem quebrar", () => {
    expect(rotuloDaEtapa(CENTROS, "nao-existe")).toBe("Etapa");
  });
});

describe("as etapas do centro de Empréstimos", () => {
  it("o contrato aparece como etapa da raiz financeira", () => {
    expect(etapasDaRaiz(CENTROS, "emprestimos").map((c) => c.id)).toEqual([
      "bb-giro",
    ]);
  });

  it("escolher o contrato preenche os dois campos", () => {
    expect(resolverSelecao(CENTROS, "bb-giro")).toEqual({
      raizId: "emprestimos",
      etapaId: "bb-giro",
    });
  });
});

describe("o que grava a cada troca", () => {
  it("escolher a raiz grava a raiz e descarta a etapa anterior", () => {
    expect(valorAoEscolherRaiz("obra-11")).toBe("obra-11");
  });

  it("escolher a etapa grava a etapa", () => {
    expect(valorAoEscolherEtapa("manut", "bobcat")).toBe("bobcat");
  });

  it("ESVAZIAR a etapa devolve para a raiz, não para vazio", () => {
    // É a regra do "equipamento é opcional": limpar o detalhe não pode invalidar
    // o formulário, porque quem limpa entende que está tirando o detalhe.
    expect(valorAoEscolherEtapa("manut", "")).toBe("manut");
  });

  it("esvaziar a etapa sem raiz nenhuma continua vazio", () => {
    expect(valorAoEscolherEtapa("", "")).toBe("");
  });
});

describe("rotuloCentro", () => {
  it("junta código e nome quando há código", () => {
    expect(
      rotuloCentro({ id: "x", nome: "Galpão", codigo: "004", paiId: null, tipo: "obra" }),
    ).toBe("004 Galpão");
  });

  it("sem código mostra só o nome, sem espaço sobrando", () => {
    expect(rotuloCentro(CENTROS[3])).toBe(
      "Manutenção/Documentação de Equipamentos",
    );
  });
});

describe("ida e volta", () => {
  it("gravar e reabrir devolve os mesmos dois campos", () => {
    // A prova que interessa: o par que a tela mostra tem que sobreviver a um
    // salvamento. Sem isto, reabrir o documento poderia cair na raiz e o custo
    // do equipamento viraria custo de manutenção geral, calado.
    for (const [raiz, etapa] of [
      ["manut", "bobcat"],
      ["manut", ""],
      ["obra-9", ""],
    ] as const) {
      const gravado = valorAoEscolherEtapa(raiz, etapa);
      expect(resolverSelecao(CENTROS, gravado)).toEqual({
        raizId: raiz,
        etapaId: etapa,
      });
    }
  });
});

describe("subarvoreDeCentro", () => {
  it("traz a raiz e as etapas dela", () => {
    expect([...subarvoreDeCentro(CENTROS, "manut")].sort()).toEqual(
      ["bobcat", "cacamba", "manut"].sort(),
    );
  });

  it("raiz sem etapa devolve so ela mesma", () => {
    expect([...subarvoreDeCentro(CENTROS, "obra-9")]).toEqual(["obra-9"]);
  });

  it("partindo de uma ETAPA devolve so a etapa, nao os irmaos", () => {
    // Filtrar por um equipamento e filtrar aquele equipamento. Subir para o pai
    // aqui traria as parcelas dos outros 60.
    expect([...subarvoreDeCentro(CENTROS, "bobcat")]).toEqual(["bobcat"]);
  });

  it("raiz vazia devolve conjunto vazio", () => {
    expect(subarvoreDeCentro(CENTROS, "").size).toBe(0);
  });

  it("id que nao existe devolve so ele, sem varrer a arvore", () => {
    expect([...subarvoreDeCentro(CENTROS, "fantasma")]).toEqual(["fantasma"]);
  });

  it("desce mais de um nivel", () => {
    // A arvore de hoje tem 3 niveis (obra > etapa > item). O laco por nivel
    // garante que o terceiro entra sem ninguem mexer nesta funcao.
    const comNeto = [
      ...CENTROS,
      { id: "item-1", nome: "Item", codigo: null, paiId: "bobcat", tipo: null },
    ];
    expect(subarvoreDeCentro(comNeto, "manut").has("item-1")).toBe(true);
  });
});
