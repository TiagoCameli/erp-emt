import { describe, expect, it } from "vitest";

import { absoluto, arredondar, casasDecimais, comparar, lerDecimal, multiplicar, paraTexto, subtrair } from "./decimal";

const t = (s: string) => lerDecimal(s);

describe("decimal exato", () => {
  it("multiplica sem perder casa (02.07.04 do Lote 09)", () => {
    expect(paraTexto(multiplicar(t("17057.717"), t("580.86")))).toBe("9908145.49062");
  });

  it("arredonda meio para longe do zero, como o round do Postgres", () => {
    expect(paraTexto(arredondar(t("1.005"), 2))).toBe("1.01");
    expect(paraTexto(arredondar(t("0.5025"), 2))).toBe("0.5");
    expect(paraTexto(arredondar(t("-1.005"), 2))).toBe("-1.01");
    expect(paraTexto(arredondar(t("2"), 2))).toBe("2");
  });

  it("subtrai, compara e tira o absoluto", () => {
    expect(paraTexto(subtrair(t("1.01"), t("0.5")))).toBe("0.51");
    expect(comparar(t("0.1"), t("0.10"))).toBe(0);
    expect(comparar(t("0.1"), t("0.2"))).toBe(-1);
    expect(paraTexto(absoluto(t("-3.2")))).toBe("3.2");
  });

  it("recusa texto que não é número canônico", () => {
    expect(() => lerDecimal("1.234,56")).toThrow("Número inválido");
    expect(() => lerDecimal("1e-7")).toThrow("Número inválido");
    expect(() => lerDecimal("")).toThrow("Número inválido");
  });

  it("conta casas", () => {
    expect(casasDecimais("580.8643")).toBe(4);
    expect(casasDecimais("100")).toBe(0);
  });
});
