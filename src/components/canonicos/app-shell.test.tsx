import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { AppShell } from "@/components/canonicos";

vi.mock("next/navigation", () => ({
  usePathname: () => "/financeiro/lancamentos",
}));

vi.mock("@/components/canonicos/use-restaurar-filtros", () => ({
  useRestaurarFiltrosDaSessao: () => {},
}));

afterEach(cleanup);

const MODULOS = [
  { id: "gestao", nome: "Gestão", rota: "/gestao" },
  { id: "financeiro", nome: "Financeiro", rota: "/financeiro" },
  { id: "administracao", nome: "Administração", rota: "/administracao" },
];

/**
 * A nav do rail e a barra inferior do mobile têm o mesmo `aria-label`, e as duas
 * ficam no DOM: quem esconde uma de cada vez é a media query, que o jsdom não
 * aplica (para o leitor de tela real não há duplicação, porque a escondida está
 * em `display:none`). Por isso o teste mira dentro do `aside`, que só existe no
 * desktop, em vez de procurar a nav pelo nome.
 */
function railDoDesktop(): HTMLElement {
  const aside = document.querySelector("aside");
  if (!aside) throw new Error("sidebar do desktop não renderizou");
  return within(aside).getByRole("navigation", { name: "Módulos" });
}

function montar() {
  return render(
    <AppShell
      usuario={{ nome: "Tiago Cameli", email: "tiago@emtconstrutora.com" }}
      modulos={MODULOS}
      onSair={() => {}}
    >
      <p>conteúdo</p>
    </AppShell>,
  );
}

/**
 * A sidebar do desktop mostrava só o ícone, enquanto o menu do mobile já
 * mostrava ícone e nome. Quem abria o ERP no computador tinha que decorar seis
 * desenhos, e é isso que estes testes travam.
 */
describe("AppShell, nome do módulo na sidebar", () => {
  it("escreve o nome de cada módulo no rail do desktop", () => {
    montar();
    const rail = railDoDesktop();
    for (const modulo of MODULOS) {
      expect(within(rail).getByText(modulo.nome)).toBeInTheDocument();
    }
  });

  it("o link do módulo continua tendo o nome acessível certo", () => {
    montar();
    // O texto visível é `aria-hidden` porque o link já carrega `aria-label`:
    // sem isso o leitor de tela anunciaria "Financeiro Financeiro".
    const rail = railDoDesktop();
    const link = within(rail).getByRole("link", { name: "Financeiro" });
    expect(link).toHaveAttribute("href", "/financeiro");
  });

  it("marca o módulo da rota atual, e só ele", () => {
    montar();
    const rail = railDoDesktop();
    expect(
      within(rail).getByRole("link", { name: "Financeiro" }),
    ).toHaveAttribute("aria-current", "page");
    expect(within(rail).getByRole("link", { name: "Gestão" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
