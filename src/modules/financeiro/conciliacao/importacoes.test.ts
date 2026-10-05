import { describe, expect, it } from "vitest";

import {
  coberturaMeses,
  deslocarMes,
  resolverContaDoArquivo,
  type ContaParaArquivo,
} from "./importacoes";

const extrato = (periodoInicio: string, periodoFim: string) => ({ periodoInicio, periodoFim });
const situacoes = (r: ReturnType<typeof coberturaMeses>) =>
  Object.fromEntries(r.map((m) => [m.mes, m.situacao]));

describe("coberturaMeses (Bloco G)", () => {
  it("mês cheio e mês sem extrato", () => {
    const r = coberturaMeses([extrato("2026-09-01", "2026-09-30")], "2026-09", 2);
    expect(situacoes(r)).toEqual({ "2026-08": "sem", "2026-09": "cheio" });
  });

  it("arquivo de 30/12 a 31/01: dezembro parcial e janeiro cheio", () => {
    const r = coberturaMeses([extrato("2025-12-30", "2026-01-31")], "2026-01", 2);
    expect(situacoes(r)).toEqual({ "2025-12": "parcial", "2026-01": "cheio" });
  });

  it("dois arquivos que juntos cobrem o mês contam como cheio", () => {
    const r = coberturaMeses(
      [extrato("2026-09-01", "2026-09-15"), extrato("2026-09-16", "2026-09-30")],
      "2026-09",
      1,
    );
    expect(r).toEqual([{ mes: "2026-09", situacao: "cheio" }]);
  });

  it("começar no meio do mês deixa o mês parcial; fevereiro bissexto conta 29 dias", () => {
    expect(coberturaMeses([extrato("2026-09-05", "2026-09-30")], "2026-09", 1)[0].situacao).toBe("parcial");
    expect(coberturaMeses([extrato("2028-02-01", "2028-02-29")], "2028-02", 1)[0].situacao).toBe("cheio");
  });

  it("devolve 12 meses em ordem, atravessando o ano", () => {
    const r = coberturaMeses([], "2026-03");
    expect(r).toHaveLength(12);
    expect(r[0].mes).toBe("2025-04");
    expect(r[11].mes).toBe("2026-03");
    expect(deslocarMes("2026-01", -1)).toBe("2025-12");
  });
});

describe("resolverContaDoArquivo (Bloco M)", () => {
  const conta = (id: string, numero: string, extra: Partial<ContaParaArquivo> = {}): ContaParaArquivo => ({
    id,
    nome: id,
    numero,
    ativo: true,
    tipo: "corrente",
    contaPaiId: null,
    ...extra,
  });
  const contas = [
    conta("bb102", "102.124-9"),
    conta("caixa", "578367973-5"),
    conta("bb30", "30.893-5"),
    conta("bb102-inv", "102.124-9", { tipo: "investimento", contaPaiId: "bb102" }),
  ];

  it("acha as três contas reais pelo ACCTID", () => {
    expect(resolverContaDoArquivo("1021249", contas)).toEqual({ conta: contas[0] });
    expect(resolverContaDoArquivo("5783679735", contas)).toEqual({ conta: contas[1] });
    expect(resolverContaDoArquivo("308935", contas)).toEqual({ conta: contas[2] });
  });

  it("com a agência na frente do número também acha", () => {
    expect(resolverContaDoArquivo("23581021249", contas)).toEqual({ conta: contas[0] });
  });

  it("colisão de sufixo recusa e diz quais", () => {
    const r = resolverContaDoArquivo("5", [conta("a", "30.893-5"), conta("b", "578367973-5")]);
    expect("erro" in r && r.candidatas.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("conta inexistente, sem número no arquivo, inativa ou subconta: recusa", () => {
    expect("erro" in resolverContaDoArquivo("999999", contas)).toBe(true);
    expect("erro" in resolverContaDoArquivo("", contas)).toBe(true);
    expect("erro" in resolverContaDoArquivo("1021249", [conta("x", "102.124-9", { ativo: false })])).toBe(true);
  });
});
