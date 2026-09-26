import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ProvedorTema } from "@/components/canonicos/provedor-tema";
import { ItensMenuTema, SeletorTema } from "@/components/canonicos/seletor-tema";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// Sem globals: true no vitest.config, o cleanup automático da RTL não roda.
afterEach(cleanup);

/**
 * O jsdom não tem `matchMedia`, e o next-themes lê `prefers-color-scheme` por
 * ele para resolver "Sistema". O teste controla o que o "sistema" prefere.
 */
function sistemaPrefere(escuro: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (consulta: string) => ({
      matches: escuro && consulta.includes("dark"),
      media: consulta,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

const html = () => document.documentElement;

/**
 * O next-themes guarda a escolha no `localStorage`. No Node 25 o global
 * `localStorage` do próprio Node (sem `--localstorage-file`) toma o lugar do
 * jsdom e não tem nem `clear`; no Node 22 do CI o do jsdom funciona. Um storage
 * em memória, só quando o global vem quebrado, deixa o teste igual nos dois.
 */
if (typeof globalThis.localStorage?.clear !== "function") {
  const dados = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => dados.get(k) ?? null,
      setItem: (k: string, v: string) => void dados.set(k, String(v)),
      removeItem: (k: string) => void dados.delete(k),
      clear: () => dados.clear(),
      key: (i: number) => [...dados.keys()][i] ?? null,
      get length() {
        return dados.size;
      },
    } satisfies Storage,
  });
}

beforeEach(() => {
  localStorage.clear();
  html().className = "";
  html().removeAttribute("style");
  sistemaPrefere(false);
});

describe("SeletorTema (telas de campo)", () => {
  it("as três opções aplicam a classe certa no <html>", async () => {
    render(
      <ProvedorTema>
        <SeletorTema />
      </ProvedorTema>,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Tema escuro" }));
    await waitFor(() => expect(html()).toHaveClass("dark"));
    expect(screen.getByRole("radio", { name: "Tema escuro" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("radio", { name: "Tema claro" }));
    await waitFor(() => expect(html()).toHaveClass("light"));
    expect(html()).not.toHaveClass("dark");

    // "Sistema" segue o `prefers-color-scheme`: com o sistema no escuro, volta
    // a ser `dark` mesmo depois de a pessoa ter passado pelo claro.
    sistemaPrefere(true);
    fireEvent.click(screen.getByRole("radio", { name: "Tema do sistema" }));
    await waitFor(() => expect(html()).toHaveClass("dark"));
    expect(screen.getByRole("radio", { name: "Tema do sistema" })).toHaveAttribute("aria-checked", "true");
  });

  it("sem escolha nenhuma, o padrão é o do sistema", async () => {
    sistemaPrefere(true);
    render(
      <ProvedorTema>
        <SeletorTema />
      </ProvedorTema>,
    );
    await waitFor(() => expect(html()).toHaveClass("dark"));
    expect(screen.getByRole("radio", { name: "Tema do sistema" })).toHaveAttribute("aria-checked", "true");
  });

  it("é um grupo de rádio com nome, e cada botão tem aria-label em pt-BR", () => {
    render(
      <ProvedorTema>
        <SeletorTema />
      </ProvedorTema>,
    );
    expect(screen.getByRole("radiogroup", { name: "Tema" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Tema do sistema",
      "Tema claro",
      "Tema escuro",
    ]);
  });
});

describe("ItensMenuTema (menu do usuário do AppShell)", () => {
  function renderMenu() {
    render(
      <ProvedorTema>
        <DropdownMenu open>
          <DropdownMenuTrigger>Menu do usuário</DropdownMenuTrigger>
          <DropdownMenuContent>
            <ItensMenuTema />
          </DropdownMenuContent>
        </DropdownMenu>
      </ProvedorTema>,
    );
  }

  it("as três opções aplicam a classe certa no <html>", async () => {
    renderMenu();

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitemradio", { name: "Escuro" }));
    });
    await waitFor(() => expect(html()).toHaveClass("dark"));

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitemradio", { name: "Claro" }));
    });
    await waitFor(() => expect(html()).toHaveClass("light"));
    expect(html()).not.toHaveClass("dark");

    sistemaPrefere(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitemradio", { name: "Sistema" }));
    });
    await waitFor(() => expect(html()).toHaveClass("dark"));
    expect(screen.getByRole("menuitemradio", { name: "Sistema" })).toHaveAttribute("aria-checked", "true");
  });
});
