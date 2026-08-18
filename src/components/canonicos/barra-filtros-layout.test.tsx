import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataTable } from "@/components/canonicos/data-table";
import {
  FiltroBusca,
  FiltroMes,
  FiltroPeriodo,
  FiltroSelect,
  FiltroValor,
  TRILHO_FILTRO,
  TRILHO_FILTRO_DUPLO,
} from "@/components/canonicos/filter-bar";

/**
 * Layout da barra de filtros, com as peças REAIS (DataTable canônico e os cinco
 * filtros canônicos). Só o router do Next e as Server Actions de preferência são
 * mockados, porque não existem fora de uma requisição.
 *
 * O que estes testes travam é o acordo visual da barra, e cada um deles falha se
 * a barra voltar ao que era:
 *
 * 1. todo filtro tem rótulo em cima, tirado do `rotulo` que o host já exige;
 * 2. nenhum filtro repete esse nome numa palavra cinza ao lado do campo;
 * 3. todo filtro mede um trilho ou dois, nunca a largura do próprio texto;
 * 4. as ações (limpar, menus de vista) não moram na fileira dos filtros.
 */

const navegador = vi.hoisted(() => ({ query: "" }));
const preferencia = vi.hoisted(() => ({ salva: null as string | null }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => undefined }),
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
  preferencia.salva = null;
});

afterEach(() => cleanup());

interface Linha {
  id: string;
  descricao: string;
}

const LINHAS: Linha[] = [{ id: "1", descricao: "Combustível" }];

/**
 * Tela com os cinco filtros canônicos, um de cada tipo. `mes` nasce preenchido
 * para o botão de limpar existir sem precisar de clique nenhum.
 */
function Tela({ mes = "2026-08" }: { mes?: string }) {
  return (
    <DataTable<Linha>
      idTabela="teste.layout"
      columns={[{ accessorKey: "descricao", header: "Descrição" }]}
      data={LINHAS}
      total={1}
      pageIndex={0}
      pageSize={25}
      onPaginationChange={() => undefined}
      onLimparFiltros={() => undefined}
      filtros={[
        {
          id: "busca",
          rotulo: "Busca",
          fixo: true,
          temValor: false,
          elemento: (
            <FiltroBusca
              valor=""
              onValorChange={() => undefined}
              placeholder="Buscar por número ou descrição"
            />
          ),
        },
        {
          id: "tipo",
          rotulo: "Tipo",
          temValor: false,
          elemento: (
            <FiltroSelect
              valor=""
              onValorChange={() => undefined}
              opcoes={[{ valor: "a_pagar", rotulo: "A pagar" }]}
              todosRotulo="Todos os tipos"
            />
          ),
        },
        {
          // Rótulo curto, "todos" comprido: é o par que fazia a barra virar
          // escada quando a largura vinha do texto.
          id: "centro",
          rotulo: "Centro de custo",
          temValor: false,
          elemento: (
            <FiltroSelect
              valor=""
              onValorChange={() => undefined}
              opcoes={[{ valor: "009", rotulo: "009 - BR-364" }]}
              todosRotulo="Todos os centros de custo"
            />
          ),
        },
        {
          id: "mes",
          rotulo: "Mês de referência",
          temValor: mes !== "",
          onLimpar: () => undefined,
          elemento: <FiltroMes valor={mes} onValorChange={() => undefined} />,
        },
        {
          id: "vencimento",
          rotulo: "Período de vencimento",
          temValor: false,
          elemento: (
            <FiltroPeriodo
              rotulo="Vencimento"
              de=""
              ate=""
              onPeriodoChange={() => undefined}
            />
          ),
        },
        {
          id: "valor",
          rotulo: "Faixa de valor",
          temValor: false,
          elemento: (
            <FiltroValor de="" ate="" onValorChange={() => undefined} />
          ),
        },
      ]}
    />
  );
}

/** A casca do filtro: o elemento que tem o rótulo e o controle dentro. */
function casca(rotulo: string): HTMLElement {
  const etiqueta = screen.getByText(rotulo);
  const pai = etiqueta.parentElement;
  if (pai === null) throw new Error(`rótulo "${rotulo}" sem casca`);
  return pai;
}

/** A fileira dos filtros: o elemento que tem as cascas dentro. */
function fileiraDosFiltros(): HTMLElement {
  const pai = casca("Tipo").parentElement;
  if (pai === null) throw new Error("casca sem fileira");
  return pai;
}

describe("layout da barra de filtros", () => {
  it("todo filtro visível mostra o próprio rótulo em cima do controle", () => {
    render(<Tela />);

    // Sem isto, filtro PREENCHIDO perde a dimensão: o seletor de status passava a
    // dizer só "A pagar", sem nenhuma pista de que aquilo era status.
    for (const rotulo of [
      "Busca",
      "Tipo",
      "Centro de custo",
      "Mês de referência",
      "Período de vencimento",
      "Faixa de valor",
    ]) {
      expect(screen.getByText(rotulo)).toBeTruthy();
    }
  });

  it("filtro de período não repete o nome numa palavra ao lado do campo", () => {
    render(<Tela />);

    // "Vencimento" era o rótulo cinza solto à esquerda dos dois campos de data,
    // que agora vive em cima como todos os outros. Repetir os dois deixaria o
    // nome duas vezes na mesma casca.
    expect(screen.getByText("Período de vencimento")).toBeTruthy();
    expect(screen.queryByText("Vencimento")).toBeNull();
    // O nome continua nomeando cada ponta para leitor de tela.
    expect(screen.getByLabelText("Vencimento: data inicial")).toBeTruthy();
    expect(screen.getByLabelText("Vencimento: data final")).toBeTruthy();
  });

  it("seletor mede um trilho, e não o texto da opção", () => {
    render(<Tela />);

    // O par que denunciava o problema: "Todos os tipos" e "Todos os centros de
    // custo" nasciam de larguras diferentes e nada da segunda linha caía embaixo
    // da coluna da primeira.
    expect(casca("Tipo").className).toContain(TRILHO_FILTRO);
    expect(casca("Centro de custo").className).toContain(TRILHO_FILTRO);
    expect(casca("Mês de referência").className).toContain(TRILHO_FILTRO);
  });

  it("filtro largo mede dois trilhos, para cair no mesmo prumo", () => {
    render(<Tela />);

    for (const rotulo of ["Busca", "Período de vencimento", "Faixa de valor"]) {
      expect(casca(rotulo).className).toContain(TRILHO_FILTRO_DUPLO);
    }
  });

  it("as ações da tabela ficam fora da fileira dos filtros", () => {
    render(<Tela />);

    const fileira = fileiraDosFiltros();
    // Elas eram irmãs dos filtros num `justify-between`, então grudavam no fim da
    // PRIMEIRA linha e os filtros quebravam por baixo delas.
    for (const nome of [/^Filtros/, /^Altura/, /^Colunas/, "Limpar filtros"]) {
      const botao = screen.getByRole("button", { name: nome });
      expect(fileira.contains(botao)).toBe(false);
    }
  });

  it("a busca da tabela entra na barra como campo rotulado, igual às outras", () => {
    render(
      <DataTable<Linha>
        idTabela="teste.layout.busca"
        columns={[{ accessorKey: "descricao", header: "Descrição" }]}
        data={LINHAS}
        searchKey="descricao"
        searchPlaceholder="Buscar por número ou descrição"
      />,
    );

    // A tabela tinha uma cópia própria do campo com lupa, que ficaria sendo o
    // único campo da barra sem rótulo e fora do trilho.
    expect(
      screen.getByPlaceholderText("Buscar por número ou descrição"),
    ).toBeTruthy();
    expect(casca("Busca").className).toContain(TRILHO_FILTRO_DUPLO);
  });
});
