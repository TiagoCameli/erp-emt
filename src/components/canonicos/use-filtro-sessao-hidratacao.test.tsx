import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";

import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";

/**
 * O filtro lembrado num CARREGAMENTO DE PÁGINA: renderiza no servidor e hidrata,
 * na mesma ordem do navegador. Os outros testes deste hook usam `render`, que
 * monta direto no cliente e nunca passa pela hidratação, então o contrato dos
 * dois snapshots (`getSnapshot` e `getServerSnapshot`) não era exercitado por
 * ninguém.
 *
 * As duas metades importam, e é fácil quebrar uma tentando arrumar a outra:
 *
 * - O HTML do servidor tem de sair com o PADRÃO. Ler o `sessionStorage` no
 *   primeiro quadro faria o React acusar incompatibilidade de hidratação e
 *   reconstruir a árvore no cliente; numa listagem grande, é a tela piscando.
 * - Depois de hidratar, o valor guardado tem de valer, senão a pessoa volta para
 *   a tela e o recorte dela sumiu.
 *
 * AVISO A QUEM FOR INVESTIGAR "o filtro lembrado não volta": antes de mexer no
 * hook, confira `document.visibilityState`. Numa aba de automação o Chrome
 * reporta `hidden`, o React não hidrata aba oculta, e a tela fica indefinidamente
 * com o padrão do servidor -- na primeira tecla o valor guardado aparece emendado
 * no que foi digitado ("PONTE" + "Z" = "PONTEZ") e parece defeito do app. Foi
 * medido no build de produção: com a aba acordada por qualquer interação (duas
 * teclas de Tab bastam), o valor volta sozinho e o hook está correto. Dois dias
 * de caça a um fantasma vieram daí.
 */

const nav = vi.hoisted(() => ({ rota: "/cadastros/obras" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.rota,
}));

const CHAVE = "erp-emt:filtro:/cadastros/obras:busca";

function Tela() {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  return (
    <input
      aria-label="busca"
      value={busca}
      onChange={(evento) => setBusca(evento.target.value)}
    />
  );
}

let raiz: Root | null = null;
let caixa: HTMLDivElement | null = null;

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  caixa?.remove();
  raiz = null;
  caixa = null;
});

/** Renderiza no "servidor" e hidrata, na mesma ordem que o navegador faz. */
async function carregarPagina(): Promise<HTMLInputElement> {
  const html = renderToString(<Tela />);
  caixa = document.createElement("div");
  caixa.innerHTML = html;
  document.body.appendChild(caixa);
  await act(async () => {
    raiz = hydrateRoot(caixa as HTMLDivElement, <Tela />);
  });
  return caixa.querySelector("input") as HTMLInputElement;
}

describe("filtro lembrado num carregamento de página", () => {
  it("o HTML do SERVIDOR sai com o padrão, nunca com o valor guardado", () => {
    window.sessionStorage.setItem(CHAVE, "PONTE");

    expect(renderToString(<Tela />)).not.toContain("PONTE");
  });

  it("e depois de hidratar o valor guardado vale", async () => {
    window.sessionStorage.setItem(CHAVE, "PONTE");

    const campo = await carregarPagina();

    expect(campo.value).toBe("PONTE");
  });

  it("CONTROLE: sem nada guardado fica o padrão da tela", async () => {
    // Sem este par, um hook que devolvesse qualquer coisa não vazia passaria no
    // caso de cima.
    const campo = await carregarPagina();

    expect(campo.value).toBe("");
  });
});
