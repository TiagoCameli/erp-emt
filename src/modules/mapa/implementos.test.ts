import { describe, expect, it } from "vitest";

import { paraEstadoMapa } from "@/modules/mapa/dados";
import { implementosDoCard } from "@/modules/mapa/implementos";
import type { ImplementoMapa } from "@/modules/mapa/tipos";

const imp = (
  id: string,
  acopladoEm: string | null,
  descricao = "PLATAFORMA ROLL ON",
): ImplementoMapa => ({ id, codigo: id.toUpperCase(), descricao, acopladoEm });

describe("implementos no card do equipamento", () => {
  const lista = [
    imp("imp-005", "cs6"),
    imp("imp-001", null),
    imp("imp-002", "cs3"),
  ];

  it("mostra os acoplados nele e oferece os outros, marcando o que está em outro equipamento", () => {
    const { acoplados, opcoes } = implementosDoCard(lista, "cs6");
    expect(acoplados.map((i) => i.id)).toEqual(["imp-005"]);
    expect(opcoes).toEqual([
      { valor: "imp-001", rotulo: "IMP-001 · PLATAFORMA ROLL ON" },
      {
        valor: "imp-002",
        rotulo: "IMP-002 · PLATAFORMA ROLL ON (em outro equipamento)",
      },
    ]);
  });

  it("equipamento sem implemento: nenhum acoplado, todos como opção", () => {
    const { acoplados, opcoes } = implementosDoCard(lista, "us1");
    expect(acoplados).toEqual([]);
    expect(opcoes).toHaveLength(3);
  });

  it("lê os implementos da RPC; sem a chave (RPC antiga), lista vazia", () => {
    const base = { equipamentos: [], trechos: [], config: {} };
    const estado = paraEstadoMapa({
      ...base,
      implementos: [
        {
          id: "i5",
          codigo: "IMP-005",
          descricao: "PLATAFORMA ROLL ON - ROLL OFF 6.50 M",
          acoplado_em: "cs6",
        },
        {
          id: "i1",
          codigo: "IMP-001",
          descricao: "Semi-reboque",
          acoplado_em: null,
        },
      ],
    });
    expect(estado?.implementos).toEqual([
      {
        id: "i5",
        codigo: "IMP-005",
        descricao: "PLATAFORMA ROLL ON - ROLL OFF 6.50 M",
        acopladoEm: "cs6",
      },
      {
        id: "i1",
        codigo: "IMP-001",
        descricao: "Semi-reboque",
        acopladoEm: null,
      },
    ]);
    expect(paraEstadoMapa(base)?.implementos).toEqual([]);
  });
});
