import { describe, expect, it } from "vitest";

import { parseOfx } from "@/lib/ofx";

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
