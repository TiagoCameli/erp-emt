/**
 * Exclusão de OC em lote: quem entra, quem fica de fora, e o que o usuário lê.
 *
 * A regra que estes testes travam é a do AVISO: ação em massa que só diz "pronto"
 * esconde justamente o que importa — que 2 das 13 ficaram de fora, e por quê. É a
 * mesma disciplina do resumo de lote de Lançamentos (`lote.ts`).
 */
import { describe, expect, it } from "vitest";

import {
  MAX_EXCLUSAO_LOTE,
  separarParaExclusao,
  textoPuladas,
  textoResumoExclusao,
} from "@/modules/compras/ordens/exclusao-lote";

function oc(numero: string, status: string) {
  return { id: `id-${numero}`, numero, status };
}

describe("separarParaExclusao", () => {
  it("aceita rascunho, cancelada e rejeitada", () => {
    const { elegiveis, puladas } = separarParaExclusao([
      oc("OC-1", "rascunho"),
      oc("OC-2", "cancelado"),
      oc("OC-3", "rejeitado"),
    ]);
    expect(elegiveis.map((o) => o.numero)).toEqual(["OC-1", "OC-2", "OC-3"]);
    expect(puladas).toEqual([]);
  });

  it("deixa de fora o que ainda vive, e conta por status", () => {
    const { elegiveis, puladas } = separarParaExclusao([
      oc("OC-1", "rascunho"),
      oc("OC-2", "aprovado"),
      oc("OC-3", "pendente_aprovacao"),
      oc("OC-4", "recebido"),
      oc("OC-5", "pago"),
    ]);
    expect(elegiveis.map((o) => o.numero)).toEqual(["OC-1"]);
    expect(puladas).toEqual([
      { status: "pendente_aprovacao", rotulo: "Pendente de aprovação", quantidade: 1 },
      { status: "aprovado", rotulo: "Aprovada", quantidade: 1 },
      { status: "recebido", rotulo: "Recebida", quantidade: 1 },
      { status: "pago", rotulo: "Paga", quantidade: 1 },
    ]);
  });

  it("agrupa as puladas do mesmo status", () => {
    const { puladas } = separarParaExclusao([
      oc("OC-1", "aprovado"),
      oc("OC-2", "aprovado"),
      oc("OC-3", "aprovado"),
    ]);
    expect(puladas).toEqual([
      { status: "aprovado", rotulo: "Aprovada", quantidade: 3 },
    ]);
  });

  it("status desconhecido do banco NÃO é elegível", () => {
    // Fallback seguro: status novo que ninguém mapeou não pode virar exclusão
    // definitiva por descuido.
    const { elegiveis, puladas } = separarParaExclusao([
      oc("OC-1", "status_que_nao_existe"),
    ]);
    expect(elegiveis).toEqual([]);
    expect(puladas[0]?.quantidade).toBe(1);
  });

  it("lista vazia não estoura", () => {
    expect(separarParaExclusao([])).toEqual({ elegiveis: [], puladas: [] });
  });
});

describe("textoPuladas", () => {
  it("sem puladas, não diz nada", () => {
    expect(textoPuladas([])).toBe("");
  });

  it("uma pulada, no singular", () => {
    expect(
      textoPuladas([
        { status: "aprovado", rotulo: "Aprovada", quantidade: 1 },
      ]),
    ).toBe("1 marcada não pode ser excluída (1 aprovada) e será pulada.");
  });

  it("várias puladas, com a conta por status", () => {
    expect(
      textoPuladas([
        { status: "aprovado", rotulo: "Aprovada", quantidade: 2 },
        { status: "recebido", rotulo: "Recebida", quantidade: 1 },
      ]),
    ).toBe(
      "3 marcadas não podem ser excluídas (2 aprovadas, 1 recebida) e serão puladas.",
    );
  });
});

describe("textoResumoExclusao", () => {
  it("caso limpo: só o que foi feito", () => {
    expect(
      textoResumoExclusao({
        excluidas: 13,
        puladasPorStatus: [],
        recusadas: [],
        naoEncontradas: 0,
      }),
    ).toBe("13 ordens de compra excluídas");
  });

  it("uma só, no singular", () => {
    expect(
      textoResumoExclusao({
        excluidas: 1,
        puladasPorStatus: [],
        recusadas: [],
        naoEncontradas: 0,
      }),
    ).toBe("1 ordem de compra excluída");
  });

  it("diz o que NÃO foi feito, com o motivo de cada recusa", () => {
    const texto = textoResumoExclusao({
      excluidas: 11,
      puladasPorStatus: [
        { status: "aprovado", rotulo: "Aprovada", quantidade: 2 },
      ],
      recusadas: [
        { numero: "OC-2026-0007", motivo: "já tem recebimento registrado" },
      ],
      naoEncontradas: 0,
    });
    expect(texto).toContain("11 ordens de compra excluídas");
    expect(texto).toContain("2 aprovadas");
    expect(texto).toContain("OC-2026-0007");
    expect(texto).toContain("já tem recebimento registrado");
  });

  it("nada excluído é dito de frente, não escondido", () => {
    const texto = textoResumoExclusao({
      excluidas: 0,
      puladasPorStatus: [
        { status: "aprovado", rotulo: "Aprovada", quantidade: 3 },
      ],
      recusadas: [],
      naoEncontradas: 0,
    });
    expect(texto).toContain("Nenhuma ordem de compra excluída");
  });

  it("lista velha na tela aparece como aviso próprio", () => {
    // O id foi marcado, outra pessoa apagou, e a tela ainda mostrava a linha.
    const texto = textoResumoExclusao({
      excluidas: 2,
      puladasPorStatus: [],
      recusadas: [],
      naoEncontradas: 1,
    });
    expect(texto).toContain("1 não foi encontrada");
    expect(texto).toContain("recarregue");
  });
});

describe("MAX_EXCLUSAO_LOTE", () => {
  it("existe e é um teto de dois dígitos", () => {
    // O caso real do dono foram 13 OCs. O teto existe para a ação em massa não
    // virar um laço de mil chamadas sem ninguém perceber.
    expect(MAX_EXCLUSAO_LOTE).toBe(50);
  });
});
