import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataTable } from "@/components/canonicos/data-table";
import {
  FiltroBusca,
  FiltroSelect,
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
