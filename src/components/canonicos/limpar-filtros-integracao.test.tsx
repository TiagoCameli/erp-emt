import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { DataTable } from "@/components/canonicos/data-table";
import {
  FiltroBusca,
  FiltroSelect,
  useBuscaUrl,
  useFiltrosUrl,
} from "@/components/canonicos/filter-bar";

/**
 * Integração do "Limpar filtros" com as peças REAIS: o DataTable canônico e o
 * `useFiltrosUrl`. Nada do meu código é mockado aqui — só o router do Next e as
 * Server Actions de preferência, que não existem fora de uma requisição.
 *
 * Existe porque o teste de unidade do botão usa filtros de mentira que só
 * empilham num array, e foi por isso que ele passou verde enquanto a tela não
 * limpava nada. Aqui a asserção é a que interessa: UMA navegação, e nela nenhum
 * filtro sobrou.
 */

const navegador = vi.hoisted(() => ({ query: "", destinos: [] as string[] }));
const preferencia = vi.hoisted(() => ({ salva: null as string | null }));

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

vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => preferencia.salva),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

vi.mock("@/components/canonicos/filtros-sessao", () => ({
  salvarQuerySessao: vi.fn(),
  lerQuerySessao: vi.fn(() => null),
  limparFiltrosSessao: vi.fn(),
  filtrosLembraveis: vi.fn(() => ""),
}));

beforeEach(() => {
  navegador.query = "";
  navegador.destinos = [];
});

afterEach(() => cleanup());

interface Linha {
  id: string;
  descricao: string;
}

const LINHAS: Linha[] = [{ id: "1", descricao: "Combustível" }];

/**
 * Tela de mentira montada como as telas REAIS de filtro na URL: lê os valores do
 * `searchParams`, escreve com `setMuitos` e passa `limparTodos` como
 * `onLimparFiltros`. É a mesma fiação de `lancamentos-tabela.tsx`.
 */
function TelaComFiltroNaUrl() {
  const { get, setMuitos, limparTodos } = useFiltrosUrl();
  const busca = get("busca") ?? "";
  const status = get("status") ?? "";

  return (
    <DataTable<Linha>
      onLimparFiltros={limparTodos}
      idTabela="teste.limpar"
      columns={[{ accessorKey: "descricao", header: "Descrição" }]}
      data={LINHAS}
      total={1}
      pageIndex={0}
      pageSize={25}
      onPaginationChange={() => undefined}
      filtros={[
        {
          id: "busca",
          rotulo: "Busca",
          fixo: true,
          temValor: busca !== "",
          onLimpar: () => setMuitos({ busca: null, pagina: "1" }),
          elemento: (
            <FiltroBusca
              valor={busca}
              onValorChange={(valor) =>
                setMuitos({ busca: valor || null, pagina: "1" })
              }
            />
          ),
        },
        {
          id: "status",
          rotulo: "Status",
          temValor: status !== "",
          onLimpar: () => setMuitos({ status: null, pagina: "1" }),
          elemento: (
            <FiltroSelect
              valor={status}
              onValorChange={(valor) =>
                setMuitos({ status: valor || null, pagina: "1" })
              }
              opcoes={[{ valor: "a_pagar", rotulo: "A pagar" }]}
              todosRotulo="Todos os status"
            />
          ),
        },
      ]}
    />
  );
}

function botaoLimpar(): HTMLElement | null {
  return screen.queryByRole("button", { name: "Limpar filtros" });
}

describe("Limpar filtros numa tela com filtro na URL", () => {
  it("um clique apaga TODOS os filtros, em UMA navegação", () => {
    // O bug que isto trava: com um `onLimpar` por filtro, a segunda escrita
    // partia da URL antiga e o status voltava. Foi visto na tela.
    navegador.query = "status=a_pagar&busca=pneu&pagina=3";
    render(<TelaComFiltroNaUrl />);

    fireEvent.click(botaoLimpar() as HTMLElement);

    expect(navegador.destinos).toHaveLength(1);
    expect(navegador.destinos[0]).toBe("/financeiro/lancamentos");
  });

  it("o botão só existe quando há filtro preenchido", () => {
    navegador.query = "";
    const { unmount } = render(<TelaComFiltroNaUrl />);
    expect(botaoLimpar()).toBeNull();
    unmount();

    navegador.query = "busca=pneu";
    render(<TelaComFiltroNaUrl />);
    expect(botaoLimpar()).toBeInTheDocument();
  });

  it("preserva o que não é filtro: tamanho da página e ordenação", () => {
    navegador.query = "busca=pneu&tamanho=100&ordem=valor&direcao=desc";
    render(<TelaComFiltroNaUrl />);

    fireEvent.click(botaoLimpar() as HTMLElement);

    expect(navegador.destinos).toEqual([
      "/financeiro/lancamentos?tamanho=100&ordem=valor&direcao=desc",
    ]);
  });
});

/**
 * A MESMA tela, mas com a busca fiada como nas telas reais: o texto vive em
 * estado local dentro do `useBuscaUrl`, com espera de 400 ms antes de escrever
 * na URL. A tela de cima alimenta o FiltroBusca direto do `searchParams`, e foi
 * exatamente por isso que ela ficou verde enquanto Ordens e Lancamentos
 * deixavam o termo no campo: nenhum teste exercitava o estado local.
 */
function TelaComBuscaDebounced() {
  const { get, setMuitos, limparTodos } = useFiltrosUrl();
  const status = get("status") ?? "";
  const { busca, setBusca } = useBuscaUrl(get("busca") ?? "");

  return (
    <DataTable<Linha>
      onLimparFiltros={limparTodos}
      idTabela="teste.limpar.debounce"
      columns={[{ accessorKey: "descricao", header: "Descrição" }]}
      data={LINHAS}
      total={1}
      pageIndex={0}
      pageSize={25}
      onPaginationChange={() => undefined}
      filtros={[
        {
          id: "busca",
          rotulo: "Busca",
          fixo: true,
          temValor: busca !== "",
          onLimpar: () => setBusca(""),
          elemento: <FiltroBusca valor={busca} onValorChange={setBusca} />,
        },
        {
          id: "status",
          rotulo: "Status",
          temValor: status !== "",
          onLimpar: () => setMuitos({ status: null, pagina: "1" }),
          elemento: (
            <FiltroSelect
              valor={status}
              onValorChange={(valor) =>
                setMuitos({ status: valor || null, pagina: "1" })
              }
              opcoes={[{ valor: "a_pagar", rotulo: "A pagar" }]}
              todosRotulo="Todos os status"
            />
          ),
        },
      ]}
    />
  );
}

function campoBusca(): HTMLInputElement {
  return screen.getByPlaceholderText(/buscar/i) as HTMLInputElement;
}

describe("Limpar filtros com a busca em estado local (o caso do dono)", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  /** O que o App Router faz sozinho: a URL mudou, a arvore re-renderiza. */
  function reagirANavegacao(rerender: (no: ReactElement) => void) {
    act(() => {
      rerender(<TelaComBuscaDebounced />);
    });
  }

  it("esvazia o CAMPO de busca, nao so a URL", () => {
    // O relato: "o botao de limpar filtros nao esta limpando o filtro de busca".
    // Na tela dele a URL ficava em `?busca=cjjf&pagina=1` com a lista vazia.
    navegador.query = "busca=cjjf&pagina=1";
    const { rerender } = render(<TelaComBuscaDebounced />);
    expect(campoBusca().value).toBe("cjjf");

    fireEvent.click(botaoLimpar() as HTMLElement);
    reagirANavegacao(rerender);

    expect(campoBusca().value).toBe("");
  });

  it("e a espera NAO reescreve o termo antigo na URL depois", () => {
    // O mecanismo do defeito: o campo guardava o texto e, 400 ms depois, a
    // propria espera devolvia `busca=cjjf` para a URL que o botao acabou de
    // limpar. Uma navegacao a mais aqui e o bug de volta.
    navegador.query = "busca=cjjf&pagina=1";
    const { rerender } = render(<TelaComBuscaDebounced />);

    fireEvent.click(botaoLimpar() as HTMLElement);
    reagirANavegacao(rerender);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(navegador.destinos).toEqual(["/financeiro/lancamentos"]);
    expect(new URLSearchParams(navegador.query).get("busca")).toBeNull();
  });

  it("CONTROLE: digitar continua escrevendo na URL", () => {
    // Sem este caso, um `setBusca` que nao fizesse nada passaria nos dois de
    // cima -- campo vazio e nenhuma navegacao extra e exatamente o que um campo
    // morto produz.
    navegador.query = "";
    render(<TelaComBuscaDebounced />);

    fireEvent.change(campoBusca(), { target: { value: "pneu" } });
    expect(campoBusca().value).toBe("pneu");
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(navegador.destinos).toEqual([
      "/financeiro/lancamentos?busca=pneu&pagina=1",
    ]);
  });

  it("CONTROLE: a URL mudando por fora troca o termo do campo", () => {
    // O voltar do navegador e um link colado caem no mesmo caminho do botao.
    navegador.query = "busca=cjjf";
    const { rerender } = render(<TelaComBuscaDebounced />);

    navegador.query = "busca=pneu";
    reagirANavegacao(rerender);

    expect(campoBusca().value).toBe("pneu");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // E sem renavegar: o campo obedeceu a URL, nao discutiu com ela.
    expect(navegador.destinos).toEqual([]);
  });
});
