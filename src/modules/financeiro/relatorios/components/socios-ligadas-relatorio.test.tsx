import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SociosLigadasRelatorioTela } from "@/modules/financeiro/relatorios/components/socios-ligadas-relatorio";
import { montarSociosLigadas } from "@/modules/financeiro/relatorios/socios-ligadas";

afterEach(cleanup);

// jsdom não tem IntersectionObserver, que o `whileInView` do motion usa.
class SemObservar {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.IntersectionObserver ??= SemObservar as unknown as typeof IntersectionObserver;

const JAMES = "11111111-1111-4111-8111-111111111111";
const AMAZONIA = "22222222-2222-4222-8222-222222222222";

const DADOS = montarSociosLigadas(
  [
    { centroId: JAMES, centro: "Sócio James Castro Cameli", tipo: "socio", ativo: true, enviado: 1100, devolvido: 0, saldo: 1100 },
    { centroId: AMAZONIA, centro: "Amazônia Agroindústria", tipo: "empresa_ligada", ativo: true, enviado: 3000, devolvido: 1000, saldo: 2000 },
  ],
  [
    { centroId: JAMES, mes: "2025-12", enviado: 100, enviadoAberto: 0, devolvido: 0, devolvidoAberto: 0 },
    { centroId: JAMES, mes: "2026-02", enviado: 1000, enviadoAberto: 250, devolvido: 0, devolvidoAberto: 0 },
    { centroId: AMAZONIA, mes: "2026-01", enviado: 3000, enviadoAberto: 0, devolvido: 1000, devolvidoAberto: 0 },
  ],
  "2026-03",
);

const texto = (el: HTMLElement) => (el.textContent ?? "").replace(/\s/g, " ");

describe("SociosLigadasRelatorioTela", () => {
  it("não mostra sócio nenhum: nem o bloco, nem o nome, nem a distribuição", () => {
    render(<SociosLigadasRelatorioTela dados={DADOS} />);
    expect(screen.queryByRole("region", { name: /Sócios/ })).toBeNull();
    expect(document.body.textContent).not.toMatch(/sócio|James/i);
    expect(document.body.textContent).not.toContain("R$ 1.100,00");
  });

  it("o bloco das ligadas fala do saldo do mútuo, sem somar com sócio", () => {
    render(<SociosLigadasRelatorioTela dados={DADOS} />);
    const ligadas = screen.getByRole("region", { name: /Empresas ligadas/ });
    expect(texto(ligadas)).toContain("As empresas ligadas devem R$ 2.000,00 à EMT");
    expect(texto(ligadas)).not.toContain("R$ 3.100,00");
    // O enviado abre a lista de mútuo a pagar do centro; o devolvido, a receber.
    const enviado = within(ligadas).getByTitle(/Mútuo enviado/);
    expect(enviado.getAttribute("href")).toContain("natureza=mutuo");
    expect(enviado.getAttribute("href")).toContain("tipo=a_pagar");
    expect(within(ligadas).getByTitle(/Mútuo devolvido/).getAttribute("href")).toContain("tipo=a_receber");
  });
});
