import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { useRestaurarFiltrosDaSessao } from "@/components/canonicos/use-restaurar-filtros";
import { salvarQuerySessao } from "@/components/canonicos/filtros-sessao";

const nav = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), refresh: vi.fn() }),
}));

/** Põe a barra de endereço no estado que o teste quer. */
function urlAtual(query: string) {
  window.history.replaceState({}, "", query ? `${ROTA}?${query}` : ROTA);
}

function Tela({ rota }: { rota: string }) {
  useRestaurarFiltrosDaSessao(rota);
  return null;
}

const ROTA = "/financeiro/lancamentos";

beforeEach(() => {
  cleanup();
  window.sessionStorage.clear();
  urlAtual("");
  nav.replace.mockClear();
});

describe("useRestaurarFiltrosDaSessao", () => {
  it("devolve o filtro lembrado quando a URL chega limpa", () => {
    salvarQuerySessao(ROTA, "situacao=a_pagar&obra=9");
    render(<Tela rota={ROTA} />);
    expect(nav.replace).toHaveBeenCalledTimes(1);
    const [url, opcoes] = nav.replace.mock.calls[0];
    expect(new URLSearchParams(String(url).split("?")[1]).get("situacao")).toBe(
      "a_pagar",
    );
    expect(opcoes).toEqual({ scroll: false });
  });

  it("não faz nada quando nada foi lembrado", () => {
    render(<Tela rota={ROTA} />);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("link com filtro na URL ganha da sessão", () => {
    // Quem manda uma URL com filtro está dizendo o que quer ver.
    salvarQuerySessao(ROTA, "situacao=a_pagar");
    urlAtual("situacao=paga");
    render(<Tela rota={ROTA} />);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("query lembrada vazia é 'eu limpei', e não restaura nada", () => {
    salvarQuerySessao(ROTA, "");
    render(<Tela rota={ROTA} />);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("URL só com página conta como limpa e o filtro volta", () => {
    salvarQuerySessao(ROTA, "situacao=a_pagar");
    urlAtual("pagina=3");
    render(<Tela rota={ROTA} />);
    expect(nav.replace).toHaveBeenCalledTimes(1);
  });

  it("não restaura o filtro de outra rota", () => {
    salvarQuerySessao("/compras/ordens", "situacao=aprovada");
    render(<Tela rota={ROTA} />);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("não entra em laço: rerender com a URL já restaurada não navega de novo", () => {
    // O efeito depende só da rota. Se `searchParams` entrasse nas dependências,
    // o replace faria o efeito rodar em cima do próprio resultado, sem parar.
    salvarQuerySessao(ROTA, "situacao=a_pagar");
    const { rerender } = render(<Tela rota={ROTA} />);
    expect(nav.replace).toHaveBeenCalledTimes(1);

    // É o que o Next faz depois do replace: a query passa a existir e re-renderiza.
    urlAtual("situacao=a_pagar");
    rerender(<Tela rota={ROTA} />);
    rerender(<Tela rota={ROTA} />);
    expect(nav.replace).toHaveBeenCalledTimes(1);
  });
});
