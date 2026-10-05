import { describe, expect, it } from "vitest";

import {
  casarEstornos,
  paresPossiveis,
  pareceEstorno,
} from "@/modules/financeiro/conciliacao/estorno";

const mov = (id: string, valor: number, memo: string, data: string) => ({
  id,
  valor,
  memo,
  dataMovimento: data,
});

describe("pareceEstorno", () => {
  it("reconhece os históricos reais do BB", () => {
    for (const memo of [
      "PIX - REJEITADO - 07/02 12:58 ERRO. TEMPO EXCEDIDO",
      "PIX-ENVIO DEVOLVIDO - 30/04 14:28 JEFERSON FERREIRA DOS SANT",
      "TED DEVOLVIDA - AG OU CNT DEST DO CRED INVAL",
      "BOLETO DEVOLVIDO",
      "ESTORNO DE DÉBITO",
    ]) {
      expect(pareceEstorno(memo)).toBe(true);
    }
    expect(pareceEstorno("PIX - ENVIADO - 07/02 12:57 FULANO")).toBe(false);
    expect(pareceEstorno(null)).toBe(false);
  });
});

describe("casarEstornos", () => {
  it("PIX rejeitado com um envio só: casa", () => {
    const pares = casarEstornos([
      mov("env", -360, "PIX - ENVIADO - 07/02 12:57 FULANO DE TAL", "2025-02-07"),
      mov("dev", 360, "PIX - REJEITADO - 07/02 12:58 ERRO. TEMPO EXCEDIDO", "2025-02-07"),
      mov("outro", -500, "PIX - ENVIADO - 07/02 12:57 BELTRANO", "2025-02-07"),
    ]);
    expect(pares).toEqual([{ transacaoId: "dev", parId: "env" }]);
  });

  it("caso real de 30/06/2026: duas rejeições pegam os envios pela hora", () => {
    const pares = casarEstornos([
      mov("s1", -7000, "PIX - ENVIADO - 30/06 11:18 SMART CONTABIL - ASSESSOR", "2026-06-30"),
      mov("s2", -7000, "PIX - ENVIADO - 30/06 11:20 SMART CONTABIL - ASSESSOR", "2026-06-30"),
      mov("j", -7000, "PIX - ENVIADO - 30/06 11:56 J DA SILVA FERREIRA JUNIO", "2026-06-30"),
      mov("d1", 7000, "PIX - REJEITADO - 30/06 11:18 ERRO. TEMPO EXCEDIDO", "2026-06-30"),
      mov("d2", 7000, "PIX - REJEITADO - 30/06 11:21 ERRO. TEMPO EXCEDIDO", "2026-06-30"),
    ]);
    expect(pares).toEqual([
      { transacaoId: "d1", parId: "s1" },
      { transacaoId: "d2", parId: "s2" },
    ]);
  });

  it("caso real de 07/02/2025: o rejeitado é o das 12:57, não o das 16:27", () => {
    const pares = casarEstornos([
      mov("jose", -360, "PIX - ENVIADO - 07/02 12:55 JOSÉ RODRIGO SILVA DOS SAN", "2025-02-07"),
      mov("antonio", -360, "PIX - ENVIADO - 07/02 12:55 ANTONIO DA SILVA", "2025-02-07"),
      mov("matheus", -360, "PIX - ENVIADO - 07/02 12:57 MATHEUS SANTOS DE SOUZA", "2025-02-07"),
      mov("ana", -360, "PIX - ENVIADO - 07/02 16:27 ANA RAQUEL DA FONSECA PEDR", "2025-02-07"),
      mov("dev", 360, "PIX - REJEITADO - 07/02 12:58 ERRO. TEMPO EXCEDIDO", "2025-02-07"),
    ]);
    expect(pares).toEqual([{ transacaoId: "dev", parId: "matheus" }]);
  });

  it("dois envios na mesma hora para pessoas diferentes: não adivinha", () => {
    const pares = casarEstornos([
      mov("e1", -200, "PIX - ENVIADO - 06/03 13:41 FULANO", "2026-03-06"),
      mov("e2", -200, "PIX - ENVIADO - 06/03 13:41 BELTRANO", "2026-03-06"),
      mov("d1", 200, "PIX - REJEITADO - 06/03 13:42 ERRO. TEMPO EXCEDIDO.", "2026-03-06"),
    ]);
    expect(pares).toEqual([]);
  });

  it("rejeição sem envio antes dela (só depois): não casa com a nova tentativa", () => {
    const pares = casarEstornos([
      mov("depois", -280, "PIX - ENVIADO - 18/05 17:44 ROSILDO DE SOUZA MENEZES", "2026-05-18"),
      mov("dev", 280, "PIX - REJEITADO - 18/05 15:30 ERRO. TEMPO EXCEDIDO", "2026-05-18"),
    ]);
    expect(pares).toEqual([]);
  });

  it("devolução com nome só casa com envio para esse nome", () => {
    const pares = casarEstornos([
      mov("outro", -3950, "PIX - ENVIADO - 29/04 10:00 FULANO DE TAL", "2025-04-29"),
      mov("jef", -3950, "PIX - ENVIADO - 28/04 09:00 JEFERSON FERREIRA DOS SANTOS", "2025-04-28"),
      mov("dev", 3950, "PIX-ENVIO DEVOLVIDO - 30/04 14:28 JEFERSON FERREIRA DOS SANT", "2025-04-30"),
    ]);
    // a hora da devolução não é do mesmo dia do envio: fica para quem concilia
    expect(pares).toEqual([]);
  });

  it("TED devolvida dias depois, com o envio no mês anterior (vizinho)", () => {
    const pares = casarEstornos(
      [mov("dev", 2091.64, "TED DEVOLVIDA - AG OU CNT DEST DO CRED INVAL", "2025-05-02")],
      [mov("env", -2091.64, "TED TRANSF.ELETR.DISPONIV - FULANO", "2025-04-28")],
    );
    expect(pares).toEqual([{ transacaoId: "dev", parId: "env" }]);
  });

  it("não casa envio depois da devolução, nem fora da janela, nem valor diferente", () => {
    expect(
      casarEstornos([
        mov("dev", 100, "PIX - REJEITADO", "2026-05-10"),
        mov("depois", -100, "PIX - ENVIADO - FULANO", "2026-05-11"),
        mov("longe", -100, "PIX - ENVIADO - FULANO", "2026-04-20"),
        mov("valor", -100.01, "PIX - ENVIADO - FULANO", "2026-05-10"),
      ]),
    ).toEqual([]);
  });

  it("estorno de recebimento (débito devolvendo um crédito)", () => {
    const pares = casarEstornos([
      mov("rec", 1000, "PIX - RECEBIDO - CLIENTE", "2026-05-10"),
      mov("dev", -1000, "DEVOLUCAO PIX RECEBIDO", "2026-05-11"),
    ]);
    expect(pares).toEqual([{ transacaoId: "dev", parId: "rec" }]);
  });
});

describe("paresPossiveis", () => {
  it("do envio, oferece a devolução primeiro", () => {
    const lista = paresPossiveis(mov("env", -360, "PIX - ENVIADO - FULANO", "2025-02-07"), [
      mov("rec", 360, "PIX - RECEBIDO - CLIENTE", "2025-02-07"),
      mov("dev", 360, "PIX - REJEITADO", "2025-02-08"),
    ]);
    expect(lista.map((m) => m.id)).toEqual(["dev", "rec"]);
  });

  it("caso real de 03/06/2026: ORDEM REJEITADA PELO PSP não é nome", () => {
    const pares = casarEstornos([
      mov("s1", -200, "PIX - ENVIADO - 03/06 19:09 SADRAQUE ALVES DE ARAUJO", "2026-06-03"),
      mov("s2", -200, "PIX - ENVIADO - 03/06 19:13 SADRAQUE ALVES DE ARAUJO", "2026-06-03"),
      mov("dev", 200, "PIX - REJEITADO - 03/06 19:09 ORDEM REJEITADA PELO PSP D", "2026-06-03"),
    ]);
    expect(pares).toEqual([{ transacaoId: "dev", parId: "s1" }]);
  });
});
