import { describe, expect, it } from "vitest";

import { destinoDoQr, rotaDoDestino } from "@/modules/manutencao/campo/qr";

const ID = "3f2a9c1e-8b7d-4e6f-9a0b-1c2d3e4f5a6b";

describe("destinoDoQr", () => {
  it("etiqueta nova, em qualquer host", () => {
    expect(destinoDoQr(`https://erp.exemplo.com/m/equipamento/${ID}`)).toEqual({ tipo: "equipamento", id: ID });
    expect(destinoDoQr(`http://localhost:3000/m/equipamento/${ID.toUpperCase()}?x=1`)).toEqual({
      tipo: "equipamento",
      id: ID,
    });
  });

  it("adesivo antigo, inclusive o que saiu com localhost", () => {
    expect(destinoDoQr("https://emtconstrutora.com/m/eq/eq-0042")).toEqual({ tipo: "legado", id: "eq-0042" });
    expect(destinoDoQr("http://localhost:5173/m/eq/abc123/info")).toEqual({ tipo: "legado", id: "abc123" });
  });

  it("texto solto: uuid é do ERP, id curto é tentado como antigo", () => {
    expect(destinoDoQr(` ${ID} `)).toEqual({ tipo: "equipamento", id: ID });
    expect(destinoDoQr("eq-0042")).toEqual({ tipo: "legado", id: "eq-0042" });
  });

  it("recusa o que não é equipamento", () => {
    expect(destinoDoQr("")).toBeNull();
    expect(destinoDoQr("https://site.com/qualquer/coisa")).toBeNull();
    expect(destinoDoQr("abc")).toBeNull();
    expect(destinoDoQr("javascript:alert(1)")).toBeNull();
  });

  it("a rota do destino escapa o id antigo", () => {
    expect(rotaDoDestino({ tipo: "equipamento", id: ID })).toBe(`/m/equipamento/${ID}`);
    expect(rotaDoDestino({ tipo: "legado", id: "eq-0042" })).toBe("/m/eq/eq-0042");
  });
});
