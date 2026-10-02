import { describe, expect, it } from "vitest";

import { montarArvoreBoletim } from "@/modules/medicao/boletim/arvore";
import type { LinhaBoletim } from "@/modules/medicao/boletim/tipos";

function linha(id: string, ordem: number, codigo: string, pai_id: string | null, extra: Partial<LinhaBoletim> = {}): LinhaBoletim {
  return {
    id, ordem, codigo, pai_id, nivel: codigo.split(".").length, descricao: `Linha ${codigo}`, unidade: null,
    tipo: "servico", item_id: `item-${id}`, preco_unitario: null, quantidade_prevista: null, qtds: {},
    previsto: null, valor_medicao: null, acumulado: null, saldo: null, pct_executado: null, pct_a_medir: null,
    reajuste_medicao: null, reajuste_acumulado: null,
    ...extra,
  };
}

/** Só os códigos, na forma aninhada, para comparar a árvore inteira de uma vez. */
function codigos(nos: ReturnType<typeof montarArvoreBoletim>): unknown[] {
  return nos.map((n) => (n.filhos.length ? { [n.codigo]: codigos(n.filhos) } : n.codigo));
}

describe("montarArvoreBoletim", () => {
  it("monta 3 níveis por pai_id, na ordem de `ordem`", () => {
    const arvore = montarArvoreBoletim([
      linha("a", 1, "01", null, { tipo: "titulo" }),
      linha("b", 2, "01.01", "a"),
      linha("c", 3, "01.02", "a"),
      linha("d", 4, "01.02.01", "c"),
      linha("e", 5, "02", null, { tipo: "titulo" }),
    ]);
    expect(codigos(arvore)).toEqual([{ "01": ["01.01", { "01.02": ["01.02.01"] }] }, "02"]);
  });

  it("código repetido (02.01 duas vezes) vira dois irmãos, cada um no seu lugar", () => {
    const arvore = montarArvoreBoletim([
      linha("t", 1, "02", null, { tipo: "titulo" }),
      linha("x", 2, "02.01", "t", { descricao: "Primeiro" }),
      linha("y", 3, "02.01", "t", { descricao: "Segundo" }),
    ]);
    expect(arvore[0].filhos.map((f) => [f.id, f.descricao])).toEqual([
      ["x", "Primeiro"],
      ["y", "Segundo"],
    ]);
  });

  it("preserva a ordem pelo campo `ordem`, mesmo com a lista fora de ordem", () => {
    const arvore = montarArvoreBoletim([
      linha("e", 5, "02", null),
      linha("c", 3, "01.02", "a"),
      linha("a", 1, "01", null),
      linha("b", 2, "01.01", "a"),
    ]);
    expect(codigos(arvore)).toEqual([{ "01": ["01.01", "01.02"] }, "02"]);
  });

  it("pai que não está na lista vira raiz, na posição da própria ordem", () => {
    const arvore = montarArvoreBoletim([
      linha("a", 1, "01", null),
      linha("o", 2, "09.01", "nao-existe"),
      linha("b", 3, "02", null),
    ]);
    expect(codigos(arvore)).toEqual(["01", "09.01", "02"]);
  });

  it("não mexe em número nenhum: o texto de cada campo sai igual ao que entrou", () => {
    const original = linha("a", 1, "01.01", null, {
      preco_unitario: "102.34700000000001", quantidade_prevista: "3", qtds: { "1": "1.5" },
      previsto: "1.01", valor_medicao: "0.50", acumulado: "1.01", saldo: "0.00", pct_executado: "1.00000000000000000000",
    });
    const [no] = montarArvoreBoletim([original]);
    const { filhos, ...resto } = no;
    expect(filhos).toEqual([]);
    expect(resto).toEqual(original);
  });
});
