import { describe, expect, it } from "vitest";

import { formatarBRL } from "@/lib/formatadores";
import { eventoRateioParaTrilha, linhasDoRateio } from "./rateio-eventos";

const CAVALO_03 = "11111111-1111-4111-8111-111111111111";
const CAVALO_04 = "22222222-2222-4222-8222-222222222222";
const CAVALO_05 = "33333333-3333-4333-8333-333333333333";

const NOMES = new Map([
  [CAVALO_03, "Caminhão Cavalo XF 530 FTT SQU9C94 - 03"],
  [CAVALO_04, "Caminhão Cavalo XF 530 FTT SQU9D04 - 04"],
  [CAVALO_05, "Caminhão Cavalo XF 530 FTT SQU9D14 - 05"],
]);

describe("linhasDoRateio", () => {
  it("lê o jsonb gravado pela função do banco", () => {
    expect(
      linhasDoRateio([
        { centro_custo_id: CAVALO_03, valor: 60 },
        { centro_custo_id: CAVALO_04, valor: 40 },
      ]),
    ).toEqual([
      { centroCustoId: CAVALO_03, valor: 60 },
      { centroCustoId: CAVALO_04, valor: 40 },
    ]);
  });

  it("aceita valor em texto, que é como o numeric às vezes chega do jsonb", () => {
    expect(linhasDoRateio([{ centro_custo_id: CAVALO_03, valor: "32454.08" }])).toEqual([
      { centroCustoId: CAVALO_03, valor: 32454.08 },
    ]);
  });

  it("devolve lista vazia para jsonb que não é lista, em vez de quebrar a trilha", () => {
    // A coluna é jsonb: nada no tipo impede uma linha antiga ou torta de chegar
    // aqui, e uma trilha que estoura esconde TODOS os eventos, não só o torto.
    expect(linhasDoRateio(null)).toEqual([]);
    expect(linhasDoRateio({ centro_custo_id: CAVALO_03 })).toEqual([]);
    expect(linhasDoRateio([{ valor: 10 }])).toEqual([]);
  });
});

describe("eventoRateioParaTrilha", () => {
  const base = {
    id: "evt-1",
    motivo: "Apólice passou a cobrir três carretas",
    criadoEm: "2026-09-01T18:29:00.000Z",
    usuarioNome: "Dora Silva",
  };

  it("conta quem mudou de valor, quem entrou e quem saiu", () => {
    const evento = eventoRateioParaTrilha(
      {
        ...base,
        antes: [
          { centro_custo_id: CAVALO_03, valor: 60 },
          { centro_custo_id: CAVALO_04, valor: 40 },
        ],
        depois: [
          { centro_custo_id: CAVALO_03, valor: 70 },
          { centro_custo_id: CAVALO_05, valor: 30 },
        ],
      },
      NOMES,
    );

    expect(evento.titulo).toBe("Rateio por centro de custo alterado");
    expect(evento.tipo).toBe("edicao");
    expect(evento.usuario).toBe("Dora Silva");
    expect(evento.descricao).toBe(
      `Apólice passou a cobrir três carretas · ${NOMES.get(CAVALO_03)}: de ${formatarBRL(60)} para ${formatarBRL(70)} · ${NOMES.get(CAVALO_05)}: entrou com ${formatarBRL(30)} · ${NOMES.get(CAVALO_04)}: saiu (${formatarBRL(40)})`,
    );
  });

  it("nomeia o centro que não está no mapa em vez de mostrar o uuid cru", () => {
    const evento = eventoRateioParaTrilha(
      {
        ...base,
        antes: [{ centro_custo_id: "99999999-9999-4999-8999-999999999999", valor: 10 }],
        depois: [{ centro_custo_id: CAVALO_03, valor: 10 }],
      },
      NOMES,
    );
    expect(evento.descricao).toContain("Centro de custo removido");
    expect(evento.descricao).not.toContain("99999999");
  });

  it("mostra só o motivo quando o rateio não mudou de composição", () => {
    const igual = [{ centro_custo_id: CAVALO_03, valor: 100 }];
    const evento = eventoRateioParaTrilha(
      { ...base, antes: igual, depois: igual },
      NOMES,
    );
    expect(evento.descricao).toBe("Apólice passou a cobrir três carretas");
  });
});
