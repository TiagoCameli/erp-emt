import { describe, expect, it } from "vitest";

import {
  conferirMesFechado,
  parseOfx,
  conferirMovimentosNoPeriodo,
  numerarRepetidos,
  recortarExtrato,
  sugerirIntervalo,
} from "@/lib/ofx";

/**
 * OFX 1.x (SGML) de exemplo, no formato que Caixa/BB/Sicredi exportam: cabeçalho
 * com chave:valor, tags sem fechamento dentro de STMTTRN, período em DTSTART /
 * DTEND. Duas transações: um crédito (TRNAMT positivo) e um débito (negativo).
 */
const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>104
<ACCTID>1234567
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260601000000[-3:GMT]
<DTEND>20260630235959[-3:GMT]
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260602120000[-3:GMT]
<TRNAMT>1500.50
<FITID>2026060200001
<MEMO>Recebimento medicao DNIT
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260615
<TRNAMT>-320.75
<FITID>2026061500002
<MEMO>Pagamento fornecedor brita
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

describe("parseOfx (OFX 1.x SGML)", () => {
  const extrato = parseOfx(OFX_SGML);

  it("lê todas as transações do extrato", () => {
    expect(extrato.transacoes).toHaveLength(2);
  });

  it("converte DTPOSTED para data ISO yyyy-MM-dd", () => {
    expect(extrato.transacoes[0]?.data).toBe("2026-06-02");
    expect(extrato.transacoes[1]?.data).toBe("2026-06-15");
  });

  it("preserva o sinal e classifica crédito x débito", () => {
    const [credito, debito] = extrato.transacoes;
    expect(credito?.valor).toBe(1500.5);
    expect(credito?.tipo).toBe("credito");
    expect(debito?.valor).toBe(-320.75);
    expect(debito?.tipo).toBe("debito");
  });

  it("extrai FITID e MEMO de cada transação", () => {
    expect(extrato.transacoes[0]?.fitid).toBe("2026060200001");
    expect(extrato.transacoes[0]?.memo).toBe("Recebimento medicao DNIT");
    expect(extrato.transacoes[1]?.fitid).toBe("2026061500002");
    expect(extrato.transacoes[1]?.memo).toBe("Pagamento fornecedor brita");
  });

  it("lê o período do extrato a partir de DTSTART / DTEND", () => {
    expect(extrato.periodoInicio).toBe("2026-06-01");
    expect(extrato.periodoFim).toBe("2026-06-30");
  });
});

describe("parseOfx com vírgula como decimal", () => {
  // Alguns exportadores brasileiros usam vírgula no TRNAMT.
  const ofx = `<OFX>
<BANKTRANLIST>
<DTSTART>20260101
<DTEND>20260131
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260110
<TRNAMT>2.345,67
<FITID>X1
<MEMO>Valor com virgula
</STMTTRN>
</BANKTRANLIST>
</OFX>`;

  it("aceita vírgula decimal e ponto de milhar no valor", () => {
    const extrato = parseOfx(ofx);
    expect(extrato.transacoes).toHaveLength(1);
    expect(extrato.transacoes[0]?.valor).toBe(2345.67);
    expect(extrato.transacoes[0]?.tipo).toBe("credito");
  });
});

describe("parseOfx com ponto de milhar e sem decimal", () => {
  // Exportador fora do padrão: valor inteiro com pontos de milhar e sem vírgula
  // (1.234.567). Os pontos são milhar, não decimal: o valor é 1234567.
  const ofx = `<OFX>
<STMTTRN>
<DTPOSTED>20260110
<TRNAMT>1.234.567
<FITID>Z1
<MEMO>Valor alto sem decimal
</STMTTRN>
</OFX>`;

  it("trata 2+ pontos sem vírgula como separador de milhar", () => {
    const extrato = parseOfx(ofx);
    expect(extrato.transacoes).toHaveLength(1);
    expect(extrato.transacoes[0]?.valor).toBe(1234567);
    expect(extrato.transacoes[0]?.tipo).toBe("credito");
  });
});

describe("parseOfx com NAME no lugar de MEMO", () => {
  const ofx = `<OFX>
<STMTTRN>
<DTPOSTED>20260110
<TRNAMT>-10.00
<FITID>Y1
<NAME>Tarifa bancaria
</STMTTRN>
</OFX>`;

  it("cai para NAME quando não há MEMO", () => {
    const extrato = parseOfx(ofx);
    expect(extrato.transacoes[0]?.memo).toBe("Tarifa bancaria");
  });
});

describe("parseOfx em arquivo vazio", () => {
  it("não quebra e devolve zero transações", () => {
    const vazio = parseOfx("");
    expect(vazio.transacoes).toEqual([]);
    expect(vazio.periodoInicio).toBeNull();
    expect(vazio.periodoFim).toBeNull();
  });

  it("extrato sem nenhuma STMTTRN devolve lista vazia", () => {
    const semTransacoes = `<OFX>
<BANKTRANLIST>
<DTSTART>20260101
<DTEND>20260131
</BANKTRANLIST>
</OFX>`;
    const extrato = parseOfx(semTransacoes);
    expect(extrato.transacoes).toHaveLength(0);
    expect(extrato.periodoInicio).toBe("2026-01-01");
    expect(extrato.periodoFim).toBe("2026-01-31");
  });
});

describe("parseOfx ignora transação sem data ou sem valor", () => {
  const ofx = `<OFX>
<STMTTRN>
<TRNAMT>100.00
<FITID>SemData
</STMTTRN>
<STMTTRN>
<DTPOSTED>20260110
<FITID>SemValor
</STMTTRN>
<STMTTRN>
<DTPOSTED>20260111
<TRNAMT>50.00
<FITID>Boa
</STMTTRN>
</OFX>`;

  it("mantém só a transação completa", () => {
    const extrato = parseOfx(ofx);
    expect(extrato.transacoes).toHaveLength(1);
    expect(extrato.transacoes[0]?.fitid).toBe("Boa");
  });
});

describe("parseOfx com o período trocado", () => {
  // A Caixa exportou assim em 01/2025 e 02/2025: DTSTART depois de DTEND. O
  // extrato foi gravado com início 31/01 e fim 01/01, um período que anda para
  // trás. Período é intervalo, e intervalo não tem ordem.
  const ofx = `<OFX>
<BANKTRANLIST>
<DTSTART>20250131
<DTEND>20250101
<STMTTRN>
<DTPOSTED>20250106
<TRNAMT>458000.00
<FITID>001022
<MEMO>RESG CDB 95 VLR ATUAL
</STMTTRN>
</BANKTRANLIST>
</OFX>`;

  it("devolve o par na ordem certa", () => {
    const extrato = parseOfx(ofx);
    expect(extrato.periodoInicio).toBe("2025-01-01");
    expect(extrato.periodoFim).toBe("2025-01-31");
  });

  it("depois de normalizado o mês conta como fechado", () => {
    const extrato = parseOfx(ofx);
    expect(conferirMesFechado(extrato.periodoInicio, extrato.periodoFim)).toBe(
      null,
    );
  });
});

describe("conferirMesFechado", () => {
  it("aceita o mês inteiro, do dia 1 ao último", () => {
    expect(conferirMesFechado("2026-01-01", "2026-01-31")).toBe(null);
  });

  it("aceita fevereiro de ano bissexto até o dia 29", () => {
    expect(conferirMesFechado("2024-02-01", "2024-02-29")).toBe(null);
  });

  it("aceita fevereiro comum até o dia 28", () => {
    expect(conferirMesFechado("2025-02-01", "2025-02-28")).toBe(null);
  });

  it("recusa fevereiro comum que para no dia 27", () => {
    expect(conferirMesFechado("2025-02-01", "2025-02-27")).toContain(
      "de 01 a 28",
    );
  });

  it("acusa o arquivo que atravessa a virada do mês", () => {
    // É o extrato do BB de janeiro/2026: dois dias de dezembro a mais.
    const aviso = conferirMesFechado("2025-12-30", "2026-01-31");
    expect(aviso).toContain("30/12/2025");
    expect(aviso).toContain("31/01/2026");
    expect(aviso).toContain("não é um mês fechado");
  });

  it("acusa o arquivo que começa depois do dia 1", () => {
    const aviso = conferirMesFechado("2026-01-05", "2026-01-31");
    expect(aviso).toContain("05/01/2026");
    expect(aviso).toContain("de 01 a 31");
  });

  it("diz que não dá para conferir quando o arquivo não declara o período", () => {
    expect(conferirMesFechado(null, null)).toContain("não informa o período");
  });
});

describe("saldo final (LEDGERBAL)", () => {
  const transacao =
    "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260901<TRNAMT>-10.00<FITID>1<MEMO>X</STMTTRN>";

  it("lê o BB em SGML, com o saldo antes do fim do arquivo", () => {
    const ofx = `<OFX><BANKTRANLIST>${transacao}</BANKTRANLIST>\n<LEDGERBAL>\n\t <BALAMT>0.00\n\t <DTASOF>20261001\n    </LEDGERBAL></OFX>`;
    expect(parseOfx(ofx)).toMatchObject({
      saldoFinal: 0,
      saldoFinalData: "2026-10-01",
    });
  });

  it("lê a Caixa em SGML sem fechamento de tag, parando no AVAILBAL", () => {
    const ofx = `<OFX><BANKTRANLIST>${transacao}</BANKTRANLIST><LEDGERBAL><BALAMT>69690.90<DTASOF>20260930000000[-3:BRT]<AVAILBAL><BALAMT>1.00<DTASOF>20260930</OFX>`;
    expect(parseOfx(ofx)).toMatchObject({
      saldoFinal: 69690.9,
      saldoFinalData: "2026-09-30",
    });
  });

  it("lê o Sicredi em XML, com saldo negativo e vírgula decimal", () => {
    const ofx = `<?xml version="1.0"?><OFX><BANKTRANLIST>${transacao}</BANKTRANLIST><LEDGERBAL><BALAMT>-1.234,56</BALAMT><DTASOF>20260930120000</DTASOF></LEDGERBAL></OFX>`;
    expect(parseOfx(ofx)).toMatchObject({
      saldoFinal: -1234.56,
      saldoFinalData: "2026-09-30",
    });
  });

  it("sem LEDGERBAL devolve null, nunca inventa zero", () => {
    const ofx = `<OFX><BANKTRANLIST>${transacao}</BANKTRANLIST></OFX>`;
    expect(parseOfx(ofx)).toMatchObject({
      saldoFinal: null,
      saldoFinalData: null,
    });
  });
});

describe("numerarRepetidos (Bloco C)", () => {
  it("numera os iguais sem FITID na ordem do arquivo e deixa o FITID de fora", () => {
    const base = { data: "2026-09-02", valor: -150, memo: "PIX DIARIA FULANO" };
    const numerados = numerarRepetidos([
      { ...base, fitid: null },
      { ...base, fitid: null },
      { ...base, memo: "PIX DIARIA BELTRANO", fitid: null },
      { ...base, fitid: "123" },
      { ...base, fitid: null },
    ]);
    expect(numerados.map((t) => t.n)).toEqual([1, 2, 1, null, 3]);
  });

  it("reimportar o mesmo arquivo gera as mesmas posições", () => {
    const arquivo = [
      { data: "2026-09-02", valor: -150, memo: "X", fitid: null },
      { data: "2026-09-02", valor: -150, memo: "X", fitid: null },
    ];
    expect(numerarRepetidos(arquivo).map((t) => t.n)).toEqual(
      numerarRepetidos(arquivo).map((t) => t.n),
    );
  });
});

describe("conferirMovimentosNoPeriodo (Bloco C)", () => {
  const extrato = (
    inicio: string | null,
    fim: string | null,
    datas: string[],
  ) => ({
    periodoInicio: inicio,
    periodoFim: fim,
    contaOfx: null,
    saldoFinal: null,
    saldoFinalData: null,
    transacoes: datas.map((data) => ({
      data,
      valor: -1,
      memo: null,
      fitid: null,
      tipo: "debito" as const,
    })),
  });

  it("recusa período declarado sem nenhum movimento dentro", () => {
    expect(
      conferirMovimentosNoPeriodo(
        extrato("2026-10-01", "2026-10-31", ["2026-09-30"]),
      ),
    ).toContain("nenhum movimento cai nesse período");
  });

  it("aceita quando há movimento no período ou quando o arquivo não declara período", () => {
    expect(
      conferirMovimentosNoPeriodo(
        extrato("2026-09-01", "2026-09-30", ["2026-09-30"]),
      ),
    ).toBeNull();
    expect(
      conferirMovimentosNoPeriodo(extrato(null, null, ["2026-09-30"])),
    ).toBeNull();
  });
});

describe("intervalo da importação", () => {
  const mov = (data: string) => ({ data, valor: -1, memo: null, fitid: data, tipo: "debito" as const });
  const arquivo = {
    periodoInicio: "2024-12-30",
    periodoFim: "2025-01-31",
    contaOfx: null,
    saldoFinal: 1000,
    saldoFinalData: "2025-01-31",
    transacoes: [mov("2024-12-30"), mov("2024-12-31"), mov("2025-01-02"), mov("2025-01-31")],
  };

  it("sugere o mês que o arquivo mais cobre: 30/12 a 31/01 vira janeiro inteiro", () => {
    expect(sugerirIntervalo(arquivo)).toEqual({ de: "2025-01-01", ate: "2025-01-31" });
  });

  it("arquivo de um mês só sugere o próprio período", () => {
    expect(sugerirIntervalo({ ...arquivo, periodoInicio: "2026-09-01", periodoFim: "2026-09-30" })).toEqual({
      de: "2026-09-01",
      ate: "2026-09-30",
    });
  });

  it("recorta os movimentos e mantém o saldo quando o intervalo vai até o fim do arquivo", () => {
    const r = recortarExtrato(arquivo, "2025-01-01", "2025-01-31");
    expect(r.transacoes.map((t) => t.data)).toEqual(["2025-01-02", "2025-01-31"]);
    expect(r).toMatchObject({ periodoInicio: "2025-01-01", periodoFim: "2025-01-31", saldoFinal: 1000 });
  });

  it("intervalo que para antes do fim do arquivo descarta o saldo, que não confere", () => {
    const r = recortarExtrato(arquivo, "2024-12-30", "2024-12-31");
    expect(r.transacoes).toHaveLength(2);
    expect(r).toMatchObject({ saldoFinal: null, saldoFinalData: null });
  });
});
