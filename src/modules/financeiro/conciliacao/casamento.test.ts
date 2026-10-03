import { describe, expect, it } from "vitest";

import {
  casarAutomaticamente,
  nomeConfere,
  palavrasEmComum,
  pareceAplicacaoAutomatica,
  sugerirParaMovimento,
  sugestoesSeguras,
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
    ).toBe(3); // JOSE e SILVA são nomes comuns: meia palavra cada
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

  it("nunca casa sozinho dois PIX sem nome disputando duas parcelas de mesmo valor", () => {
    const pares = casarAutomaticamente(
      [
        mov("m1", -160, "PIX - ENVIADO - 01/09 19:23 FULANO"),
        mov("m2", -160, "PIX - ENVIADO - 01/09 19:24 BELTRANO"),
      ],
      [parcela("p1", 160, "Ciclano"), parcela("p2", 160, "Outro")],
    );
    expect(pares).toEqual([]);
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

describe("casarAutomaticamente: só com certeza (Bloco A)", () => {
  const pix = (id: string, memo: string, data = "2026-09-15") => mov(id, -500, memo, data);

  it("1. dois movimentos de R$ 500,00 no mesmo dia, um candidato, nenhum nome: zero pares", () => {
    const pares = casarAutomaticamente(
      [pix("m1", "PIX - ENVIADO - 15/09 10:00 FULANO"), pix("m2", "PIX - ENVIADO - 15/09 11:00 BELTRANO")],
      [parcela("p1", 500, "Ciclano da Silva", "2026-09-15")],
    );
    expect(pares).toEqual([]);
  });

  it("2. mesmo cenário com o nome do fornecedor num dos históricos: casa só esse, sem conferir", () => {
    const pares = casarAutomaticamente(
      [pix("m1", "PIX - ENVIADO - 15/09 10:00 FULANO"), pix("m2", "PIX - ENVIADO - 15/09 11:00 CICLANO DA SILVA")],
      [parcela("p1", 500, "Ciclano da Silva", "2026-09-15")],
    );
    expect(pares).toEqual([
      expect.objectContaining({ transacaoId: "m2", alvoId: "p1", nomeBate: true, confira: false }),
    ]);
  });

  it("3. um movimento, dois candidatos de mesmo valor, nenhum nome: zero pares", () => {
    const pares = casarAutomaticamente(
      [pix("m1", "PIX - ENVIADO - 15/09 10:00 FULANO")],
      [parcela("p1", 500, "Ciclano", "2026-09-15"), parcela("p2", 500, "Beltrano", "2026-09-15")],
    );
    expect(pares).toEqual([]);
  });

  it("4. um movimento, um candidato, sem nome, valor único nos dois lados: casa para conferir", () => {
    const pares = casarAutomaticamente(
      [pix("m1", "PAGAMENTO DE BOLETO - FORTBRAS AUTOPECAS S.A.")],
      [parcela("p1", 500, "RONDOBRAS", "2026-09-15")],
    );
    expect(pares).toEqual([
      expect.objectContaining({ transacaoId: "m1", alvoId: "p1", nomeBate: false, confira: true }),
    ]);
  });

  it("5. caso 4 com 2 dias de diferença casa para conferir; com 4 dias não casa", () => {
    const doisDias = casarAutomaticamente(
      [pix("m1", "PAGAMENTO DE BOLETO - FORTBRAS", "2026-09-17")],
      [parcela("p1", 500, "RONDOBRAS", "2026-09-15")],
    );
    expect(doisDias).toEqual([expect.objectContaining({ confira: true, dias: 2 })]);
    const quatroDias = casarAutomaticamente(
      [pix("m1", "PAGAMENTO DE BOLETO - FORTBRAS", "2026-09-19")],
      [parcela("p1", 500, "RONDOBRAS", "2026-09-15")],
    );
    expect(quatroDias).toEqual([]);
  });

  it("6. transferência e parcela de mesmo valor no mesmo dia, sem nome: zero pares", () => {
    const pares = casarAutomaticamente(
      [pix("m1", "TED TRANSF.ELETR.DISPONIV - 104 0803 FULANO")],
      [
        parcela("p1", 500, "Ciclano", "2026-09-15"),
        {
          especie: "transferencia",
          grupo: "transferencia",
          id: "t1",
          valor: 500,
          data: "2026-09-15",
          sentido: "debito",
          nomes: ["BB 102.124-9 para Caixa"],
        },
      ],
    );
    expect(pares).toEqual([]);
  });

  it("dois movimentos com o mesmo nome para uma parcela só: ninguém casa sozinho", () => {
    const pares = casarAutomaticamente(
      [pix("m1", "PIX - ENVIADO - 15/09 10:00 CICLANO DA SILVA"), pix("m2", "PIX - ENVIADO - 15/09 10:05 CICLANO DA SILVA")],
      [parcela("p1", 500, "Ciclano da Silva", "2026-09-15")],
    );
    expect(pares).toEqual([]);
  });
});

describe("sugestoesSeguras (Bloco E)", () => {
  const pix = (id: string, memo: string) => mov(id, -500, memo, "2026-09-15");
  const outra = (id: string, nome: string) => parcela(id, 500, nome, "2026-09-15", "paga_outra_conta");
  const aberta = (id: string, nome: string, podeBaixar = true) => ({
    ...parcela(id, 500, nome, "2026-09-15", "aberta"),
    podeBaixar,
  });

  it("nome único, valor exato, paga em outra conta: segura", () => {
    const r = sugestoesSeguras([pix("m1", "PIX - ENVIADO - CICLANO DA SILVA")], [outra("p1", "Ciclano da Silva")]);
    expect(r.map((s) => [s.movimento.id, s.candidato.id])).toEqual([["m1", "p1"]]);
  });

  it("sem nome nunca é segura", () => {
    expect(sugestoesSeguras([pix("m1", "PIX - ENVIADO - FULANO")], [outra("p1", "Ciclano")])).toEqual([]);
  });

  it("dois candidatos com nome nunca é segura", () => {
    expect(
      sugestoesSeguras(
        [pix("m1", "PIX - ENVIADO - CICLANO DA SILVA")],
        [outra("p1", "Ciclano da Silva"), aberta("p2", "Ciclano da Silva")],
      ),
    ).toEqual([]);
  });

  it("candidato disputado por dois movimentos nunca é seguro", () => {
    expect(
      sugestoesSeguras(
        [pix("m1", "PIX - ENVIADO - CICLANO DA SILVA"), pix("m2", "PIX - ENVIADO - CICLANO DA SILVA")],
        [outra("p1", "Ciclano da Silva")],
      ),
    ).toEqual([]);
  });

  it("valor diferente não é segura, nem paga nesta conta (o automático trata)", () => {
    expect(
      sugestoesSeguras([mov("m1", -500.01, "PIX CICLANO DA SILVA")], [outra("p1", "Ciclano da Silva")]),
    ).toEqual([]);
    expect(
      sugestoesSeguras([pix("m1", "PIX CICLANO DA SILVA")], [parcela("p1", 500, "Ciclano da Silva", "2026-09-15")]),
    ).toEqual([]);
  });

  it("parcela a pagar em aberto sem aprovação fica de fora", () => {
    expect(sugestoesSeguras([pix("m1", "PIX CICLANO DA SILVA")], [aberta("p1", "Ciclano da Silva", false)])).toEqual([]);
    expect(sugestoesSeguras([pix("m1", "PIX CICLANO DA SILVA")], [aberta("p1", "Ciclano da Silva")])).toHaveLength(1);
  });
});

describe("nome comum não identifica sozinho", () => {
  const memo = "PIX - ENVIADO - 02/05 16:05 EDILSON FRANCA DA SILVA";

  it("só o SILVA não confere; nome e sobrenome do favorecido conferem", () => {
    expect(nomeConfere(memo, ["ANTONIO DA SILVA SOUZA - SANTIM"])).toBe(false);
    expect(nomeConfere(memo, ["EDILSON FRANÇA SILVA"])).toBe(true);
    expect(palavrasEmComum(memo, ["EDILSON FRANÇA SILVA"])).toBe(2.5);
  });

  it("caso real de 02/05/2025: casa sozinho com o Edilson, não com o Antonio", () => {
    const pares = casarAutomaticamente(
      [mov("m1", -1518, memo, "2025-05-02")],
      [
        parcela("antonio", 1518, "ANTONIO DA SILVA SOUZA - SANTIM", "2025-05-02"),
        parcela("edilson", 1518, "EDILSON FRANÇA SILVA", "2025-05-02"),
      ],
    );
    expect(pares).toEqual([expect.objectContaining({ alvoId: "edilson", nomeBate: true, confira: false })]);
  });

  it("dois nomes comuns juntos conferem (JOSE + SILVA)", () => {
    expect(nomeConfere("PIX JOSE DA SILVA", ["Jose Silva Construcoes"])).toBe(true);
  });
});
