import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { AppShell } from "@/components/canonicos";
import { MAPA_ICONES, modulosDaBarraMobile } from "@/components/canonicos/app-shell";
import { MODULOS as MODULOS_DO_CATALOGO } from "@/config/recursos";

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

/**
 * Módulo sem entrada em MAPA_ICONES cai no ícone genérico (Circle) e ninguém
 * percebe: nem o tsc acusa, porque o mapa é `Record<string, LucideIcon>`, não
 * `Record<ModuloId, LucideIcon>`. Este teste é a trava contra isso: todo módulo
 * do catálogo tem de ter um ícone próprio.
 */
describe("MAPA_ICONES", () => {
  it("tem um ícone para todo módulo do catálogo", () => {
    for (const modulo of MODULOS_DO_CATALOGO) {
      expect(MAPA_ICONES[modulo.id], `sem ícone para o módulo ${modulo.id}`).toBeDefined();
    }
  });
});

/**
 * A barra inferior do celular pegava os seis primeiros módulos do catálogo, e
 * Frete, Combustível e Manutenção (os de campo) ficavam sem caminho no mobile.
 */
describe("AppShell, barra inferior do mobile", () => {
  const CATALOGO = [
    { id: "gestao", nome: "Gestão", rota: "/gestao" },
    { id: "cadastros", nome: "Cadastros", rota: "/cadastros" },
    { id: "compras", nome: "Compras", rota: "/compras" },
    { id: "frete", nome: "Frete", rota: "/frete" },
    { id: "combustivel", nome: "Combustível", rota: "/combustivel" },
    { id: "manutencao", nome: "Manutenção", rota: "/manutencao" },
    { id: "financeiro", nome: "Financeiro", rota: "/financeiro" },
  ];

  it("põe os módulos de campo primeiro e manda o resto para o Menu", () => {
    const { naBarra, temMenu } = modulosDaBarraMobile(CATALOGO);
    expect(naBarra.map((m) => m.id)).toEqual(["combustivel", "frete", "manutencao", "gestao"]);
    expect(temMenu).toBe(true);
  });

  it("sem módulo sobrando, não mostra o Menu", () => {
    const { naBarra, temMenu } = modulosDaBarraMobile(MODULOS);
    expect(naBarra).toHaveLength(3);
    expect(temMenu).toBe(false);
  });

  it("mostra as abas do módulo atual numa faixa própria", () => {
    render(
      <AppShell
        usuario={{ nome: "Tiago Cameli", email: "tiago@emtconstrutora.com" }}
        modulos={[
          {
            id: "financeiro",
            nome: "Financeiro",
            rota: "/financeiro",
            abas: [
              { id: "a", nome: "Lançamentos", rota: "/financeiro/lancamentos" },
              { id: "b", nome: "Pagamentos", rota: "/financeiro/pagamentos" },
            ],
          },
        ]}
        onSair={() => {}}
      >
        <p>conteúdo</p>
      </AppShell>,
    );
    const faixa = screen.getByRole("navigation", { name: "Abas de Financeiro" });
    expect(within(faixa).getByRole("link", { name: "Lançamentos" })).toHaveAttribute("aria-current", "page");
    expect(within(faixa).getByRole("link", { name: "Pagamentos" })).not.toHaveAttribute("aria-current");
  });

  it("não repete a faixa quando o módulo desenha as próprias abas", () => {
    render(
      <AppShell
        usuario={{ nome: "Tiago Cameli", email: "tiago@emtconstrutora.com" }}
        modulos={[
          {
            id: "financeiro",
            nome: "Financeiro",
            rota: "/financeiro",
            abasNaPagina: true,
            abas: [
              { id: "a", nome: "Lançamentos", rota: "/financeiro/lancamentos" },
              { id: "b", nome: "Pagamentos", rota: "/financeiro/pagamentos" },
            ],
          },
        ]}
        onSair={() => {}}
      >
        <p>conteúdo</p>
      </AppShell>,
    );
    expect(screen.queryByRole("navigation", { name: "Abas de Financeiro" })).toBeNull();
  });
});
