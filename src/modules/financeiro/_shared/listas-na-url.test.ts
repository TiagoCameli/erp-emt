import { describe, expect, it } from "vitest";

import {
  escreverListaNaUrl,
  lerCatalogoDaUrl,
  lerUuidsDaUrl,
  MAX_ITENS_FILTRO,
} from "@/modules/financeiro/_shared/listas-na-url";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("lerUuidsDaUrl", () => {
  it("sem parâmetro, é lista vazia (todos)", () => {
    expect(lerUuidsDaUrl(undefined)).toEqual([]);
    expect(lerUuidsDaUrl("")).toEqual([]);
  });

  it("um valor só continua funcionando", () => {
    // O link antigo da tela tem um id só. Ele não pode virar filtro vazio.
    expect(lerUuidsDaUrl(A)).toEqual([A]);
  });

  it("lê separado por vírgula, na ordem de escolha", () => {
    expect(lerUuidsDaUrl(`${B},${A}`)).toEqual([B, A]);
  });

  it("lê a chave repetida", () => {
    expect(lerUuidsDaUrl([A, B])).toEqual([A, B]);
  });

  it("descarta o que não é uuid e deduplica", () => {
    expect(lerUuidsDaUrl(`${A},abc,${A},${B},,${C}`)).toEqual([A, B, C]);
  });

  it("corta no teto", () => {
    const muitos = Array.from(
      { length: MAX_ITENS_FILTRO + 10 },
      (_, i) =>
        `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`,
    );
    expect(lerUuidsDaUrl(muitos.join(","))).toHaveLength(MAX_ITENS_FILTRO);
  });
});

describe("lerCatalogoDaUrl", () => {
  const CATALOGO = ["a_pagar", "aprovado", "pago"] as const;

  it("só aceita o que está no catálogo", () => {
    expect(lerCatalogoDaUrl("pago,inventado", CATALOGO)).toEqual(["pago"]);
    expect(lerCatalogoDaUrl("cancelado", CATALOGO)).toEqual([]);
  });

  it("devolve na ordem do catálogo, e não na de clique", () => {
    // O texto do gatilho ("Aprovado, Pago") não pode mudar conforme a sequência
    // de cliques: o mesmo filtro pareceria dois filtros diferentes.
    expect(lerCatalogoDaUrl("pago,a_pagar", CATALOGO)).toEqual([
      "a_pagar",
      "pago",
    ]);
  });

  it("deduplica", () => {
    expect(lerCatalogoDaUrl("pago,pago", CATALOGO)).toEqual(["pago"]);
  });
});

describe("escreverListaNaUrl", () => {
  it("lista vazia remove o parâmetro", () => {
    expect(escreverListaNaUrl([])).toBeNull();
  });

  it("junta por vírgula", () => {
    expect(escreverListaNaUrl([A, B])).toBe(`${A},${B}`);
  });

  it("corta no teto ao escrever também", () => {
    const muitos = Array.from({ length: MAX_ITENS_FILTRO + 5 }, () => A);
    expect(escreverListaNaUrl(muitos)?.split(",")).toHaveLength(
      MAX_ITENS_FILTRO,
    );
  });

  it("o que foi escrito volta igual na leitura", () => {
    const escrito = escreverListaNaUrl([A, B, C]);
    expect(lerUuidsDaUrl(escrito ?? undefined)).toEqual([A, B, C]);
  });
});
