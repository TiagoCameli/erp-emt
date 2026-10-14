import { describe, expect, it } from "vitest";

import {
  aplicarBusca,
  casaBusca,
  filtrarPorBusca,
  palavrasDaBusca,
  textoDeData,
  textoDeMes,
  textoDeValor,
  textoPesquisavel,
} from "@/lib/busca";

describe("palavrasDaBusca", () => {
  it("tira acento, baixa a caixa e quebra em palavras", () => {
    expect(palavrasDaBusca("  Pôsto   IPIRANGA Março ")).toEqual([
      "posto",
      "ipiranga",
      "marco",
    ]);
  });

  it("descarta o R$ e trata ponto com 1-2 casas como decimal", () => {
    expect(palavrasDaBusca("R$ 1500.5")).toEqual(["1500,5"]);
    expect(palavrasDaBusca("R$1.500")).toEqual(["1.500"]);
  });

  it("tira os curingas do ilike para a palavra ser literal", () => {
    expect(palavrasDaBusca("100% _a*")).toEqual(["100", "a"]);
  });

  it("busca vazia não tem palavra", () => {
    expect(palavrasDaBusca("   ")).toEqual([]);
    expect(palavrasDaBusca(undefined)).toEqual([]);
  });
});

describe("formas de valor, data e mês", () => {
  it("valor sai com e sem milhar, sempre duas casas", () => {
    expect(textoDeValor(1500)).toBe("1500,00 1.500,00");
    expect(textoDeValor("1234567.8")).toBe("1234567,80 1.234.567,80");
    expect(textoDeValor(-12.5)).toBe("12,50 12,50");
    expect(textoDeValor(null)).toBe("");
  });

  it("data sai em todas as grafias, inclusive o mês por extenso", () => {
    expect(textoDeData("2026-03-15")).toBe(
      "15/03/2026 2026-03-15 03/2026 2026-03 marco/2026 mar/26 03/26",
    );
    expect(textoDeData("lixo")).toBe("");
  });

  it("mês de competência aceita yyyy-MM e yyyy-MM-01", () => {
    expect(textoDeMes("2026-12-01")).toBe(
      "12/2026 2026-12 dezembro/2026 dez/26 12/26",
    );
    expect(textoDeMes("2026-12")).toBe(textoDeMes("2026-12-01"));
  });
});

describe("casaBusca", () => {
  const oc = textoPesquisavel(
    "OC-2026-0042",
    "Auto Posto Ipiranga Ltda",
    ["Óleo diesel S10", "Filtro de ar"],
    "BR-364 Lote 2",
    { valor: 15320.4 },
    { data: "2026-03-15" },
    { mes: "2026-03-01" },
  );

  it.each([
    ["número", "0042"],
    ["fornecedor sem acento e em minúsculas", "ipiranga"],
    ["insumo com acento", "óleo"],
    ["centro de custo", "br-364"],
    ["valor com milhar", "15.320"],
    ["valor sem milhar", "15320,40"],
    ["valor com R$", "R$ 15.320,40"],
    ["valor com ponto decimal", "15320.40"],
    ["dia", "15/03"],
    ["mês numérico", "03/2026"],
    ["mês por extenso", "março"],
    ["mês abreviado", "mar/26"],
    ["várias palavras em lugares diferentes", "ipiranga diesel março"],
  ])("acha pelo %s", (_, busca) => {
    expect(casaBusca(oc, busca)).toBe(true);
  });

  it("todas as palavras precisam bater (E, não OU)", () => {
    expect(casaBusca(oc, "ipiranga gasolina")).toBe(false);
  });

  it("busca vazia casa tudo", () => {
    expect(casaBusca(oc, "")).toBe(true);
  });

  it("valor diferente não casa", () => {
    expect(casaBusca(oc, "15.321")).toBe(false);
  });
});

describe("filtrarPorBusca", () => {
  const linhas = [
    { nome: "Cimento CP-II", valor: 32.9 },
    { nome: "Areia média", valor: 120 },
  ];

  it("filtra pela linha inteira e devolve cópia quando a busca é vazia", () => {
    const campos = (l: (typeof linhas)[number]) => [l.nome, { valor: l.valor }];
    expect(filtrarPorBusca(linhas, "120", campos)).toEqual([linhas[1]]);
    expect(filtrarPorBusca(linhas, "media", campos)).toEqual([linhas[1]]);
    const todas = filtrarPorBusca(linhas, " ", campos);
    expect(todas).toEqual(linhas);
    expect(todas).not.toBe(linhas);
  });
});

describe("aplicarBusca", () => {
  it("um ilike por palavra, na coluna computada", () => {
    const chamadas: [string, string][] = [];
    const consulta = {
      ilike(coluna: string, padrao: string) {
        chamadas.push([coluna, padrao]);
        return consulta;
      },
    };
    aplicarBusca(consulta, "Ipiranga R$ 1.500,00");
    expect(chamadas).toEqual([
      ["busca", "%ipiranga%"],
      ["busca", "%1.500,00%"],
    ]);
  });

  it("busca vazia não toca a consulta", () => {
    let tocou = false;
    const consulta = {
      ilike() {
        tocou = true;
        return consulta;
      },
    };
    aplicarBusca(consulta, "  ");
    expect(tocou).toBe(false);
  });
});
