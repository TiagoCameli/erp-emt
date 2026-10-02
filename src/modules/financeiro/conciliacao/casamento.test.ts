import { describe, expect, it } from "vitest";

import {
  casarAutomaticamente,
  palavrasEmComum,
  pareceAplicacaoAutomatica,
  sugerirParaMovimento,
  type CandidatoCasavel,
  type MovimentoCasavel,
} from "./casamento";

// Históricos reais do extrato do BB 102.124-9 de 09/2026.
function mov(
  id: string,
  valor: number,
  memo: string,
  dataMovimento = "2026-09-01",
): MovimentoCasavel {
  return { id, valor, memo, dataMovimento };
}

function parcela(
  id: string,
  valor: number,
  nome: string,
  data = "2026-09-01",
  grupo: CandidatoCasavel["grupo"] = "paga_na_conta",
  sentido: CandidatoCasavel["sentido"] = "debito",
): CandidatoCasavel {
  return { especie: "parcela", grupo, id, valor, data, sentido, nomes: [nome] };
}

describe("palavrasEmComum", () => {
  it("acha o favorecido no histórico do PIX, com o nome cortado pelo banco", () => {
    expect(
      palavrasEmComum("PIX - ENVIADO - 01/09 19:22 JOSE AUGUSTO DA SILVA PRA", [
        "José Augusto da Silva Prado",
      ]),
    ).toBe(4);
  });

  it("não conta palavra de histórico e de razão social que não identifica ninguém", () => {
    expect(
      palavrasEmComum("PAGAMENTO DE BOLETO - EMAM LOGISTICA LTDA", [
        "MS REVEST TRANSPORTES LTDA",
      ]),
    ).toBe(0);
  });
});

describe("casarAutomaticamente", () => {
  it("casa valor exato no mesmo dia", () => {
    const pares = casarAutomaticamente(
      [mov("m1", -5311.14, "PAGAMENTO DE BOLETO - EMAM LOGISTICA LTDA")],
      [parcela("p1", 5311.14, "EMAM LOGISTICA")],
    );
    expect(pares).toEqual([
      expect.objectContaining({ transacaoId: "m1", alvoId: "p1", nomeBate: true, confira: false }),
    ]);
  });

  it("desempata dois PIX de mesmo valor e mesmo dia pelo nome", () => {
    const pares = casarAutomaticamente(
      [
        mov("m1", -1499.43, "PIX - ENVIADO - 30/09 13:15 CLELTON PEREIRA DE OLIVEI"),
        mov("m2", -1499.43, "PIX - ENVIADO - 30/09 13:17 MARIA RAIMUNDA MIRANDA DE"),
      ],
      [
        parcela("maria", 1499.43, "Maria Raimunda Miranda de Souza"),
        parcela("clelton", 1499.43, "Clelton Pereira de Oliveira"),
      ],
    );
    const porMovimento = Object.fromEntries(pares.map((p) => [p.transacaoId, p.alvoId]));
    expect(porMovimento).toEqual({ m1: "clelton", m2: "maria" });
  });

  it("prefere o nome que bate a uma data mais próxima", () => {
    const pares = casarAutomaticamente(
      [mov("m1", -450, "PIX - ENVIADO - 01/09 18:21 POSTO DE MOLAS JABA")],
      [
        parcela("outro", 450, "Nereu Souza Chaves", "2026-09-01"),
        parcela("posto", 450, "Posto de Molas Jaba", "2026-09-02"),
      ],
    );
    expect(pares[0]?.alvoId).toBe("posto");
  });

  it("não casa centavo de diferença, sentido trocado, fora da janela nem parcela que muda de conta", () => {
    const pares = casarAutomaticamente(
      [
        mov("centavo", -1716.67, "PAGAMENTO DE BOLETO - AMAZONIA PNEUS LTDA"),
        mov("credito", 2610, "TRANSFERENCIA RECEBIDA"),
        mov("longe", -330, "PIX - ENVIADO - NEREU SOUZA CHAVES", "2026-09-10"),
        mov("outra", -580, "PIX - ENVIADO - JOSE AUGUSTO"),
      ],
      [
        parcela("p1", 1716.66, "AMAZONIA PNEUS"),
        parcela("p2", 2610, "JULIO CESAR"),
        parcela("p3", 330, "NEREU SOUZA CHAVES", "2026-09-01"),
        parcela("p4", 580, "JOSE AUGUSTO", "2026-09-01", "paga_outra_conta"),
        parcela("p5", 580, "JOSE AUGUSTO", "2026-09-01", "aberta"),
      ],
    );
    expect(pares).toEqual([]);
  });

  it("usa cada parcela uma vez só e marca para conferir quando o nome não confirma", () => {
    const pares = casarAutomaticamente(
      [
        mov("m1", -160, "PIX - ENVIADO - 01/09 19:23 FULANO"),
        mov("m2", -160, "PIX - ENVIADO - 01/09 19:24 BELTRANO"),
      ],
      [parcela("p1", 160, "Ciclano"), parcela("p2", 160, "Outro")],
    );
    expect(new Set(pares.map((p) => p.alvoId)).size).toBe(2);
    expect(pares.every((p) => p.confira)).toBe(true);
  });

  it("casa transferência pelo lado certo", () => {
    const pares = casarAutomaticamente(
      [mov("m1", 300000, "TRANSFERENCIA RECEBIDA - 02/09 11:21 E M T CONSTRUTORA", "2026-09-02")],
      [
        {
          especie: "transferencia",
          grupo: "transferencia",
          id: "t1",
          valor: 300000,
          data: "2026-09-02",
          sentido: "credito",
          nomes: ["BB 30.893-5 para BB 102.124-9"],
        },
      ],
    );
    expect(pares[0]).toMatchObject({ especie: "transferencia", alvoId: "t1" });
  });
});

describe("sugerirParaMovimento", () => {
  it("oferece a parcela com R$ 0,01 de diferença, depois das exatas", () => {
    const sugestoes = sugerirParaMovimento(
      mov("m1", -1183.21, "PAGAMENTO DE BOLETO - RB TRATOR PECAS LTDA", "2026-09-30"),
      [
        parcela("centavo", 1183.22, "RB TRATOR PECAS", "2026-09-30"),
        parcela("aberta", 1183.21, "RB TRATOR PECAS", "2026-10-05", "aberta"),
        parcela("longe", 1100, "RB TRATOR PECAS", "2026-09-30"),
      ],
    );
    expect(sugestoes.map((s) => s.candidato.id)).toEqual(["aberta", "centavo"]);
    expect(sugestoes[1]?.diferenca).toBe(-0.01);
  });
});

describe("pareceAplicacaoAutomatica", () => {
  it("reconhece o BB Rende Fácil e não confunde PIX para poupança de pessoa", () => {
    expect(pareceAplicacaoAutomatica("BB RENDE FÁCIL - RENDE FACIL")).toBe(true);
    expect(
      pareceAplicacaoAutomatica("TRANSFERIDO PARA POUPANÇA - 30/09 15:35 JORGEAN VARELA DA SILVA"),
    ).toBe(false);
  });
});
