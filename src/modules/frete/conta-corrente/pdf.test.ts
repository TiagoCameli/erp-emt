// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { MovimentoExtrato } from "@/modules/frete/conta-corrente/extrato";
import { documentoDoExtrato, textoPdf } from "@/modules/frete/conta-corrente/pdf";

function mov(tipo: MovimentoExtrato["tipo"], valor: number, data: string, extra: Partial<MovimentoExtrato> = {}) {
  return {
    id: `${tipo}-${data}`,
    data,
    createdAt: data,
    tipo,
    valor,
    descricao: "Frete 12 — Pedreira → Usina",
    mesReferencia: `${data.slice(0, 7)}-01`,
    saidaLitros: 100,
    saidaPrecoProprietario: 6.2,
    saidaTaxaLitro: 0,
    ...extra,
  } as MovimentoExtrato;
}

function textos(no: unknown, saida: string[] = []): string[] {
  if (typeof no === "string") saida.push(no);
  else if (Array.isArray(no)) no.forEach((n) => textos(n, saida));
  else if (no && typeof no === "object") Object.values(no).forEach((n) => textos(n, saida));
  return saida;
}

describe("PDF do extrato", () => {
  it("tabela Movimentos com rodapé Saldo final; sem créditos de tanque, sem a 2ª página", () => {
    const doc = documentoDoExtrato("Soares", [mov("credito_frete", 100, "2026-06-01T17:00:00Z")], [], new Date());
    const t = textos(doc.content);
    expect(t).toContain("Movimentos (1)");
    expect(t).toContain("Saldo final");
    expect(t).toContain("Frete 12 — Pedreira -> Usina");
    expect(t.some((s) => s.startsWith("Abastecimentos no tanque"))).toBe(false);
  });

  it("dona de tanque ganha a página dos créditos no tanque", () => {
    const doc = documentoDoExtrato("Areacre", [mov("credito_abastecimento_transterra", 620, "2026-06-01T12:00:00Z")], [], new Date());
    expect(textos(doc.content)).toContain("Abastecimentos no tanque (créditos) (1)");
  });

  it("troca a seta que a Helvetica padrão não tem", () => {
    expect(textoPdf("A → B")).toBe("A -> B");
    expect(textoPdf(null)).toBe("");
  });
});
