import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { TanqueVisual } from "./tanque-visual";

afterEach(cleanup);

const ID = "11111111-1111-4111-8111-111111111111";

// Porte do TanqueVisual.test da origem. Regressão do print de 20/08/2026: o card da aba
// Tanques mostrava "156 L" pro Tanque Canteiro 2, que tem 155,600 L no banco.
describe("TanqueVisual — nível com 2 casas", () => {
  it("LINHA DE CONTROLE: 155,6 L aparece como 155,60 e nunca como 156", () => {
    const { container } = render(
      <TanqueVisual id={ID} nome="Tanque Canteiro 2" capacidade={15000} nivel={155.6} combustivelNome="Diesel S10" />,
    );
    const texto = container.textContent ?? "";
    expect(texto).toContain("155,60 L");
    expect(texto).not.toContain("156 L");
  });

  it("valor redondo mostra ,00 e a capacidade fica sem casas", () => {
    const { container } = render(
      <TanqueVisual id={ID} nome="ARLA GREGÓRIO" capacidade={4000} nivel={1880} combustivelNome="ARLA 32 - LITRO" />,
    );
    const texto = container.textContent ?? "";
    expect(texto).toContain("1.880,00 L");
    expect(texto).toContain("47% de 4.000 L");
  });

  it("tanque vazio mostra 0,00 L e o selo Vazio", () => {
    const { container, getByText } = render(
      <TanqueVisual id={ID} nome="Tanque Patio Colorado" capacidade={15000} nivel={0} />,
    );
    expect(container.textContent ?? "").toContain("0,00 L");
    expect(getByText("Vazio")).toBeInTheDocument();
  });
});

describe("TanqueVisual — dado do ERP", () => {
  it("sem capacidade cadastrada mostra o nível real, não 0,00 L", () => {
    const { container } = render(
      <TanqueVisual id={ID} nome="Comboio" capacidade={0} nivel={500} combustivelNome="Diesel S500" />,
    );
    const texto = container.textContent ?? "";
    expect(texto).toContain("500,00 L");
    expect(texto).toContain("sem capacidade cadastrada");
  });

  it("nível acima da capacidade (capacidade reduzida) mostra o real e a régua para em 100%", () => {
    const { container } = render(
      <TanqueVisual id={ID} nome="Comboio" capacidade={1000} nivel={1200} combustivelNome="Diesel S10" />,
    );
    const texto = container.textContent ?? "";
    expect(texto).toContain("1.200,00 L");
    expect(texto).toContain("100% de 1.000 L");
  });

  it("o selo do combustível tem a cor dele", () => {
    const { getByText } = render(
      <TanqueVisual id={ID} nome="Comboio" capacidade={5000} nivel={2168.5} combustivelNome="OLEO DIESEL B S500" />,
    );
    const selo = getByText("OLEO DIESEL B S500").parentElement!;
    expect(selo.style.backgroundColor).toBe("rgb(245, 158, 11)");
  });
});
