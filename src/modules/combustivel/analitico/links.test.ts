import { describe, expect, it } from "vitest";

import { textoDiferenca, formatarRPorL, leituraDaTendencia } from "@/modules/combustivel/analitico/formato";
import { linkSaidasDoConsumidor } from "@/modules/combustivel/analitico/links";
import { recorteDaUrl } from "@/modules/combustivel/analitico/recorte";
import { ID_NAO_IDENTIFICADO } from "@/modules/combustivel/painel/calculo";

const SET = { de: "2026-09-01", ate: "2026-09-30" };

describe("link da linha do ranking para as Saídas (mesmo recorte, mesmo número)", () => {
  it("próprios: período resolvido e o equipamento (a lista deriva o tipo do modo)", () => {
    expect(linkSaidasDoConsumidor("eq-1", { modo: "proprios", ...SET }, ["outros"])).toBe(
      "/combustivel/abastecimentos?de=2026-09-01&ate=2026-09-30&equipamento=eq-1",
    );
  });

  it("repete os filtros globais da URL e troca só o consumidor; filtro de lista não atravessa", () => {
    const link = linkSaidasDoConsumidor("eq-1", { modo: "proprios", ...SET }, [], {
      obra: "o1",
      tanque: ["t1", "t2"],
      equipamento: "eq-1,eq-2",
      de: "2026-01-01",
      pagina: "3",
    });
    expect(link).toBe(
      "/combustivel/abastecimentos?obra=o1&tanque=t1&tanque=t2&de=2026-09-01&ate=2026-09-30&equipamento=eq-1",
    );
  });

  it("Não identificado abre o sentinela quando existe UM só", () => {
    expect(linkSaidasDoConsumidor(ID_NAO_IDENTIFICADO, { modo: "proprios", ...SET }, ["outros"])).toContain(
      "equipamento=outros",
    );
    expect(linkSaidasDoConsumidor(ID_NAO_IDENTIFICADO, { modo: "proprios", ...SET }, [])).toBeNull();
    expect(linkSaidasDoConsumidor(ID_NAO_IDENTIFICADO, { modo: "proprios", ...SET }, ["a", "b"])).toBeNull();
  });

  it("carretas: modo na URL e a placa", () => {
    expect(linkSaidasDoConsumidor("ABC1D23", { modo: "carretas", ...SET }, [])).toBe(
      "/combustivel/abastecimentos?modo=carretas&de=2026-09-01&ate=2026-09-30&placa=ABC1D23",
    );
  });
});

describe("recorte da URL", () => {
  it("padrão: próprios e os últimos 30 dias; anterior de mesma duração", () => {
    const r = recorteDaUrl({}, "2026-09-30");
    expect(r).toEqual({
      modo: "proprios",
      periodo: { de: "2026-09-01", ate: "2026-09-30" },
      anterior: { de: "2026-08-02", ate: "2026-08-31" },
    });
  });

  it("lê modo e período; invertido troca de lado", () => {
    const r = recorteDaUrl({ modo: "carretas", de: "2026-09-10", ate: "2026-09-01" }, "2026-09-30");
    expect(r.modo).toBe("carretas");
    expect(r.periodo).toEqual({ de: "2026-09-01", ate: "2026-09-10" });
  });
});

describe("formato", () => {
  it("R$/L com 4 casas; zero vira travessão", () => {
    expect(formatarRPorL(6.39474)).toBe("R$ 6,3947");
    expect(formatarRPorL(0)).toBe("—");
    expect(formatarRPorL(null)).toBe("—");
  });

  it("chip da origem: ±5 é estável, acima de 200% corta", () => {
    expect(leituraDaTendencia(4.9)).toEqual({ direcao: "estavel", texto: "+4,9%" });
    expect(leituraDaTendencia(12.34)).toEqual({ direcao: "alta", texto: "+12,3%" });
    expect(leituraDaTendencia(-30)).toEqual({ direcao: "queda", texto: "-30,0%" });
    expect(leituraDaTendencia(250).texto).toBe("+200%+");
  });

  it("diferença absoluta com sinal", () => {
    expect(textoDiferenca({ tipo: "absoluto", valor: 2 })).toBe("+2");
    expect(textoDiferenca({ tipo: "absoluto", valor: -3 })).toBe("−3");
    expect(textoDiferenca({ tipo: "percentual", valor: 10 })).toBeUndefined();
  });
});
