import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SociosLigadasTabela } from "@/modules/financeiro/relatorios/components/socios-ligadas-tabela";
import type { SocioLigadaLinha } from "@/modules/financeiro/relatorios/socios-ligadas";

afterEach(cleanup);

const JAMES = "11111111-1111-4111-8111-111111111111";
const AMAZONIA = "22222222-2222-4222-8222-222222222222";

const linha = (
  centroId: string,
  centro: string,
  tipo: "socio" | "empresa_ligada",
  enviado: number,
  devolvido: number,
): SocioLigadaLinha => ({ centroId, centro, tipo, ativo: true, enviado, devolvido, saldo: enviado - devolvido });

const ANO = [linha(JAMES, "Sócio James Castro Cameli", "socio", 1585000, 0), linha(AMAZONIA, "Amazônia Agroindústria", "empresa_ligada", 100000, 50000)];
const ACUMULADO = [linha(JAMES, "Sócio James Castro Cameli", "socio", 3110000, 0), linha(AMAZONIA, "Amazônia Agroindústria", "empresa_ligada", 1270000, 1050000)];

const texto = (el: HTMLElement) => (el.textContent ?? "").replace(/\s/g, " ");

describe("SociosLigadasTabela", () => {
  it("uma linha por centro, com o tipo e os dois períodos", () => {
    render(<SociosLigadasTabela ano={2026} doAno={ANO} acumulado={ACUMULADO} />);
    const amazonia = screen.getByRole("row", { name: /Amazônia Agroindústria/ });
    expect(within(amazonia).getByText("Empresa ligada")).toBeTruthy();
    // Saldo acumulado do mútuo: 1.270.000 enviados - 1.050.000 devolvidos.
    expect(texto(amazonia)).toContain("R$ 220.000,00");
    const james = screen.getByRole("row", { name: /Sócio James/ });
    expect(within(james).getByText("Sócio")).toBeTruthy();
    expect(texto(james)).toContain("R$ 1.585.000,00");
  });

  it("fecha com uma linha de total", () => {
    render(<SociosLigadasTabela ano={2026} doAno={ANO} acumulado={ACUMULADO} />);
    const total = screen.getByRole("row", { name: /^Total/ });
    // Enviado no ano: 1.585.000 + 100.000.
    expect(texto(total)).toContain("R$ 1.685.000,00");
  });
});
