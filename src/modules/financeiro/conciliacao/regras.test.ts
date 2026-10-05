import { describe, expect, it } from "vitest";

import {
  normalizarHistorico,
  padraoDoHistorico,
  regraDoMovimento,
  type RegraConciliacao,
} from "@/modules/financeiro/conciliacao/regras";

const BB = "40fb6875-ad20-45ed-9346-d1b59e7d9723";

function regra(parcial: Partial<RegraConciliacao>): RegraConciliacao {
  return {
    id: "r",
    contaBancariaId: BB,
    nome: "Regra",
    padrao: "BB RENDE FACIL",
    sentido: null,
    acao: "transferencia",
    contaContraparteId: "sub",
    fornecedorId: null,
    categoriaId: null,
    centroCustoId: null,
    automatica: true,
    ativa: true,
    vezesAplicada: 0,
    ultimaAplicacao: null,
    ...parcial,
  };
}

describe("normalizarHistorico", () => {
  it("tira acento, põe em maiúsculas e junta espaços, como o banco", () => {
    expect(normalizarHistorico("  BB Rende   Fácil - rende facil ")).toBe("BB RENDE FACIL - RENDE FACIL");
    expect(normalizarHistorico("TARIFA PACOTE DE SERVIÇOS - COBRANÇA")).toBe("TARIFA PACOTE DE SERVICOS - COBRANCA");
    expect(normalizarHistorico(null)).toBe("");
  });
});

describe("regraDoMovimento", () => {
  const rende = { contaBancariaId: BB, valor: -100, memo: "BB RENDE FÁCIL - RENDE FACIL" };

  it("casa por 'contém' no histórico normalizado", () => {
    expect(regraDoMovimento([regra({})], rende)?.id).toBe("r");
    expect(regraDoMovimento([regra({})], { ...rende, memo: "PIX - ENVIADO - FULANO" })).toBeNull();
  });

  it("respeita sentido, conta, ativa e apelido", () => {
    expect(regraDoMovimento([regra({ sentido: "credito" })], rende)).toBeNull();
    expect(regraDoMovimento([regra({ sentido: "debito" })], rende)?.id).toBe("r");
    expect(regraDoMovimento([regra({ contaBancariaId: "outra" })], rende)).toBeNull();
    expect(regraDoMovimento([regra({ ativa: false })], rende)).toBeNull();
    expect(regraDoMovimento([regra({ acao: "apelido" })], rende)).toBeNull();
  });

  it("a regra da conta vem antes da geral; empate pelo nome", () => {
    const geral = regra({ id: "geral", nome: "A geral", contaBancariaId: null });
    const daConta = regra({ id: "conta", nome: "Z da conta" });
    expect(regraDoMovimento([geral, daConta], rende)?.id).toBe("conta");
    const b = regra({ id: "b", nome: "B" });
    const a = regra({ id: "a", nome: "A" });
    expect(regraDoMovimento([b, a], rende)?.id).toBe("a");
  });
});

describe("padraoDoHistorico", () => {
  it("o maior trecho contínuo sem data, hora e número", () => {
    expect(padraoDoHistorico("TARIFA PACOTE DE SERVIÇOS - COBRANÇA REFERENTE 05/09/2025")).toBe(
      "TARIFA PACOTE DE SERVICOS - COBRANCA REFERENTE",
    );
    expect(padraoDoHistorico("BB RENDE FÁCIL - RENDE FACIL")).toBe("BB RENDE FACIL - RENDE FACIL");
    expect(padraoDoHistorico("PIX - ENVIADO - 06/10 10:00 FULANO DE TAL")).toBe("FULANO DE TAL");
    expect(padraoDoHistorico("123 456")).toBe("");
  });

  it("o padrão sugerido está contido no histórico normalizado", () => {
    const memo = "TARIFA PIX ENVIADO - TAR. AGRUPADAS - OCORRENCIA 21/09/2026";
    expect(normalizarHistorico(memo).includes(padraoDoHistorico(memo))).toBe(true);
  });
});
