import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  lerQuerySessao,
  salvarQuerySessao,
} from "@/components/canonicos/filtros-sessao";
import { RelatoriosNav } from "@/modules/financeiro/relatorios/components/relatorios-nav";

/**
 * Quem entra em Investimentos (que virou Aplicações) tem que conseguir voltar.
 *
 * O defeito (28/09/2026): o botão Investimentos gravava `rel=investimentos` na
 * memória de filtros da sessão e o servidor redirecionava para Aplicações. Lá
 * não havia barra, e abrir Relatórios pelo menu restaurava `rel=investimentos`,
 * que redirecionava de novo. Um laço.
 *
 * O `sessionStorage` é o de verdade (jsdom), porque é nele que o laço morava;
 * só o router do Next é mockado.
 */
const navegador = vi.hoisted(() => ({
  pathname: "/financeiro/relatorios",
  query: "",
  push: [] as string[],
  replace: [] as string[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (destino: string) => navegador.push.push(destino),
    replace: (destino: string) => navegador.replace.push(destino),
  }),
  usePathname: () => navegador.pathname,
  useSearchParams: () => new URLSearchParams(navegador.query),
}));

const RELATORIOS = "/financeiro/relatorios";

beforeEach(() => {
  window.sessionStorage.clear();
  navegador.push = [];
  navegador.replace = [];
  navegador.query = "";
});

afterEach(cleanup);

describe("RelatoriosNav em Relatórios", () => {
  beforeEach(() => {
    navegador.pathname = RELATORIOS;
  });

  it("Investimentos vai direto para Aplicações sem gravar rel=investimentos", () => {
    navegador.query = "rel=dre&mes=2026-08";
    salvarQuerySessao(RELATORIOS, navegador.query);
    render(<RelatoriosNav ativo="dre" investimentosEmAplicacoes />);

    fireEvent.click(screen.getByRole("button", { name: /Investimentos/ }));

    expect(navegador.push).toEqual(["/financeiro/aplicacoes"]);
    expect(navegador.replace).toEqual([]);
    expect(lerQuerySessao(RELATORIOS)).toBe("mes=2026-08&rel=dre");
  });

  it("sem a aba Aplicações, Investimentos continua sendo o relatório", () => {
    render(<RelatoriosNav ativo="dre" />);

    fireEvent.click(screen.getByRole("button", { name: /Investimentos/ }));

    expect(navegador.push).toEqual([]);
    expect(navegador.replace).toEqual([`${RELATORIOS}?rel=investimentos`]);
  });

  it("os outros relatórios seguem trocando o rel no lugar", () => {
    render(<RelatoriosNav ativo="dre" investimentosEmAplicacoes />);

    fireEvent.click(screen.getByRole("button", { name: /Aging/ }));

    expect(navegador.replace).toEqual([`${RELATORIOS}?rel=aging`]);
  });
});

describe("RelatoriosNav em Aplicações", () => {
  beforeEach(() => {
    navegador.pathname = "/financeiro/aplicacoes";
  });

  it("marca Investimentos como a aba aberta", () => {
    render(<RelatoriosNav ativo="investimentos" investimentosEmAplicacoes />);

    expect(
      screen.getByRole("button", { name: /Investimentos/ }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("volta para Relatórios com o filtro lembrado e reescreve a memória", () => {
    // O estado que prendia a pessoa: a sessão lembrando rel=investimentos.
    salvarQuerySessao(RELATORIOS, "mes=2026-08&rel=investimentos");
    render(<RelatoriosNav ativo="investimentos" investimentosEmAplicacoes />);

    fireEvent.click(screen.getByRole("button", { name: /DRE gerencial/ }));

    expect(navegador.push).toEqual([`${RELATORIOS}?mes=2026-08&rel=dre`]);
    expect(lerQuerySessao(RELATORIOS)).toBe("mes=2026-08&rel=dre");
  });

  it("sem memória, volta só com o rel", () => {
    render(<RelatoriosNav ativo="investimentos" investimentosEmAplicacoes />);

    fireEvent.click(screen.getByRole("button", { name: /Fluxo de caixa/ }));

    expect(navegador.push).toEqual([`${RELATORIOS}?rel=fluxo-caixa`]);
  });

  it("clicar na própria aba não navega", () => {
    render(<RelatoriosNav ativo="investimentos" investimentosEmAplicacoes />);

    fireEvent.click(screen.getByRole("button", { name: /Investimentos/ }));

    expect(navegador.push).toEqual([]);
    expect(navegador.replace).toEqual([]);
  });
});
