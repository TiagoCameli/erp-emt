import { render } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFiltrosUrl } from "@/components/canonicos/filter-bar";

/** URL de mentira: o que o hook lê e para onde ele manda navegar. */
const navegador = vi.hoisted(() => ({
  query: "",
  destinos: [] as string[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: (destino: string) => {
      navegador.destinos.push(destino);
      const [, q = ""] = destino.split("?");
      navegador.query = q;
    },
  }),
  usePathname: () => "/financeiro/lancamentos",
  useSearchParams: () => new URLSearchParams(navegador.query),
}));

vi.mock("@/components/canonicos/filtros-sessao", () => ({
  salvarQuerySessao: vi.fn(),
  lerQuerySessao: vi.fn(() => null),
  limparFiltrosSessao: vi.fn(),
}));

/**
 * Expõe o hook para o teste chamar fora do React. A entrega é por efeito, e não
 * atribuindo uma variável durante o render: o React Compiler proíbe escrever em
 * variável de fora do componente no corpo dele, e com razão.
 */
let api: ReturnType<typeof useFiltrosUrl>;

function Sonda() {
  const doHook = useFiltrosUrl();
  React.useEffect(() => {
    api = doHook;
  }, [doHook]);
  return null;
}

beforeEach(() => {
  navegador.query = "";
  navegador.destinos = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("setMuitos escreve a URL de filtro", () => {
  it("escreve e apaga chave numa navegação", () => {
    navegador.query = "status=a_pagar&busca=pneu";
    render(<Sonda />);

    api.setMuitos({ busca: null, pagina: "1" });

    expect(navegador.destinos).toEqual([
      "/financeiro/lancamentos?status=a_pagar&pagina=1",
    ]);
  });

  it("apaga várias chaves de uma vez, e é assim que se limpa tudo", () => {
    // É o contrato que o `onLimparFiltros` de cada tela usa: TODAS as chaves numa
    // chamada só. Ver o teste da limitação abaixo para o motivo.
    navegador.query = "status=a_pagar&busca=pneu&tipo=a_pagar&pagina=3";
    render(<Sonda />);

    api.setMuitos({ status: null, busca: null, tipo: null, pagina: "1" });

    expect(navegador.destinos).toEqual(["/financeiro/lancamentos?pagina=1"]);
  });

  it("string vazia apaga a chave, igual a null", () => {
    navegador.query = "busca=pneu";
    render(<Sonda />);

    api.setMuitos({ busca: "" });

    expect(navegador.destinos).toEqual(["/financeiro/lancamentos"]);
  });
});

describe("LIMITAÇÃO conhecida: uma chamada por interação", () => {
  it("duas chamadas no mesmo tick NÃO se somam: a segunda desfaz a primeira", () => {
    // ESTE TESTE DOCUMENTA UM LIMITE, NÃO UM DESEJO. Cada chamada monta a URL a
    // partir do `searchParams` desta renderização, e ele não muda no meio de um
    // laço síncrono, porque o React não re-renderizou ainda. Então a segunda
    // chamada parte da URL ANTIGA e apaga o que a primeira fez.
    //
    // Foi exatamente o bug do "Limpar filtros" na primeira tentativa: o botão
    // chamava um `onLimpar` por filtro, a busca limpava e o status voltava.
    //
    // O conserto NÃO é acumular aqui dentro. Isso foi tentado, com a navegação
    // adiada para o fim do tick, e o clique parou de fazer efeito nenhum no
    // navegador (sem erro no console). O conserto é quem chama passar tudo numa
    // chamada, via `onLimparFiltros` da tela.
    //
    // Se um dia este teste ficar vermelho porque as chamadas passaram a se somar,
    // ótimo: o laço por filtro volta a ser viável. Mas confira no NAVEGADOR antes
    // de acreditar, porque foi assim que este limite apareceu.
    navegador.query = "status=a_pagar&busca=pneu";
    render(<Sonda />);

    api.setMuitos({ busca: null });
    api.setMuitos({ status: null });

    // A busca voltou, porque a segunda chamada partiu da URL de antes.
    expect(navegador.destinos.at(-1)).toBe("/financeiro/lancamentos?busca=pneu");
  });
});

describe("limparTodos", () => {
  it("apaga todo filtro numa navegação só", () => {
    navegador.query = "status=a_pagar&busca=pneu&tipo=a_pagar&revisao=nao_revisado";
    render(<Sonda />);

    api.limparTodos();

    expect(navegador.destinos).toEqual(["/financeiro/lancamentos"]);
  });

  it("preserva o que NÃO é filtro: tamanho da página e ordenação", () => {
    // Ordenar e escolher quantas linhas ver não é filtrar. Quem limpa filtro não
    // pediu para a lista voltar à ordem padrão nem para trocar o tamanho da página.
    navegador.query = "busca=pneu&tamanho=100&ordem=valor&direcao=asc";
    render(<Sonda />);

    api.limparTodos();

    expect(navegador.destinos.at(-1)).toBe(
      "/financeiro/lancamentos?tamanho=100&ordem=valor&direcao=asc",
    );
  });

  it("apaga a página, que é o mesmo que voltar para a primeira", () => {
    // Página 3 de uma lista que deixou de ser filtrada quase sempre não existe.
    // Sem a chave a leitura cai em página 1, então apagar é mais limpo que pagina=1.
    navegador.query = "busca=pneu&pagina=3";
    render(<Sonda />);

    api.limparTodos();

    expect(navegador.destinos.at(-1)).toBe("/financeiro/lancamentos");
  });

  it("apaga o recorte, que é filtro vindo de relatório", () => {
    // O recorte fatia a lista igual a um filtro; deixar ele de pé faria o botão
    // limpar tudo menos justamente o que trouxe a pessoa para a tela.
    navegador.query = "recorte=vencido&tamanho=25";
    render(<Sonda />);

    api.limparTodos();

    expect(navegador.destinos.at(-1)).toBe("/financeiro/lancamentos?tamanho=25");
  });

  it("sem filtro nenhum, não navega de graça", () => {
    navegador.query = "tamanho=100";
    render(<Sonda />);

    api.limparTodos();

    expect(navegador.destinos).toEqual([]);
  });
});
